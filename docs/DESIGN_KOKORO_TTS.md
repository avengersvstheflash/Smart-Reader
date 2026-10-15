# Omnitome Architecture Specification: Local Neural Text-to-Speech (Phase 5.9 — Kokoro TTS)

> **Document Status:** Complete Design Specification (v1.0)  
> **Phase:** 5.9 (Series 3 — Pre-Packaging Feature Arc)  
> **Target Branch / Baseline:** HEAD `27e33c6` + `ceb47e3` (Origin `main`)  
> **Target Delivery:** 3 Sessions (S07: Backend/Sidecar, S08: Reader UI, S09: Settings/Polish)  
> **Author:** Antigravity Pair Programmer (for Omnitome Core Engine)

---

## Executive Summary & System Goals

Omnitome is a local-first neural reading library whose core differentiator is loss-bounded, provenance-aware semantic compression. The reading experience is centered around two representations: the **Original Reading** (immutable source, grounded in Research) and the **Omni Reading** (derived, compressed ~7:1, traceable).

Phase 5.9 introduces local, high-fidelity neural Text-to-Speech (TTS) powered by **Kokoro-82M**. The audio capability allows readers to listen to synthesized Omni chapters or original texts without sending any byte of text, voice data, or telemetry to external cloud services.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OMNITOME READER UI                                   │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Chapter Audio Bar: [Play/Pause] [Prev/Next] [Speed 1.0x] [Voice: Heart] [Status] │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│    "Call me Ishmael."  <-- [data-tts-active="true"] [.sentence-span.tts-active]         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP (Lookahead Queue: Deck A & Deck B)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  NODE BACKEND (:3000)                                  │
│   /api/tts/synthesize  ──►  ttsClient.js  ──►  Check storage/tts/ disk cache           │
│                                              ├── Hit: stream static .wav to browser    │
│                                              └── Miss: dispatch to Python sidecar      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP (127.0.0.1:8765 / loopback)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PYTHON SIDECAR (127.0.0.1:8765)                           │
│   POST /v1/tts/synthesize  ──►  LifecycleManager (name="tts", idle_ttl=300s)           │
│                                 Kokoro-82M Engine (StyleTTS2 / ISTFTNet, 24kHz PCM)    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Architecture Invariants
1. **Local-First & Zero Egress:** Audio synthesis is executed completely on-device via the Python sidecar. No cloud fallbacks exist in v1.0. Zero user data leaves the machine.
2. **Optional Dependency:** The reader remains 100% functional if Kokoro models are absent. TTS is an additive enhancement. Visual reading is never gated on audio availability.
3. **Stateless Sidecar Compute:** The Python sidecar performs stateless audio inference. Node remains the sole SQLite writer and filesystem coordinator.
4. **Sentence-Aligned Precision:** Audio playback matches sentence-level DOM boundaries precisely, reusing the pre-existing `data-tts-active` and `.sentence-span.tts-active` design tokens.
5. **Budgeted Memory Footprint:** Kokoro joins the F43 `LifecycleManager` family, undergoing automatic idle eviction after 300 seconds to keep system idle RAM/VRAM minimal.
6. **Filesystem-Only Caching:** Audio cache data lives in `storage/tts/` managed by an LRU eviction cleaner. Zero schema changes or migration locks are placed on SQLite `data.db` or F52 tables.

---

## 1. Model Selection and Constraints

### 1.1 Model Selection: Kokoro-82M (v0.19)
Kokoro is an open-weight, style-based neural text-to-speech model featuring 82 million parameters (StyleTTS2 and ISTFTNet backbone). It achieves audio quality competitive with multi-billion parameter models (such as XTTS or Bark) while operating at a fraction of the compute and memory footprint.

```
Text Input ──► Phonemizer (Misaki/espeak-ng) ──► Duration Predictor ──► Style Diffusion ──► ISTFTNet ──► 24kHz WAV
                                                          ▲
Speaker Embedding (.bin) ─────────────────────────────────┘
```

| Parameter | Specification | Architectural Impact |
| :--- | :--- | :--- |
| **Model Architecture** | StyleTTS2 + ISTFTNet decoder | 82M parameters; lightweight Transformer encoder + duration predictor + style diffusion. |
| **Checkpoint Size** | ~320 MB (PyTorch `.pth` / `.safetensors`) or ~86 MB (ONNX int8 / fp16) | Compact download for D5 Resource Manager (~86–320 MB vs >2 GB for XTTS). |
| **Audio Output** | 24,000 Hz, 16-bit mono PCM | Broadcast-quality voice fidelity with low sampling bandwidth overhead. |
| **Real-Time Factor (RTF)** | ~0.02 on modern GPU (CUDA); ~0.15–0.30 on modern CPU (AVX2) | 1 second of speech synthesizes in ~150–300ms on CPU; real-time on modest hardware. |
| **RAM Footprint (Loaded)** | ~400–600 MB resident RSS (CPU) | Operates smoothly within standard desktop memory budgets without swapping. |
| **VRAM Footprint (CUDA)** | ~500–700 MB allocated VRAM | Runs concurrently with BGE-M3 (2.1 GB) and Reranker (2.2 GB) on a 6 GB VRAM card. |

