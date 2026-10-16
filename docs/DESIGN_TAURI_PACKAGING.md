# Design Specification: Tauri Packaging (Series 4 / Phase 6)

> **Status:** Draft v1.0 — pre-implementation  
> **Baseline:** HEAD 9a46973 (Series 3 closed)  
> **Target:** v1.0 Windows-only desktop application  
> **Estimated sessions:** 5–8 (S11–S15)  

---

## 1. Executive Summary

Omnitome has been developed as a local-first browser application since v0.1. Node backend (`:3000`), Vite frontend (`:5173`), Python sidecar (`:8765`). Series 4 turns this into a shipped desktop application users can download, install, and launch from a Start Menu entry.

Three sub-goals:

1. **Package** the browser app into a native Windows executable (Tauri + Rust shell + WebView2).
2. **Bundle** Node backend + Python sidecar + ML models into a distributable installer.
3. **Distribute** through Cloudflare Pages + R2 with a Resource Manager that handles optional model downloads.

Two separate installers ship for v1.0:
- **Lightweight** (~250 MB): app + sidecar binaries; models download on first use
- **Offline** (~3 GB): everything bundled, works with zero network

The core invariants from earlier phases remain in force:
- Node owns orchestration + SQLite + LLM routing
- Python sidecar performs stateless compute only
- Local-first; zero egress by default
- Derivation never masquerades as source

---

## 2. Locked Design Decisions

### D1 — Windows code signing

**Decision:** Ship v1.0 unsigned. Sign in v1.0.1.

**Rationale:**
- Personal-project v1.0. First-release audience is technical and won't be deterred by a SmartScreen warning.
- Windows code signing cert costs $200–400/yr + 2–5 day verification. Not worth the delay for the first ship.
- Ship faster, add signing once the release pipeline is stable.

**User impact:** Windows SmartScreen shows "Unknown publisher" with a "More info → Run anyway" bypass. Acceptable for v1.0.

**Follow-up (v1.0.1):** Choose between (a) SignPath free tier (open source projects), (b) Azure Trusted Signing (~$10/mo), (c) standard OV cert.

---

### D2 — Python sidecar bundling

**Decision:** PyInstaller **onedir** bundle (not onefile).

**Rationale:**
- **onedir** produces a folder with `sidecar.exe` + dependencies. Launches in ~200ms.
- **onefile** produces a single `.exe` but extracts to temp on every launch → 6–7 second cold start. Unacceptable UX.
- Python + torch + transformers + Kokoro + PaddleOCR totals ~1.2 GB in a frozen bundle.
- Ship the bundle as a Tauri `externalBin` resource.

**Build pipeline:**
```bash
pyinstaller --onedir --name sidecar sidecars/python/main.py \
  --add-data "sidecars/python/tools:tools" \
  --add-data "sidecars/python/models:models" # in offline installer only
```

**Excluded from every build:** `.venv/`, `__pycache__/`, `*.pyc`, tests.

**Runtime path:** The frozen bundle installs to `<app-resources>/sidecar/`. Rust shell spawns `<app-resources>/sidecar/sidecar.exe`. Node reads its URL from an env var set by Rust.

---

### D3 — Model distribution

**Decision:** Download-on-first-use for all large models. Bundle ONLY in the offline installer.

**Models:**
| Model | Size | Required for |
| :--- | :--- | :--- |
| BGE-M3 (embeddings) | ~1.2 GB | Semantic search, retrieval |
| BGE Reranker v2 m3 | ~600 MB | Attribution reranking |
| PaddleOCR PP-OCRv4 | ~150 MB | Scanned PDF ingestion |
| Kokoro-82M + voices | ~330 MB | Text-to-speech |
| **Total** | **~2.3 GB** | Full experience |

