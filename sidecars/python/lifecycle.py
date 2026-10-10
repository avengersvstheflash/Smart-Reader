# Layout Choice: Option 2 (sidecars/python/lifecycle.py at root).
# Rationale: sidecars/python/common.py is an existing file, not a directory.
# Option 2 avoids converting common.py into a package, avoiding any risk to existing imports.

import os
import atexit
import gc
import sys
import time
import inspect
import threading
from enum import Enum
from typing import Callable, Optional, Dict, Any



class ModelState(str, Enum):
    UNLOADED = "UNLOADED"
    LOADING = "LOADING"
    LOADED = "LOADED"
    UNLOADING = "UNLOADING"


class ModelRegistration:
    """Holds state, lifecycle hooks, and synchronization primitives for a managed model."""
    def __init__(
        self,
        name: str,
        load_fn: Optional[Callable] = None,
        unload_fn: Optional[Callable] = None,
        idle_ttl_sec: Optional[int] = None
    ):
        self.name = name
        self.state = ModelState.UNLOADED
        self.last_accessed_timestamp = time.time()
        self.in_flight_requests = 0
        self.load_fn = load_fn
        self.unload_fn = unload_fn
        # F43 Phase 2: Track configured idle timeout in seconds (used by eviction daemon in Phase 3)
        self.idle_ttl_sec = idle_ttl_sec
        # F43 Phase 2: Retain loaded engine/model instance across requests
        self.instance: Any = None
        self.lock = threading.RLock()


class ModelAcquisitionContext:
    """Context manager supporting both synchronous (`with`) and asynchronous (`async with`) blocks."""
    def __init__(self, manager: 'LifecycleManager', model_name: str):
        self.manager = manager
        self.model_name = model_name

    def __enter__(self):
        # F43 Phase 2: Return loaded model instance directly to the caller's context block
        return self.manager._enter_acquire(self.model_name)

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.manager._exit_acquire(self.model_name)
        return False

    async def __aenter__(self):
        # F43 Phase 2: Return loaded model instance directly to async caller's context block
        return self.manager._enter_acquire(self.model_name)

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.manager._exit_acquire(self.model_name)
        return False