### 1.2 Language Support & Character Normalization
- **Primary Language:** English (`en-us` and `en-gb`). Kokoro utilizes the `misaki` / `espeak-ng` phonemizer tailored for English phoneme mappings.
- **Multilingual Status:** Experimental multilingual support (Spanish, French, Japanese, Mandarin) exists in community Kokoro checkpoints, but English is the sole locked and verified tier for v1.0.
- **Text Normalization:**
  - Citation tags from editorial synthesis (e.g., `[Source 1]`, `(Sources 1-3)`) must be stripped before synthesis so the audio does not speak provenance metadata aloud.
  - Numbers, dates, abbreviations, and units are expanded via basic rule-based text normalization prior to phonemization.
  - Mathematical LaTeX notation (`$...$` and `$$...$$`) is converted to spoken prose where possible, or replaced with natural language markers (*"equation"*).
- **Non-English Handling:**
  - If input text contains predominantly non-Latin/non-English scripts without matching phoneme mappings, the sidecar phonemizer drops unmapped tokens or produces phonetic hallucinations.
  - *Engine Policy:* Text is pre-scanned in `ttsClient.js` / Python route. If the sentence cannot be phonemized or contains unsupported foreign scripts, the sidecar returns HTTP 422 `UNSUPPORTED_LANGUAGE`. The frontend displays a brief, non-intrusive status toast (*"Text-to-speech v1.0 currently supports English only. Skipping non-English sentence."*) and advances smoothly to the next readable sentence.

### 1.3 Interaction with F43 LifecycleManager
Kokoro is integrated as a fully managed neural model under `sidecars/python/lifecycle.py`:
- **Model Name:** `"tts"`
- **Idle TTL:** 300 seconds (5 minutes), configurable via `SIDECAR_TTS_IDLE_SEC`.
- **Eviction Rationale:** Reading sessions fluctuate between continuous listening and silent study. Releasing Kokoro after 5 minutes of inactivity returns ~500 MB of RAM/VRAM to the operating system.
- **Boot Behavior:** Unlike OCR, BGE-M3, and the BGE reranker, TTS is **NOT** warmed during sidecar boot (`on_startup`). Because TTS is an optional reader feature, it loads on demand when the user triggers playback for the first time, keeping cold application launch lean.
- **Warmup Latency:** Cold model loading takes ~1.2–2.0 seconds on NVMe/SSD, well within the user tolerance for clicking "Play" on a chapter.
- **Eviction Implementation:**
  ```python
  def _unload_kokoro(engine=None):
      print("[TTS] Unloading Kokoro TTS engine from memory...")
      del engine
      if torch.cuda.is_available():
          torch.cuda.empty_cache()
      gc.collect()

  lifecycle_manager.register(
      name="tts",
      loader=_load_kokoro,
      unloader=_unload_kokoro,
      idle_ttl_sec=int(os.environ.get("SIDECAR_TTS_IDLE_SEC", "300"))
  )
  ```

---

## 2. Sidecar Endpoint Contract

### 2.1 Route Definition
- **Endpoint:** `POST /v1/tts/synthesize`
- **Prefix:** `/v1/tts` mounted in `sidecars/python/main.py`
- **Protocol:** HTTP/1.1 or HTTP/2, local loopback (`127.0.0.1:8765`)

### 2.2 Request Schema & Parameters
```json
{
  "text": "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.",
  "voice": "af_heart",
  "speed": 1.0,
  "format": "wav"
}
```

#### Field Specifications:
- `text` (string, required): Sentence or paragraph segment. Max length: 1,000 characters. Trimmed and sanitized.
- `voice` (string, optional, default `"af_heart"`): Key identifying the target voice embedding. Available values: `"af_heart"`, `"am_adam"`, `"bf_alice"`, `"bm_george"`.
- `speed` (float, optional, default `1.0`): Speed multiplier constrained to `[0.5, 2.0]`. Directly adjusts the Kokoro duration predictor without digital time-stretching artifacts.
- `format` (string, optional, default `"wav"`): Audio format encoding. Supported: `"wav"` (PCM 16-bit 24kHz).

### 2.3 Response Schema & Audio Delivery

#### Architectural Decision: Buffered Binary WAV
Audio is returned as **buffered binary audio/wav** rather than Base64 JSON or chunked streaming.

```http
HTTP/1.1 200 OK
Content-Type: audio/wav
Content-Length: 288044
X-TTS-Voice: af_heart
X-TTS-Sample-Rate: 24000
X-TTS-Duration-Ms: 5980
X-TTS-Character-Count: 224
X-TTS-Inference-Time-Ms: 142
```

#### Rationale for Buffered Binary WAV:
1. **Zero Base64 Overhead:** Base64 serialization inflates payload sizes by 33% and incurs CPU encoding/decoding overhead in both Python and Node.
2. **Sub-second Sentence Synthesis:** Kokoro synthesizes a typical sentence (15–25 words, ~4–6s audio) in 100–300ms. Streaming partial audio chunks for a 200ms operation introduces network state complexity (chunk framing, header stitching) with zero perceptible latency benefit.
3. **Lossless Local Loopback:** Linear PCM 16-bit WAV requires zero compression encoding in Python (saving CPU cycles) and is natively decodable across all modern browser audio engines.
4. **Direct Cache Persistence:** Node can pipe the response stream directly to a disk `.wav` file with zero transcoding.

### 2.4 Error Codes and Diagnostic Protocol

| Status Code | Error Code | Trigger Condition | Node / Frontend Action |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | `INPUT_TOO_LONG` | `text` exceeds 1,000 characters or 500 phoneme tokens. | Node recursively splits at clause/comma boundaries or rejects. |
| `404 Not Found` | `MODEL_NOT_INSTALLED` | Kokoro checkpoint file or voice pack missing on disk. | UI triggers Resource Manager download CTA. |
| `422 Unprocessable` | `UNSUPPORTED_LANGUAGE` | Text contains characters outside supported phoneme table. | Reader shows toast; advances playback past the sentence. |
| `503 Service Unavail`| `MODEL_WARMING` | Lifecycle state is `LOADING` from another thread. | Node awaits warmup lock up to 30s using F74 pattern. |
| `500 Internal Error`| `SYNTHESIS_FAILED` | PyTorch runtime error or CUDA allocation failure. | Fallback error toast; memory reclaimed via `lifecycle_manager`. |