**Lightweight installer behavior:**
1. App installs in ~30 seconds
2. First launch shows Resource Manager
3. User selects which models to download (all pre-checked by default)
4. Progress bar with resume-on-failure (HTTP Range requests)
5. SHA-256 verification per file
6. Models land in `%LOCALAPPDATA%\Omnitome\models\`
7. Sidecar reads `OMNITOME_MODELS_DIR` env var; falls back to bundled path in offline installer

**Offline installer behavior:**
1. ~3 GB download, models bundled
2. Zero first-run network dependency
3. Same `OMNITOME_MODELS_DIR` resolution — just points at bundled folder

**Env var contract:**
```bash
OMNITOME_MODELS_DIR=<path> # set by Rust at startup
```

Sidecar reads this first, then falls back to defaults. F86 patterns for safe model discovery (treat missing as "not installed", not fatal).

---

### D4 — Platform targets

**Decision:** **Windows-only for v1.0.**

**Rationale:**
- Development and testing happen on Windows 11 (RTX 3050 Laptop).
- Cross-platform = CI matrix + 3x testing + signing cert for each platform.
- No Mac hardware available for proper testing.
- Linux desktop users are a small audience for this product category.

**Follow-up (v1.1+):** macOS via GitHub Actions runners + notarization. Linux via AppImage/`.deb` if demand exists.

---

### D5 — Two-installer strategy

**Decision:** Ship **two installers**, both produced from the same build pipeline.

| Installer | Size | Contents | First-run |
| :--- | :--- | :--- | :--- |
| Lightweight | ~250 MB | App + sidecar binaries | Resource Manager downloads models |
| Offline | ~3 GB | App + sidecar + all models | Ready immediately |

**Build flag:** `OFFLINE_BUILD=1` controls whether the model bundling step runs. Same NSIS script, same Rust shell.

**Download page UX (Cloudflare Pages):**
```text
┌────────────────────────────────────────────┐
│ Download Omnitome                          │
├────────────────────────────────────────────┤
│ Recommended: ~250 MB                       │
│ [ Download Installer ]                     │
│ Models download on first launch.           │
│                                            │
│ Full Offline: ~3 GB                        │
│ [ Download Offline Installer ]             │
│ Everything bundled. No internet needed.    │
└────────────────────────────────────────────┘
```

---

### D6 — Distribution hosting

**Decision:** Cloudflare Pages (landing site) + Cloudflare R2 (binaries + models).

| Layer | Service | Cost |
| :--- | :--- | :--- |
| Landing page | Cloudflare Pages | Free |
| Installer binaries | R2 | Free (10 GB tier) |
| Model files | R2 | Free |
| CDN + custom domain | Cloudflare | Free |
| Egress | R2 | $0 (unmetered) |

**Manifest URL:** `https://omnitome.app/manifest-v1.json`

**Manifest shape:**
```json
{
  "version": "1.0.0",
  "generated_at": "2026-11-XXT...",
  "models": [
    {
      "id": "bge-m3",
      "name": "BGE-M3 Embeddings",
      "category": "embeddings",
      "required": true,
      "size_bytes": 1280000000,
      "files": [
        {
          "name": "model.safetensors",
          "url": "https://downloads.omnitome.app/models/bge-m3/model.safetensors",
          "sha256": "<64-char hash>"
        }
      ],
      "revision": "a5beb1e3e2b3f4c1a9d8e7f6c5b4a3d2e1f0c9b8a7d6e5f4c3b2a1"
    }
  ]
}
```

Model revisions are pinned by HF commit hash. Guarantees reproducible behavior across installs.

**Fallback:** If `omnitome.app` is unreachable, Resource Manager shows "Cannot reach download server" with retry. Does NOT silently fail.

---

### D7 — Resource Manager architecture

**Decision:** Node-owned REST + SSE service, Rust shell not involved.

**Endpoints:**
```http
GET    /api/resources              → list available resources + install state
GET    /api/resources/:id          → size, disk requirement, revision
POST   /api/resources/:id/download → starts download, returns { taskId }
GET    /api/resources/:id/progress → SSE stream of progress events
DELETE /api/resources/:id          → uninstall (files removed from disk)
```