class LifecycleManager:
    """
    Manages neural model lifecycles (unloaded, loading, loaded, unloading).
    Provides thread-safe state transitions, idle tracking, and memory reclamation.
    """
    def __init__(self, daemon_interval_sec: float = 10.0):
        self._models: Dict[str, ModelRegistration] = {}
        self._global_lock = threading.RLock()
        self._daemon_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._daemon_interval_sec = float(daemon_interval_sec)
        self._atexit_registered = False

    @property
    def models(self) -> Dict[str, ModelRegistration]:
        return self._models

    def register(
        self,
        model_name: Optional[str] = None,
        load_fn: Optional[Callable] = None,
        unload_fn: Optional[Callable] = None,
        *,
        name: Optional[str] = None,
        loader: Optional[Callable] = None,
        unloader: Optional[Callable] = None,
        idle_ttl_sec: Optional[int] = None
    ):
        """Registers a model for lifecycle tracking. Starts in UNLOADED state."""
        # F43 Phase 2: Support keyword parameters (name, loader, unloader, idle_ttl_sec)
        # matching model adapter registration across embed, ocr, and reranker
        target_name = name or model_name
        target_load = loader or load_fn
        target_unload = unloader or unload_fn
        if not target_name:
            raise ValueError("Model name must be specified.")
        with self._global_lock:
            self._models[target_name] = ModelRegistration(
                name=target_name,
                load_fn=target_load,
                unload_fn=target_unload,
                idle_ttl_sec=idle_ttl_sec
            )

    def is_registered(self, model_name: str) -> bool:
        return model_name in self._models

    def get_state(self, model_name: str) -> Optional[str]:
        if model_name not in self._models:
            return None
        return self._models[model_name].state.value

    def get_in_flight(self, model_name: str) -> int:
        if model_name not in self._models:
            return 0
        return self._models[model_name].in_flight_requests

    def is_busy(self, model_name: str) -> bool:
        if model_name not in self._models:
            return False
        info = self._models[model_name]
        with info.lock:
            return info.in_flight_requests > 0 or info.state in (ModelState.LOADING, ModelState.UNLOADING)

    def acquire(self, model_name: str) -> ModelAcquisitionContext:
        """
        Returns a context manager that ensures the model is LOADED and tracks active requests.
        Usable with `with manager.acquire(name):` or `async with manager.acquire(name):`.
        """
        if model_name not in self._models:
            raise KeyError(f"Model '{model_name}' is not registered.")
        return ModelAcquisitionContext(self, model_name)

    def _enter_acquire(self, model_name: str):
        if model_name not in self._models:
            raise KeyError(f"Model '{model_name}' is not registered.")
        
        info = self._models[model_name]
        with info.lock:
            if info.state == ModelState.UNLOADED:
                info.state = ModelState.LOADING
                try:
                    if info.load_fn is not None:
                        # F43 Phase 2: Save return value of loader to retain model instance
                        loaded = info.load_fn()
                        if loaded is not None:
                            info.instance = loaded
                    info.state = ModelState.LOADED
                except Exception:
                    info.instance = None
                    info.state = ModelState.UNLOADED
                    self._reclaim_memory()
                    raise
            elif info.state == ModelState.LOADING:
                # If currently loading by another thread, wait until transition completes
                pass

            if info.state != ModelState.LOADED:
                raise RuntimeError(f"Model '{model_name}' failed to load (state: {info.state.value}).")

            info.in_flight_requests += 1
            info.last_accessed_timestamp = time.time()
            # F43 Phase 2: Return loaded model instance to acquisition context
            return info.instance

    def _exit_acquire(self, model_name: str):
        if model_name not in self._models:
            return
        info = self._models[model_name]
        with info.lock:
            info.in_flight_requests = max(0, info.in_flight_requests - 1)
            info.last_accessed_timestamp = time.time()

    def warm(self, model_name: str) -> bool:
        """
        Transitions UNLOADED -> LOADED via load_fn. Idempotent if already LOADED.
        Returns True on success.
        """
        if model_name not in self._models:
            raise KeyError(f"Model '{model_name}' is not registered.")
        
        info = self._models[model_name]
        with info.lock:
            if info.state == ModelState.LOADED:
                info.last_accessed_timestamp = time.time()
                return True
            if info.state == ModelState.UNLOADED:
                info.state = ModelState.LOADING
                try:
                    if info.load_fn is not None:
                        # F43 Phase 2: Save return value of loader during warmup
                        loaded = info.load_fn()
                        if loaded is not None:
                            info.instance = loaded
                    info.state = ModelState.LOADED
                    info.last_accessed_timestamp = time.time()
                    return True
                except Exception:
                    info.instance = None
                    info.state = ModelState.UNLOADED
                    self._reclaim_memory()
                    raise
            return False

    def unload(self, model_name: str) -> bool:
        """
        Transitions LOADED -> UNLOADED only if in_flight == 0. Calls unload_fn.
        Returns True on transition, False if busy or already UNLOADED.
        """
        if model_name not in self._models:
            raise KeyError(f"Model '{model_name}' is not registered.")
        
        info = self._models[model_name]
        with info.lock:
            if info.state == ModelState.UNLOADED:
                return False
            if info.in_flight_requests > 0 or info.state == ModelState.LOADING:
                return False

            info.state = ModelState.UNLOADING
            try:
                if info.unload_fn is not None:
                    # F43 Phase 2: Pass model instance to unload hook if parameter accepted;
                    # protect against unloader exceptions crashing the sidecar per design spec section 5
                    try:
                        sig = inspect.signature(info.unload_fn)
                        if len(sig.parameters) >= 1:
                            info.unload_fn(info.instance)
                        else:
                            info.unload_fn()
                    except Exception as err:
                        print(f"[Lifecycle Error] Unload hook failed for '{model_name}': {err}", file=sys.stderr)
            finally:
                # F43 Phase 2: Clear model instance reference prior to memory reclamation
                info.instance = None
                self._reclaim_memory()
                info.state = ModelState.UNLOADED
                info.last_accessed_timestamp = time.time()
            return True

    def status(self) -> Dict[str, Any]:
        """
        Returns telemetry and status. Returns an empty dict if no models are registered.
        Otherwise returns per-model dictionary and memory statistics.
        """
        with self._global_lock:
            if not self._models:
                return {}

            now = time.time()
            models_dict = {
                name: {
                    "state": info.state.value,
                    "idle_seconds": round(now - info.last_accessed_timestamp, 2),
                    "in_flight": info.in_flight_requests,
                    "rss_mb": self._rss_mb(),
                }
                for name, info in self._models.items()
            }

            res = {
                "models": models_dict,
                "memory": {
                    "rss_mb": self._rss_mb(),
                    "cuda_allocated_mb": self._cuda_allocated_mb(),
                    "cuda_reserved_mb": self._cuda_reserved_mb(),
                }
            }
            # Expose top-level model keys for direct access
            for name, m_stat in models_dict.items():
                if name not in res:
                    res[name] = m_stat
            return res

    @property
    def daemon_interval_sec(self) -> float:
        """Returns the background daemon eviction tick interval in seconds."""
        return self._daemon_interval_sec

    @daemon_interval_sec.setter
    def daemon_interval_sec(self, interval_sec: float):
        """Sets the background daemon eviction tick interval in seconds (configurable for tests)."""
        self._daemon_interval_sec = float(interval_sec)

    def set_daemon_interval(self, interval_sec: float):
        """Sets the background daemon eviction tick interval in seconds (configurable for tests)."""
        self._daemon_interval_sec = float(interval_sec)

    def start_daemon(self):
        """
        Starts the background eviction tick daemon. Idempotent (no-op if thread alive).
        Spawns a daemon thread targeting _daemon_loop.
        """
        with self._global_lock:
            if self._daemon_thread is not None and self._daemon_thread.is_alive():
                return
            self._stop_event.clear()
            if not self._atexit_registered:
                atexit.register(self.stop_daemon)
                self._atexit_registered = True

            enabled = os.environ.get("SIDECAR_IDLE_UNLOAD_ENABLED", "true").strip().lower() not in ("false", "0", "no", "off")
            interval_str = f"{int(self._daemon_interval_sec)}s" if self._daemon_interval_sec.is_integer() else f"{self._daemon_interval_sec}s"
            print(f"[Lifecycle] Daemon started (interval={interval_str}, enabled={enabled})", flush=True)

            self._daemon_thread = threading.Thread(
                target=self._daemon_loop,
                name="LifecycleDaemon",
                daemon=True
            )
            self._daemon_thread.start()

    def stop_daemon(self, timeout: float = 5.0):
        """
        Signals the background daemon to stop, sets _stop_event, and joins the thread.
        """
        thread = None
        with self._global_lock:
            if self._daemon_thread is None or not self._daemon_thread.is_alive():
                return
            self._stop_event.set()
            thread = self._daemon_thread
            self._daemon_thread = None

        if thread is not None:
            thread.join(timeout=timeout)
        print("[Lifecycle] Daemon stopped", flush=True)

    def _daemon_loop(self):
        """
        Background loop ticking every _daemon_interval_sec.
        Evaluates registered models and evicts idle models whose idle_ttl_sec has expired.
        """
        while not self._stop_event.wait(self._daemon_interval_sec):
            try:
                enabled = os.environ.get("SIDECAR_IDLE_UNLOAD_ENABLED", "true").strip().lower() not in ("false", "0", "no", "off")
                if not enabled:
                    continue

                with self._global_lock:
                    model_items = list(self._models.items())

                for name, info in model_items:
                    try:
                        if info.state != ModelState.LOADED:
                            continue
                        if info.in_flight_requests > 0:
                            continue
                        idle_seconds = time.time() - info.last_accessed_timestamp
                        if info.idle_ttl_sec is not None and idle_seconds >= info.idle_ttl_sec:
                            rss_before = self._rss_mb()
                            cuda_before = self._cuda_allocated_mb()
                            evicted = self.unload(name)
                            if evicted:
                                rss_after = self._rss_mb()
                                cuda_after = self._cuda_allocated_mb()
                                idle_display = round(idle_seconds, 1)
                                print(
                                    f"[Lifecycle] Evicted '{name}' after {idle_display}s idle. "
                                    f"RSS: {rss_before}->{rss_after}MB, CUDA: {cuda_before}->{cuda_after}MB",
                                    flush=True
                                )
                    except Exception as model_err:
                        print(f"[Lifecycle Error] Eviction check failed for '{name}': {model_err}", file=sys.stderr, flush=True)
            except Exception as tick_err:
                print(f"[Lifecycle Error] Daemon tick error: {tick_err}", file=sys.stderr, flush=True)

    def _reclaim_memory(self):
        """Runs garbage collection and clears CUDA cache if torch is available."""
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def _rss_mb(self) -> float:
        """Returns process RSS in MB using psutil if available, else 0.0."""
        try:
            import psutil
            return round(psutil.Process().memory_info().rss / (1024 * 1024), 2)
        except Exception:
            return 0.0

    def _cuda_allocated_mb(self) -> float:
        """Returns CUDA allocated memory in MB if torch with CUDA is available, else 0.0."""
        try:
            import torch
            if torch.cuda.is_available():
                return round(torch.cuda.memory_allocated() / (1024 * 1024), 2)
        except Exception:
            pass
        return 0.0

    def _cuda_reserved_mb(self) -> float:
        """Returns CUDA reserved memory in MB if torch with CUDA is available, else 0.0."""
        try:
            import torch
            if torch.cuda.is_available():
                return round(torch.cuda.memory_reserved() / (1024 * 1024), 2)
        except Exception:
            pass
        return 0.0


# Shared singleton instance for sidecar runtime
lifecycle_manager = LifecycleManager()