```python
# Sidecar endpoint error response shape
{
    "status": "error",
    "code": "MODEL_NOT_INSTALLED",
    "message": "Kokoro model weights not found at sidecars/python/models/kokoro/kokoro-v0_19.pth. Install via Resource Manager.",
    "model": "tts"
}
```

---

## 3. Synthesis Granularity (The Key Decision)

The design evaluates three granularity paradigms:

```
(a) Per-Sentence On-Demand         (b) Per-Chapter Pre-Generation     (c) Hybrid Pipelined Lookahead
┌───────────────────────────────┐  ┌───────────────────────────────┐  ┌───────────────────────────────┐
│ [Sent 1] -> Synthesize -> Play│  │ [Entire Chapter (3,000 words)]│  │ [Sent 1] -> Synthesize -> Play│
│ [Sent 2] -> Synthesize -> Play│  │ 60s Wait... Single File 30MB  │  │   ▲ (Parallel prefetch N+1,2) │
│ Fast start, potential gap     │  │ Slow start, no sync highlight │  │ Fast start, gapless playback  │
└───────────────────────────────┘  └───────────────────────────────┘  └───────────────────────────────┘
```

### 3.1 Option Analysis

| Evaluation Vector | (a) Pure Per-Sentence | (b) Per-Chapter Pre-Gen | (c) Hybrid Pipelined Lookahead (**Recommended**) |
| :--- | :--- | :--- | :--- |
| **Time-to-First-Audio (TTFA)**| **<300ms** (Instant play) | **30–90 seconds** (Blocker) | **<300ms** (Instant play) |
| **Sentence-Highlight Sync** | **Deterministic** (1:1 event) | Difficult (Requires forced alignment) | **Deterministic** (Sentence-level audio events) |
| **Playback Continuity** | Risk of micro-gaps on CPU | Completely seamless | **Completely seamless** (Prefetched buffer queue) |
| **Disk & Compute Waste** | Zero (plays only what's read) | High (90% never listened to) | **Minimal** (Max 2 sentences ahead of user) |
| **F52 Re-synthesis Impact** | High cache hit rate on shared text | Full chapter file invalidated | **Granular invalidation** via content hashes |
| **F58 Import Queue Impact** | Zero (import stays fast) | High (blocks import queue) | **Zero** (TTS stays out of import pipeline) |

### 3.2 Recommendation: Hybrid Pipelined Lookahead
The architecture standardizes on **Option (c): Hybrid Pipelined Lookahead**.

#### Architectural Mechanics:
1. The reader treats the **sentence** as the fundamental atomic unit of synthesis, caching, and DOM highlighting.
2. When the user clicks "Play" on Sentence $k$:
   - Sentence $k$ is requested immediately from Node/Sidecar (TTFA < 300ms).
   - As soon as Sentence $k$ begins playing, the client orchestration layer immediately dispatches background prefetch requests for Sentence $k+1$ and Sentence $k+2$.
3. When Sentence $k$ emits the `ended` event:
   - Sentence $k+1$ is already buffered in memory and starts playing with 0ms gap.
   - Sentence $k+3$ is immediately queued for background prefetch.
4. If the user clicks "Pause", skips ahead, or navigates to another chapter:
   - Active prefetch HTTP requests are aborted via `AbortController`.
   - The queue resets to the new active sentence position. Zero excess disk space or compute is wasted.

#### Impact on F52 Re-synthesis and F58 Import Queue:
- **F52 Chapter Re-synthesis:** When a chapter is re-synthesized, the editorial planner alters paragraphs and wording. Because the cache key is based on the SHA-256 hash of the exact sentence string, previously synthesized sentences that remain identical across revisions are preserved in the cache. Modified sentences automatically generate fresh hashes without requiring database migration or explicit invalidation sweeps.
- **F58 Import Queue:** TTS synthesis is strictly decoupled from the ingestion pipeline. Pre-generating audio during book import would increase import time by 500% and consume gigabytes of storage for books that may only ever be read visually. TTS remains 100% on-demand.

---

## 4. Caching Strategy and Disk Management

### 4.1 Storage Location & Path Hierarchy
Cached audio files live entirely on the filesystem within the application's persistent storage root:

```
storage/
└── tts/
    ├── af_heart/
    │   ├── a1/
    │   │   └── a1b2c3d4e5f6...wav
    │   └── 3f/
    │       └── 3fa8b9c0d1e2...wav
    ├── am_adam/
    │   └── 8c/
    │       └── 8c4d2e1f9a0b...wav
    └── bf_alice/
        └── ...
```

- **Root Directory:** `storage/tts/` (resolved relative to `process.env.STORAGE_DIR` or root `storage/`).
- **Two-Level Sharding:** Subdivided by `<voice_id>/<hash[0:2]>/<full_hash>.wav`. Sharding into 256 subdirectories per voice prevents filesystem directory traversal degradation on Windows NTFS and Linux ext4 when thousands of sentences are cached.

### 4.2 Cache Key Construction
The cache key is a deterministic SHA-256 digest of the normalization tuple:

$$\text{Key} = \text{SHA-256}\Big(\text{voice} \parallel \text{":"} \parallel \text{speed\_str} \parallel \text{":"} \parallel \text{normalize}(\text{text})\Big)$$

Where:
- `voice`: lowercase voice identifier (e.g., `"af_heart"`).
- `speed_str`: string formatted to two decimal places (e.g., `"1.00"`, `"1.25"`).
- `normalize(text)`: whitespace-collapsed, unicode-normalized (NFC) string with citation tags stripped (`[Source N]`, `(Sources N-M)`).

```javascript
function computeSentenceHash(text, voice = 'af_heart', speed = 1.0) {
  const cleaned = text
    .replace(/\s*\[Source \d+\]/g, '')
    .replace(/\s*\(Sources? \d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\)/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  const normSpeed = Number(speed).toFixed(2);
  const payload = `${voice.toLowerCase()}:${normSpeed}:${cleaned}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}