**State:** Filesystem-only, like TTS cache.
- Downloads land in `%LOCALAPPDATA%\Omnitome\models\<model_id>\`
- In-progress downloads use `<file>.part` suffix
- On completion: rename to final name
- On boot: sweep orphaned `.part` files (F86 pattern)

**Progress events:**
```sse
event: progress
data: {"id":"bge-m3","bytesDownloaded":512000000,"bytesTotal":1280000000,"pct":40}

event: verifying
data: {"id":"bge-m3","file":"model.safetensors"}

event: complete
data: {"id":"bge-m3","elapsed_ms":45000}

event: error
data: {"id":"bge-m3","code":"CHECKSUM_MISMATCH","message":"..."}
```

**Frontend:** `ResourceManager.tsx` modal in Settings; auto-opens on first launch if any required model missing.

**Checksum verification:** SHA-256 per file. Verify before rename. On mismatch → delete `.part`, emit error, allow retry.

**Resume support:** HTTP Range requests; if a `.part` file exists with matching length, resume from that offset.

---

### D8 — Port assignment strategy

**Decision:** Sidecar uses port 0 (OS-assigned); Rust reads assigned port from stdout.

**Why not hardcoded 8765:**
- Another app on the user's machine may use 8765
- Current dev workflow uses 8765; that's fine for dev, wrong for ship

**Flow:**
1. Rust spawns `sidecar.exe --port 0`
2. Sidecar prints `[Boot] Listening on port <N>` to stdout on startup
3. Rust captures that line, parses port
4. Rust sets `OMNITOME_SIDECAR_PORT=<N>` env var when spawning Node
5. Node reads env var; defaults to 8765 in dev

**Same for Node backend:**
1. Rust spawns `node-backend.exe --port 0`
2. Node prints `[Boot] Listening on port <N>`
3. Rust captures, sets `OMNITOME_NODE_PORT` for frontend to consume at build time or via injected runtime script

**Frontend:** Reads `window.__OMNITOME__?.nodePort` (injected by Rust via `webview.eval()` before window opens) instead of hardcoded 3000.

**Fallback:** If parsing fails, Rust retries with 8765/3000. If those are occupied, fails loudly with error dialog.

---

### D9 — Shutdown coordination

**Decision:** Rust is the process supervisor. On window close, Rust sends SIGTERM → waits 5s → SIGKILL.

**Sequence on close:**
```text
User closes window
      ↓
Rust on_window_event(CloseRequested)
      ↓
Rust sends SIGTERM to Node
Node:
  - completes in-flight HTTP requests (short timeout)
  - flushes SQLite WAL
  - exits 0
      ↓
Rust sends SIGTERM to Python
Python:
  - completes in-flight inference
  - unloads all models (frees VRAM)
  - exits 0
      ↓
After 5s: Rust SIGKILLs any survivors
      ↓
