# Layout Choice: Option 2 (sidecars/python/lifecycle.py at root).
# Rationale: sidecars/python/common.py is an existing file, not a directory.
# Option 2 avoids converting common.py into a package, avoiding any risk to existing imports.

import gc
import sys
import time
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
    def __init__(self, name: str, load_fn: Optional[Callable] = None, unload_fn: Optional[Callable] = None):
        self.name = name
        self.state = ModelState.UNLOADED
        self.last_accessed_timestamp = time.time()
        self.in_flight_requests = 0
        self.load_fn = load_fn
        self.unload_fn = unload_fn
        self.lock = threading.RLock()


class ModelAcquisitionContext:
    """Context manager supporting both synchronous (`with`) and asynchronous (`async with`) blocks."""
    def __init__(self, manager: 'LifecycleManager', model_name: str):
        self.manager = manager
        self.model_name = model_name

    def __enter__(self):
        self.manager._enter_acquire(self.model_name)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.manager._exit_acquire(self.model_name)
        return False

    async def __aenter__(self):
        self.manager._enter_acquire(self.model_name)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.manager._exit_acquire(self.model_name)
        return False


class LifecycleManager:
    """
    Manages neural model lifecycles (unloaded, loading, loaded, unloading).
    Provides thread-safe state transitions, idle tracking, and memory reclamation.
    """
    def __init__(self):
        self._models: Dict[str, ModelRegistration] = {}
        self._global_lock = threading.RLock()

    @property
    def models(self) -> Dict[str, ModelRegistration]:
        return self._models

    def register(self, model_name: str, load_fn: Optional[Callable] = None, unload_fn: Optional[Callable] = None):
        """Registers a model for lifecycle tracking. Starts in UNLOADED state."""
        with self._global_lock:
            self._models[model_name] = ModelRegistration(
                name=model_name,
                load_fn=load_fn,
                unload_fn=unload_fn
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
                        info.load_fn()
                    info.state = ModelState.LOADED
                except Exception:
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
                        info.load_fn()
                    info.state = ModelState.LOADED
                    info.last_accessed_timestamp = time.time()
                    return True
                except Exception:
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
                    info.unload_fn()
            finally:
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