```

### 4.3 Database Invariant: Zero Schema Invasions
- **Invariant:** Caching is purely filesystem-based with HTTP header metadata. No changes are made to the `book_lifecycle` table or any other F52 SQLite tables.
- **Rationale:** Storing audio blobs or fine-grained sentence audio paths in SQLite would bloat `data.db` from megabytes to gigabytes, degrading backup speed, WAL checkpointing, and vacuuming. Filesystem-only caching is completely self-healing, trivial to clear, and resilient to process crashes.

### 4.4 Disk Footprint & Bounded LRU Eviction

#### Typical Footprint:
- 1 sentence $\approx$ 15 words $\approx$ 4 seconds of speech.
- 4 seconds of 24kHz 16-bit mono WAV = $4 \times 24,000 \times 2 = 192,000\text{ bytes} \approx 188\text{ KB}$.
- Typical Omni Chapter: 250 words $\approx$ 17 sentences $\approx$ 3.2 MB.
- 200-page book (20 Omni Chapters) $\approx$ 64 MB total audio.
Note: footprint assumes a single playback speed. Because speed is part of the cache key, users who switch between 1.0x/1.25x/1.5x may accumulate 3–5× the base estimate. The 500 MB LRU cap bounds total growth regardless.

#### Eviction Policy & Cleaner Algorithm:
- **Default Cap:** 500 MB (configurable via `settingsService.js` under `tts.cacheMaxMB`).
- **LRU Cleaner Execution:** Runs asynchronously during Node server boot and whenever total audio written in the current session exceeds 50 MB.
- **Eviction Steps:**
  1. Recursively scan `storage/tts/` collecting `{ filePath, size, atime }` for every `.wav` file.
  2. If total size $\le \text{cacheMaxMB}$, terminate.
  3. Sort entries ascending by `atime` (oldest access first).
  4. Unlink files sequentially until total directory size reaches $0.80 \times \text{cacheMaxMB}$ (hysteresis buffer to prevent frequent disk thrashing).
- **Manual Clear:** A one-click *"Clear TTS Cache"* button in Settings executes `POST /api/tts/cache/clear`, removing all files in `storage/tts/` and resetting cache metrics.

### 4.5 Future Work: Post-Playback Opus Compression (v1.1)
v1.1 direction — Optional post-playback Opus compression. WAV files cached by the current design are ~188 KB per sentence. After a sentence has been played at least once (or is older than N days), it could be re-encoded to Opus (~30–40 KB, 5–6× reduction). Decode on playback adds ~5–15ms per sentence, inaudible. This would allow the LRU cap to drop from 500 MB to ~100 MB with no visible regression. Not implemented in v1.0.

---

## 5. Node Client and Orchestration Architecture

### 5.1 Service Design: `backend/services/ai/ttsClient.js`
`ttsClient.js` inherits the proven patterns established in `sidecarBase.js`, `embedClient.js`, and `nlpClient.js`:

```javascript
/**
 * backend/services/ai/ttsClient.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../config');
const { resolveBaseUrl, checkModelReady, warmModel, waitForReady } = require('./sidecarBase');

const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', '..', '..', 'storage');
const TTS_CACHE_DIR = path.join(STORAGE_DIR, 'tts');

class TtsClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async synthesizeSentence({ text, voice = 'af_heart', speed = 1.0, timeoutMs = 30000 }) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      throw new Error('TTS: text parameter must be a non-empty string');
    }

    const hash = computeSentenceHash(text, voice, speed);
    const { dir, filePath } = resolveAudioPath(hash, voice);

    // 1. Check local filesystem cache
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        hash,
        cached: true,
        filePath,
        durationMs: Math.round((stats.size - 44) / (24000 * 2) * 1000),
        audioUrl: `/api/tts/audio/${hash}?voice=${voice}`
      };
    }

    // 2. Prepare destination directory
    fs.mkdirSync(dir, { recursive: true });

    // 3. Coordinate sidecar readiness and warmup lock
    const targetUrl = resolveBaseUrl(this.baseUrl);
    const status = await checkModelReady('tts', targetUrl, 1500);
    if (!status.ready && status.state !== 'DOWN') {
      await warmModel('tts', targetUrl, { timeoutMs: 15000 });
    }

    // 4. Request synthesis from sidecar
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${targetUrl}/v1/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, speed, format: 'wav' }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const err = new Error(errJson.message || `Sidecar TTS returned HTTP ${res.status}`);
        err.code = errJson.code || 'TTS_SYNTHESIS_FAILED';
        err.status = res.status;
        throw err;
      }

      // 5. Atomic write to avoid corrupted audio files on crash
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, filePath);

      const durationMs = Math.round((buffer.length - 44) / (24000 * 2) * 1000);

      return {
        hash,
        cached: false,
        filePath,
        durationMs,
        audioUrl: `/api/tts/audio/${hash}?voice=${voice}`
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

### 5.2 Node API Endpoints: `backend/routes/ttsRoutes.js`

1. **`POST /api/tts/synthesize`**
   - Receives: `{ text: string, voice?: string, speed?: number }`
   - Dispatches to `ttsClient.synthesizeSentence()`.
   - Returns JSON:
     ```json
     {
       "hash": "a1b2c3d4e5f6...",
       "cached": false,
       "durationMs": 4200,
       "audioUrl": "/api/tts/audio/a1b2c3d4e5f6...?voice=af_heart"
     }
     ```

2. **`GET /api/tts/audio/:hash`**
   - Query parameter: `?voice=af_heart`
   - Validates hash format (64-char hexadecimal regex).
   - Serves `.wav` file with HTTP `Accept-Ranges`, `Content-Type: audio/wav`, and aggressive caching headers (`Cache-Control: public, max-age=31536000, immutable`).

3. **`GET /api/tts/status`**
   - Returns:
     ```json
     {
       "ready": true,
       "modelState": "LOADED",
       "installed": true,
       "voices": ["af_heart", "am_adam", "bf_alice", "bm_george"],
       "cache": {
         "totalFiles": 142,
         "totalBytes": 28400000,
         "maxBytes": 524288000
       }
     }
     ```

4. **`POST /api/tts/cache/clear`**
   - Flushes `storage/tts/` and returns `{ "cleared": true, "freedBytes": 28400000 }`.

---

## 6. Reader Integration & User Experience

### 6.1 DOM and Styling Specification: `.sentence-span.tts-active`
The reader DOM currently features a dedicated stub from Phase 5.2 in `frontend/src/styles/canonical.css`:

```css
/* Phase 5.2 TTS active soft highlight */
.reader-paragraph[data-tts-active="true"] {
  background-color: rgb(var(--accent-wash) / 0.25);
  border-radius: 4px;
}