Rust releases window, exits
```

**On crash recovery:** Next launch, Node's F58 zombie-job sweep marks any `PROCESSING` job as `INTERRUPTED` (F37.5 pattern). F52 lifecycle unaffected.

**Orphan prevention:** If Rust crashes without cleanup, orphan children could survive. Mitigations:
- Rust records child PIDs to a file on spawn
- On startup, Rust checks for orphans matching that file and kills them

---

### D10 — Kokoro TTS packaging

**Decision:** Kokoro treated as a downloadable resource like the others.

**In lightweight installer:**
- Not bundled
- Resource Manager shows "Kokoro Neural Voice — 330 MB — Required for text-to-speech"
- Users who don't want TTS skip it
- Reader shows "Voice models not installed. [Open Settings]" if missing (F88 pattern from S08)

**In offline installer:**
- Bundled in `sidecar/models/kokoro/`

**Model revision pinning:** Kokoro uses HF revision hash. If a new Kokoro version releases, existing installs keep working until the user manually updates via Resource Manager (future v1.1 feature).

**First-launch wizard:** If user checks "Enable text-to-speech" during onboarding, Kokoro auto-downloads. If not, it's available for later install.

---

## 3. Session Roadmap (S11–S15)

| Session | Scope | Deliverable |
| :--- | :--- | :--- |
| **S11** | Tauri scaffold + Rust shell | `src-tauri/` directory, `tauri.conf.json`, Rust `main` that spawns Node + Python and opens WebView |
| **S12** | Bundle Node + Python sidecar + BGE-M3 | PyInstaller builds, `externalBin` config, first successful `npm run tauri build` producing a working `.exe` |
| **S13** | Kokoro + Resource Manager | D7 endpoints, `ResourceManager.tsx` UI, download flow, checksum verification |
| **S14** | Code signing + notarization (or defer decision) | If D1 changes: cert purchase + CI integration. Else: document the deferral. |
| **S15** | GitHub Releases + R2 upload + auto-update | CI pipeline, manifest publishing, Tauri updater integration |

**Estimated total:** 5–8 sessions. S11 and S12 are the highest-risk (new tooling). S13 is largest by code volume. S14 and S15 are mostly pipeline/setup.

---

## 4. Open Questions

- **Rust shell complexity:** How much logic goes in Rust vs. delegated to Node? Current design keeps Rust minimal (spawn + supervise + inject env vars). Confirm.
- **Tauri v2 vs v1:** Tauri 2 is current stable. Assume v2. Confirm no plugin conflicts.
- **WebView2 distribution:** Win 11 has it pre-installed. Windows 10 users need the bootstrapper. Handle via Tauri's `webviewInstallMode: 'downloadBootstrapper'` (default) — requires network on first install for Win 10 users. Acceptable? Or bundle WebView2 (~150 MB installer size increase)?
- **NSIS vs. MSI:** NSIS produces a friendlier installer UX. MSI is better for enterprise. Default: NSIS for v1.0.
- **Auto-update channel:** Tauri's built-in updater requires a signing key. For v1.0: manual update check on launch that shows a notification linking to the download page. Auto-install deferred to v1.1.
- **Sidecar CPU/GPU detection:** The packaged sidecar must detect CUDA presence at runtime. If no NVIDIA GPU, falls back to CPU (slow but functional). Confirm behavior matches dev environment.
- **Installer size reality check:** Lightweight installer with just Node + Python frozen binaries might already be >250 MB. Need to measure after S12's PyInstaller build.

---

## 5. Out of Scope for v1.0

- **Code signing** — deferred to v1.0.1
- **macOS + Linux** — deferred to v1.1
- **Auto-update auto-install** — deferred to v1.1
- **Ambient background music (F90)** — v1.1
- **Chapter audio export (MP3)** — v1.1
- **Cache compression (Opus)** — v1.1
- **Multi-user profile support** — not planned
- **Cloud sync** — contradicts local-first thesis

---

## 6. Success Criteria

Series 4 ships when:

- [ ] `npm run tauri build` produces a `.exe` installer
- [ ] Fresh Windows 11 machine can install + launch Omnitome
- [ ] All three servers spawn automatically
- [ ] Import pipeline works end-to-end (file, PDF, EPUB, DOCX, RTF, paste, web)
- [ ] Reader + Smart Chapter view works
- [ ] Kokoro TTS plays back chapters
- [ ] Settings persist across restarts
- [ ] Window close terminates all child processes cleanly (no orphans)
- [ ] Resource Manager downloads BGE-M3 successfully on fresh install
- [ ] Offline installer works with zero network
- [ ] Both installers uploaded to Cloudflare R2

---

## 7. Related Documents

- [`docs/DESIGN_KOKORO_TTS.md`](DESIGN_KOKORO_TTS.md) — Kokoro integration (Series 3, shipped)
- [`docs/DESIGN_LIBRARY_RESEARCH_STATE.md`](DESIGN_LIBRARY_RESEARCH_STATE.md) — F52 lifecycle coordination
- [`docs/DESIGN_SIDECAR_LIFECYCLE.md`](DESIGN_SIDECAR_LIFECYCLE.md) — F43 model eviction + warmup
- [`docs/RIGHTS.md`](RIGHTS.md) — licensing status before commercial distribution
- [`docs/SESSION_HANDOFF.md`](SESSION_HANDOFF.md) — current state + standing rules

---

*End of design document. Awaiting `/plan` for session split refinement.*

