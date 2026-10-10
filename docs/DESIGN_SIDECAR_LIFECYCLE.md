# Design: Sidecar Model Lifecycle & Idle Unload (F43)

## 1. Scope & Resident Candidates

The Python sidecar (`127.0.0.1:8765`, [main.py](file:///c:/My%20Personal%20Folders/Projects%20to%20work%20on/Antigravity%20Projects/Smart-Reader/sidecars/python/main.py)) hosts three neural models that currently remain resident indefinitely. Under multi-document import load, process RSS exceeds 6.7 GB with ~4.5 GB VRAM, causing memory thrashing and request timeouts.

| Model | Component | Resident Footprint | Unload? | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **PaddleOCR** (`ch_PP-OCRv4`) | `ocr/routes.py` | ~1.2 GB RAM (CPU) | **Yes** | Used only for scanned PDFs. Most sessions never touch OCR. |
| **BGE Reranker** (`v2-m3`) | `nlp/routes.py` | ~2.2 GB VRAM + 1.8 GB RAM | **Yes** | Used only during attribution arbitration in chapter synthesis. |
| **BGE-M3 Embedder** | `embed/routes.py` | ~2.1 GB VRAM + 1.5 GB RAM | **Yes** | Used on imports for retrieval. High value to evict during reading. |
| **Stateless Parsers** (fitz, docx, rtf) | `parse/routes.py` | <150 MB RAM | **No** | Pure CPU code, negligible footprint, zero GPU memory. |

---

## 2. Idle Detection

### Definition of Idle
Tracked **per-model**, not process-wide. A model is idle when:
1. `in_flight_requests == 0` for that model.
2. `(current_time - last_accessed_timestamp) >= idle_threshold_sec`.

### Thresholds & Configuration
| Variable | Model | Default | Rationale |
| :--- | :--- | :--- | :--- |
| `SIDECAR_IDLE_UNLOAD_ENABLED` | Master | `true` | Emergency toggle to force legacy resident behavior. |
| `SIDECAR_OCR_IDLE_SEC` | PaddleOCR | `300` (5m) | OCR is sporadic; evict quickly post-import. |
| `SIDECAR_RERANKER_IDLE_SEC` | Reranker | `600` (10m) | Synthesis batches pause between chapters; 10m prevents churn. |
| `SIDECAR_EMBED_IDLE_SEC` | BGE-M3 | `900` (15m) | High reload cost; preserve during multi-file import sessions. |

### Timer Mechanism
A single background daemon thread in `LifecycleManager` ticks every 10s. It evaluates registered models and triggers evictions when thresholds expire. Avoids per-model thread proliferation and ASGI middleware overhead.

---

## 3. Reload Strategy

- **Passive (On-Demand)**: If a request arrives while `UNLOADED`, the route acquires the lifecycle lock, transitions to `LOADING`, loads weights, and serves the request.
- **Active (Pre-Warming)**: Node client calls `POST /v1/lifecycle/warm?model={name}` before large batches (e.g., at the start of book slicing or synthesis).

```
Node Client                      Lifecycle Manager             PyTorch / CUDA
     |                                   |                           |
     |-- POST /v1/nlp/rerank ----------->|                           |
     |   (Model is UNLOADED)             |-- state -> LOADING ------>|
     |                                   |   load weights into VRAM  |
     |                                   |<-- weights ready (~12s) --|
     |<-- 200 OK (ranked results) -------|-- state -> LOADED --------|
```

### Latencies & UX
- **PaddleOCR**: ~2.5s | **BGE-M3**: ~10–12s | **BGE Reranker**: ~12–15s
If reload exceeds client timeout, sidecar returns HTTP `503` (`{"code": "MODEL_WARMING", "model": "reranker", "retry_after": 5}`). Node's `sidecarBase.js` intercepts this and pauses. UI displays *"Preparing AI models..."*.

---

## 4. In-Flight Safety & State Machine

```
       ┌───────────► UNLOADED ◄───────────┐
       │                  │               │
  Evict complete     load_model()    unload_model()
       │                  │               │
   UNLOADING ◄───────── LOADING ──────────┤
       ▲                  │               │
       │             Weights ready        │
       └─────────────── LOADED ───────────┘
```

- `UNLOADED`: Model is `None`; VRAM/RAM released.
- `LOADING`: Weight transfer/warmup in progress. Requests queue on thread lock.
- `LOADED`: Active inference permitted. `in_flight_requests` counter tracked.
- `UNLOADING`: Eviction in progress. Requires exclusive lock (`in_flight == 0`).

**Concurrency Rules**:
1. Request during UNLOAD: Blocks on lock until `UNLOADED`, then immediately starts `LOADING`.
2. Unload during Request: Aborted if `in_flight > 0`; idle timer resets.
3. No Cancellation: Reloads cannot be aborted mid-flight to avoid CUDA allocator corruption.

---

## 5. Failure Modes

1. **Reload OOM / CUDA Failure**: Caught on load. State reverts to `UNLOADED`. Returns `500 MODEL_LOAD_FAILED`. Node falls back to CPU embedder (for BGE-M3) or pauses job retry.
2. **Partial Unload**: References set to `None`, then `gc.collect()` and `torch.cuda.empty_cache()`. If CUDA throws, log warning, record `UNLOADED`, allow next request to re-allocate.
3. **Unload Errors**: Logged to `sys.stderr`; never crashes the FastAPI process.

---

## 6. Memory Accounting

- **Sidecar Baseline (0 models)**: ~180 MB RSS, 0 MB VRAM.
- **Peak Resident (all 3 models)**: ~6.7 GB RSS, ~4.5 GB VRAM.
- **Idle Post-Unload**: ~320 MB RSS, <150 MB VRAM (CUDA runtime context).
- **Net Reclaimed**: **~6.3 GB System RAM**, **~4.3 GB VRAM**.
- **Telemetry**: `GET /v1/lifecycle/status` exposes `rss_mb` (psutil), `cuda_allocated_mb`, and `cuda_reserved_mb`. Verification via `nvidia-smi` and `Get-Process`.

---

## 7. Interface

### Endpoints
- `GET /v1/lifecycle/status`: Returns per-model state, `idle_seconds`, `in_flight`, and memory stats.
- `POST /v1/lifecycle/warm?model={name}`: Proactively loads model (`ocr`|`embed`|`reranker`|`all`).
- `POST /v1/lifecycle/unload?model={name}`: Manually evicts model.
- `GET /v1/health`: Backward compatible (`{"status": "ok", "ready": bool}`). Appends `models` dict.

---

## 8. Testing Strategy

1. **Unit (`test_lifecycle.py`)**: Verify state transitions and eviction timer using 0.5s mock timeout. Ensure lock rejects unload during active inference.
2. **Integration (`sidecar_lifecycle_test.js`)**: Ingest book (loads embedder) → wait/force unload → query `/v1/lifecycle/status` (`UNLOADED`) → second import auto-reloads and verifies embeddings.
3. **Live Telemetry**: Validate VRAM/RSS drop via `nvidia-smi` and PowerShell.

---

## 9. OUT OF SCOPE

- **Dynamic Batch Sizing**: No adaptive batch sizing based on live VRAM.
- **Process Killing**: No killing or restarting Python process via OS/Tauri.
- **Cross-Process Semaphores**: No shared IPC locks with Node beyond HTTP.
- **Quantization Switching**: No runtime INT8/FP16 swapping.
- **Hardware-Aware Scheduling**: No F41 dynamic GPU capability queries.

---

## 10. Risks & Open Questions

| Item | Risk | Disposition |
| :--- | :--- | :--- |
| **CUDA Driver Fragmentation** | Windows WDDM driver may delay returning VRAM to OS. | **Proposed default**: `gc.collect()` + `torch.cuda.empty_cache()`. *Needs measurement* on Windows. |
| **Synthesis Timeout** | 15s cold reranker reload may breach client HTTP timeout. | **Proposed default**: Node pre-warms reranker at chapter start; client timeout set to 45s. |
| **PaddleOCR Thread Retention** | MKLDNN backend may retain worker threads post-deletion. | **Proposed default**: Delete engine instance. *Needs measurement* on Windows CPU. |

---

## 11. IMPLEMENTATION PHASES

1. **Phase 1: Core State Machine & Endpoints**: Implement `sidecars/python/common/lifecycle.py`, locking, memory reclamation, and `/v1/lifecycle/*` endpoints.
2. **Phase 2: Model Adapters**: Wire `ocr`, `nlp`, and `embed` routes into `LifecycleManager` with in-flight counters and lazy loaders.
3. **Phase 3: Daemon Tick & Configuration**: Add 10s eviction loop in `main.py`, wire environment variables, add unit tests.
4. **Phase 4: Node Client Pre-Warming**: Update `sidecarBase.js` to handle `503 MODEL_WARMING` and add proactive warming in `bookService` and `synthesisService`.