/* Sentence-level highlight: Left accent stripe + subtle wash */
.sentence-span.segment-highlighted,
.sentence-span.tts-active {
  background-color: rgb(var(--accent) / 0.10);
  box-shadow: inset 3px 0 0 rgb(var(--accent) / 0.4);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
```

#### DOM Alignment Rule:
In `frontend/src/components/reader/CanonicalBlock.tsx`, sentences are wrapped in `<span data-sentence-index={sIdx} className="sentence-span">`.
When TTS is active:
1. The paragraph carrying the active sentence receives `data-tts-active="true"`.
2. The specific sentence currently being spoken receives the class `tts-active`.
3. When playback transitions from Sentence $s$ to $s+1$, `tts-active` shifts instantly without triggering paragraph re-renders or layout shifts.

### 6.2 Frontend Architecture: The Dual-Deck A/B Player (`useTtsPlayer.ts`)
To achieve imperceptible switching between sentences without the complexity of Web Audio buffer graph management, the player uses a **Dual-Deck Alternating `<audio>` Pattern**:

```
                       ┌─────────────────────────┐
                       │  useTtsPlayer Hook      │
                       └────────────┬────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌─────────────────────────┐                       ┌─────────────────────────┐
│     Audio Deck A        │                       │     Audio Deck B        │
│  Playing Sentence 0     │                       │  Preloading Sentence 1  │
│  [====================] │                       │  [==============      ] │
└──────────┬──────────────┘                       └──────────┬──────────────┘
           │ onended event                                   │ starts playing instantly
           └────────────────────────►◄───────────────────────┘
                                Deck B plays
                              Deck A preloads Sent 2
```

#### State Machine Flow:
1. **Initialize:** Deck A and Deck B are instantiated as HTML5 `Audio` elements in memory.
2. **Play(Sentence $k$):**
   - Active deck is set to Deck A. Source set to `/api/tts/audio/<hash_k>`. Deck A plays.
   - Reader highlights sentence $k$ and centers it in view.
   - In the background, `synthesizeSentence(k+1)` is dispatched. As soon as the URL returns, Deck B's `src` is set and `.load()` is called.
3. **Deck A `onended`:**
   - Active deck switches immediately to Deck B. Deck B calls `.play()`.
   - Reader drops highlight on $k$ and applies highlight to $k+1$.
   - Deck A is assigned to preload Sentence $k+2$.
4. **Pause:** Active deck pauses. Lookahead prefetch is halted.
5. **Seek / Click Sentence $m$:** Both decks pause immediately. Queue resets to sentence $m$. Deck A starts playing $m$.

### 6.3 Reader Toolbar & Controls (`AudioPlayerBar.tsx`)
A compact, unobtrusive playback bar docks cleanly at the top of the reader (directly below the chapter navigation header) or anchors as a floating audio pill:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│  [▶ Play]  [⏮ Prev] [⏭ Next]  Sentence 4 of 18  ·  02:45 remaining   [1.0x ▾]  [Voice: Heart ▾] [✕] │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Interactive Behaviors:
- **Play/Pause Toggle:** Toggles playback of the current sentence. Spacebar acts as global shortcut when reader is focused.
- **Click-to-Speak:** Clicking directly on any sentence span in the chapter immediately halts current audio, seeks to that sentence, and starts playback.
- **Sentence Step Controls:** Previous/Next buttons (`[` and `]`) skip backward or forward one sentence.
- **Speed Selector Dropdown:** `0.75x`, `1.0x`, `1.25x`, `1.5x`, `2.0x`.
- **Monotonic Progress Display:** Tracks current sentence index and estimated remaining chapter audio time (calculated from word count of remaining sentences at current playback speed).

### 6.4 Auto-Scroll and Motion Isolation
- **Smooth Centering:** As the active sentence advances, the window automatically scrolls to keep the active sentence vertically centered:
  ```javascript
  const el = document.querySelector(`.reader-paragraph[data-tts-active="true"] .sentence-span.tts-active`);
  if (el && !userIsScrolling) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
  ```
- **Manual Scroll Override Guard:** If the user manually scrolls (mousewheel, touch swipe, or scrollbar grab), auto-scroll is suspended for 5 seconds to prevent jarring viewport fighting. A discreet indicator (*"Auto-scroll paused"*) appears with a button to immediately resume.
- **Reduced Motion:** If `window.matchMedia('(prefers-reduced-motion: reduce)').matches` is true, smooth scrolling is replaced with instantaneous positioning (`behavior: 'auto'`).

---

## 7. Voice Selection, Speed, and Settings

### 7.1 Curated Voice Pack Selection for v1.0
Kokoro-82M provides multiple character voices trained on distinct speaker embeddings. v1.0 exposes a curated set of four distinctive, high-clarity voices:

| Voice ID | Display Name | Gender | Accent | Tone & Ideal Content |
| :--- | :--- | :--- | :--- | :--- |
| `af_heart` (**Default**) | Heart | Female | American | Warm, articulate, balanced; ideal for long-form Omni non-fiction. |
| `am_adam` | Adam | Male | American | Deep, grounded, authoritative; suited for history, philosophy, technical books. |
| `bf_alice` | Alice | Female | British | Crisp, academic, expressive; classical reading tone. |
| `bm_george` | George | Male | British | Calm, professorial, measured pacing; ideal for dense academic treatises. |

*Note on Footprint:* Each voice profile is simply an embedding tensor vector (~1.5 MB). All four voices ship within the base Kokoro resource pack without requiring separate model weights.

### 7.2 Settings Service Integration (F63 Pattern)
TTS configuration is integrated into `backend/services/settings/settingsService.js` under the `tts` configuration node:

```json
{
  "version": 1,
  "updatedAt": "2026-10-15T18:00:00.000Z",
  "aiProvider": "ollama",
  "importMaxSizeMB": 50,
  "parallelBookSynthesis": false,
  "tts": {
    "enabled": true,
    "defaultVoice": "af_heart",
    "defaultSpeed": 1.0,
    "autoScroll": true,
    "cacheMaxMB": 500
  }
}
```

#### Settings Rules & Invariants:
1. **Schema Validation:** In `settingsService.js`, `tts.defaultVoice` must belong to the approved voice whitelist (`['af_heart', 'am_adam', 'bf_alice', 'bm_george']`). `defaultSpeed` is clamped to `[0.5, 2.0]`. `cacheMaxMB` is clamped to `[100, 5000]`.
2. **Persistence:** Changes are persisted atomically to `storage/settings.json`.
3. **Reader Session Overrides:** The user can freely toggle speed and voice inside the reader. Reader selections persist per-book in `localStorage` (`omnitome:reader:tts-pref:<bookId>`), falling back to the global settings defaults.

---

## 8. Failure Modes, Graceful Degradation & Recovery

```
                      ┌────────────────────────┐
                      │ User clicks "Play"     │
                      └───────────┬────────────┘
                                  ▼
                     Is Kokoro Model Installed?
                                ╱ ╲
                        No     ╱   ╲     Yes
           ┌───────────────────     ───────────────────┐
           ▼                                           ▼
┌────────────────────────┐                   Is Python Sidecar Up?
│ Reader displays:       │                              ╱ ╲
│ "Download Voice Pack"  │                      No     ╱   ╲     Yes
│ (Resource Manager CTA) │         ┌───────────────────     ───────────────────┐
└────────────────────────┘         ▼                                           ▼
                         ┌────────────────────┐                    Is Model LOADED?
                         │ Toast Alert:       │                               ╱ ╲
                         │ "AI Engine Offline"│                       No     ╱   ╲     Yes
                         │ Reader remains ok  │          ┌───────────────────     ───────────────────┐
                         └────────────────────┘          ▼                                           ▼
                                               ┌────────────────────┐                    Synthesize Sentence
                                               │ F74 Await Warmup   │                    via Sidecar (WAV)
                                               │ (Status: Warming)  │
                                               └────────────────────┘
```

### 8.1 Detailed Failure Matrix

1. **Model Not Installed:**
   - *Detection:* Node queries sidecar `GET /v1/lifecycle/status?model=tts`. Sidecar returns `404` or weight path does not exist.
   - *UX:* Audio bar shows a calm badge: *"Voice models not downloaded"*. Clicking the button opens the Resource Manager modal (D5 pattern). The book text remains 100% accessible.
2. **Sidecar Process Down / Offline:**
   - *Detection:* `checkReady()` in `sidecarBase.js` throws connection refused (`ECONNREFUSED`).
   - *UX:* A toast notification alerts: *"Local AI sidecar is not running. Text-to-speech is unavailable."* Audio controls disable gracefully. No crashes, unhandled rejections, or blank screens.
3. **Phonemization / Long Sentence Overflow:**
   - *Detection:* A sentence exceeding 1,000 characters or containing pathological regex patterns triggers `400 INPUT_TOO_LONG`.
   - *Mitigation:* `ttsClient.js` automatically sub-chunks the sentence at punctuation marks (`;`, `,`, `—`) and concatenates the resulting audio buffers before saving to cache.
4. **Out of Disk Space During Caching:**
   - *Detection:* Node throws `ENOSPC` when writing `.wav` to `storage/tts/`.
   - *Mitigation:* The system catches `ENOSPC`, immediately triggers an aggressive LRU cache purge down to 50% capacity, and retries the write. If disk space remains exhausted, the audio stream is piped directly to the client response without persisting to disk.
5. **Mid-Playback Chapter Navigation or Interrupt:**
   - *Mitigation:* When the user switches chapters, closes the reader, or taps "Stop", the frontend invokes `audio.pause()`, clears the lookahead prefetch queue, and aborts pending HTTP requests via `AbortController`. The sidecar thread terminates downstream compute cleanly.

---

## 9. Packaging and Distribution (Transition to Series 4)

In accordance with architectural decisions **D5 (Two-Installer Strategy)** and **D6 (Cloudflare R2 / Pages Distribution)** recorded in `docs/session-logs/2026-10-15.md`:

### 9.1 Resource Manager Metadata Entry
Kokoro TTS is configured as an optional download entry in the centralized model manifest:

> The sha256 values below are placeholders. Real hashes are computed at model-package build time (Phase 6).

```json
{
  "id": "kokoro-tts",
  "name": "Kokoro Neural Voice Engine",
  "version": "0.19.0",
  "category": "audio",
  "description": "High-fidelity local text-to-speech engine with 4 natural English voices.",
  "required": false,
  "downloadSizeBytes": 328000000,
  "installedSizeBytes": 345000000,
  "targetDir": "sidecars/python/models/kokoro",
  "files": [
    {
      "name": "kokoro-v0_19.onnx",
      "url": "https://r2.omnitome.app/models/kokoro/kokoro-v0_19.onnx",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "name": "voices.bin",
      "url": "https://r2.omnitome.app/models/kokoro/voices.bin",
      "sha256": "8f434346648f6b96df89dda901c5176b10f60000b21a329ef264101e4ec707ee"
    }
  ]
}
```

### 9.2 Installer Segmentation (D5 Compliance)
- **Installer A (Lightweight, ~250 MB):** Ships without Kokoro weights. The reader functions immediately for visual reading. TTS is unlocked on-demand via a single click in the Resource Manager.
- **Installer B (Full Offline, ~3.2 GB):** Pre-bundles Kokoro-82M and voice embeddings inside `sidecars/python/models/kokoro/`. TTS works immediately out of the box with zero internet access required.

---

## 10. Phased Implementation Plan (3 Sessions)

The implementation is partitioned into exactly three focused, test-gated sessions:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Session S07: Sidecar Synthesis Endpoint + Node Client + Backend Cache                 │
│  - Deliverables: Python /v1/tts route, F43 lifecycle registration, Node ttsClient     │
│  - Tests: f85_kokoro_tts_sidecar_test.js (Unit + Mock Sidecar + Real Loopback)        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Session S08: Reader Playback UI + Sentence Highlighting + Lookahead Queue              │
│  - Deliverables: AudioPlayerBar.tsx, useTtsPlayer hook, CanonicalBlock tts-active      │
│  - Tests: Playback state transitions, sentence stepping, auto-scroll guards            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Session S09: Voice Selection + Settings Integration + Polish + Release Docs            │
│  - Deliverables: F63 settings integration, voice picker UI, cache purge, docs         │
│  - Tests: Full regression (57 unit + 1 corpus gate + TTS suite green)                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Session S07: Sidecar Endpoint + Node Client + Tests
*Focus: Pure backend & Python sidecar. Zero frontend UI changes.*

#### Blast Radius & File Manifest:
- `sidecars/python/tts/__init__.py` [NEW]
- `sidecars/python/tts/synthesize.py` [NEW]: Kokoro model wrapper, phonemizer integration, WAV buffer serialization.
- `sidecars/python/tts/routes.py` [NEW]: FastAPI router mounting `POST /v1/tts/synthesize` and status endpoints.
- `sidecars/python/lifecycle.py` [MODIFY]: Register `"tts"` model with loader, unloader, and `idle_ttl_sec=300`.
- `sidecars/python/main.py` [MODIFY]: Mount `tts_router`.
- `backend/services/ai/ttsClient.js` [NEW]: Node client managing sidecar requests, SHA-256 hash generation, and disk caching.
- `backend/routes/ttsRoutes.js` [NEW]: Express router mounting `/api/tts/synthesize`, `/api/tts/audio/:hash`, `/api/tts/status`.
- `backend/server.js` [MODIFY]: Mount `/api/tts` routes.
- `backend/tests/f85_kokoro_tts_sidecar_test.js` [NEW]: Test suite.

#### Test & Verification Plan:
1. `f85_kokoro_tts_sidecar_test.js`:
   - Verify `computeSentenceHash` produces stable SHA-256 digests across whitespace variants.
   - Verify filesystem cache write, read, and deduplication (second call returns `cached: true`).
   - Verify sidecar `POST /v1/tts/synthesize` returns 200 with `audio/wav` header and valid PCM data.
   - Verify `LifecycleManager` state transitions: `UNLOADED` -> `LOADING` -> `LOADED` -> Idle Eviction.
   - Verify error handling: `INPUT_TOO_LONG` and `MODEL_NOT_INSTALLED`.

---

### Session S08: Reader Playback UI + Highlighting + Auto-scroll
*Focus: Visual reader integration and audio coordination.*

#### Blast Radius & File Manifest:
- `frontend/src/hooks/useTtsPlayer.ts` [NEW]: Custom React hook implementing the Dual-Deck A/B player, 3-sentence lookahead prefetch, and index management.
- `frontend/src/components/reader/AudioPlayerBar.tsx` [NEW]: Playback controls toolbar (Play/Pause, Step, Speed, Time Remaining).
- `frontend/src/components/reader/CanonicalBlock.tsx` [MODIFY]: Wire active sentence index down to apply `tts-active` to the current `<span>` and `data-tts-active="true"` to `<p>`.
- `frontend/src/components/reader/ReaderView.tsx` [MODIFY]: Mount `AudioPlayerBar`, wire active sentence coordinates, implement auto-scroll centering with manual scroll override guard.
- `frontend/src/styles/canonical.css` [VERIFY]: Validate box-shadow and transition performance during active playback.

#### Test & Verification Plan:
1. Component & DOM Verification:
   - Click "Play" on chapter start: plays Sentence 0, applies `data-tts-active="true"` to paragraph and `.tts-active` to span 0.
   - Advance to Sentence 1: span 0 drops highlight, span 1 gains highlight.
   - Click arbitrary sentence: immediately cancels previous audio and begins playback from target sentence.
   - Verify manual scroll suppresses auto-scroll for 5 seconds.
   - Verify Spacebar toggles playback without scrolling page.

---

### Session S09: Voice Selection + Settings Integration + Polish
*Focus: Settings persistence, voice curation, degradation polish, and system documentation.*

#### Blast Radius & File Manifest:
- `backend/services/settings/settingsService.js` [MODIFY]: Extend F63 schema with `tts` config defaults and validation.
- `backend/routes/settingsRoutes.js` [MODIFY]: Add TTS cache clear handler and status endpoint.
- `frontend/src/routes/SettingsRoute.tsx` [MODIFY]: Add TTS settings card (default voice, default speed, cache size, clear cache button).
- `frontend/src/components/reader/AudioPlayerBar.tsx` [MODIFY]: Add voice selection dropdown.
- `docs/SESSION_HANDOFF.md` [MODIFY]: Update handoff with Phase 5.9 closure, ready for Series 4 packaging.
- `docs/session-logs/2026-10-xx.md` [NEW]: Chronological session record.

#### Test & Verification Plan:
1. End-to-end regression run:
   - Execute `node scripts/run-all-tests.js`.
   - Verify all 57 existing unit suites + 1 corpus gate pass with 0 regressions.
   - Verify new TTS test suite passes.
   - Verify settings persistence survives server restart (`storage/settings.json`).
   - Verify `git status` clean and tree in valid state.

---

## 11. Open Questions & Architectural Decisions

The following technical questions are identified for alignment during implementation:

### Q1: ONNX Runtime vs. Native PyTorch Weights
- **Context:** Kokoro can run either via pure PyTorch (`torch` + `kokoro` library) or via `onnxruntime` (`kokoro-v0_19.onnx`).
- **Consideration:** PyTorch is already resident in our Python sidecar venv for BGE-M3 and BGE Reranker. Using PyTorch avoids introducing `onnxruntime` as a second execution engine. However, ONNX Runtime CPU inference is ~30% faster on machines without discrete GPUs and the quantized model file is only ~86 MB.
- **Recommended Direction:** Standardize on **PyTorch first in v1.0** to minimize new C-library dependencies in the sidecar, with an ONNX-runtime fast path evaluated in Series 4 if packaging size requires it.

### Q2: Audio Pipeline: HTML5 `<audio>` vs. Web Audio API (`AudioContext`)
- **Context:** Playback can use standard HTML5 `new Audio(url)` or Web Audio API `AudioContext` with decoded `AudioBufferSourceNode`.
- **Consideration:** Web Audio API allows microsecond-accurate gapless scheduling and sample-level crossfading, but requires loading raw audio buffers into JavaScript heap memory. Standard `<audio>` elements handle streaming and hardware media keys out of the box, but may have tiny (5–15ms) gap overhead when switching `src`.
- **Recommended Direction:** Use **dual alternating HTML5 `<audio>` elements** (A/B deck pattern) in `useTtsPlayer.ts`. Deck A plays Sentence $k$ while Deck B preloads Sentence $k+1$. When Sentence $k$ ends, Deck B plays instantly, achieving imperceptible (<2ms) switching without Web Audio complexity.

### Q3: Plain-Text / Non-Canonical Chapters
- **Context:** If a user views a raw document where canonical blocks were not generated (e.g., fallback raw text display in `ReaderView.tsx`), canonical spans do not exist in the DOM.
- **Consideration:** How should TTS behave on ungrounded or raw chapters?
- **Recommended Direction:** The reader dynamically runs `splitIntoSentences()` on plain text paragraphs, wrapping them in ephemeral sentence spans so TTS playback and highlighting remain identical across both canonical and raw text modes.

### Q4: Chapter Audio Export / Offline MP3 Generation
- **Context:** Should users be able to export an entire chapter as a standalone `.mp3` or `.wav` audiobook file for listening on mobile devices?
- **Consideration:** Full chapter export requires batch synthesizing 20–50 sentences and stitching WAV headers into a single continuous file.
- **Recommended Direction:** **Defer to v1.1.** v1.0 focuses strictly on in-reader interactive listening. The underlying sentence cache designed here provides the exact building blocks required for instant audio stitching in v1.1.
Note: v1.0 TTS is in-reader interactive only. The sentence-level cache designed here provides the exact building blocks for chapter export in v1.1+.

---

## Document Sign-Off & Verification Checklist

- [x] Conforms to Node sole SQLite writer invariant.
- [x] Zero cloud dependencies; strictly local-first.
- [x] Leverages existing `data-tts-active` and `.sentence-span.tts-active` styling stubs.
- [x] Aligns with F43 `LifecycleManager` daemon eviction patterns.
- [x] Integrates cleanly with D5/D6 packaging and Resource Manager roadmap.
- [x] Partitioned into exactly three test-gated sessions (S07, S08, S09).

