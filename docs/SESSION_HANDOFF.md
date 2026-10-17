# Omnitome — Session Handoff

> Last updated: 2026-10-18 (S13 Closed)
> Repository: github.com/avengersvstheflash/Omnitome
> Purpose: Full orientation in one turn for any assistant.

---

## 1. Current State

- **HEAD:** `73bb7ca` (`fix(resources): resolve listener leak and update test assertions`)
- **Tree:** clean
- **Origin:** synced with `main`
- **Tests:** 59 unit suites + 1 corpus gate (10/10 fixtures) green
- **License:** AGPL-3.0-only (Public) / MIT (Private V2)

### Recent Commit Trail
- `73bb7ca` — Fix ResourceManager listener leak
- `021196c` — Fix App.tsx JSX merge conflict
- `0f47062` — Fix UI loading state
- `9b8820f` — Fix undici stream crash
- `fa71cc6` — Fix network hang + polish boot UI
- `93499aa` — S13: Resource Manager implementation

---

## 2. Product Identity (locked)

- **One-line thesis:** A local-first neural reading library whose differentiator is **loss-bounded, provenance-aware semantic compression**.
- **Two-Representation Invariant:** Original Reading (immutable source in Research) vs. Omni Reading (derived, compressed, traceable in Library).
- **Three Design Laws:** 1. Source is paper. 2. The lens is tinted. 3. Derivation never masquerades as source.

---

## 3. Architecture & S13 Resources

- **Node + Python Hybrid:**
  - *Node:* API, orchestration, SQLite (sole writer), LLM routing, Resource Manager.
  - *Python sidecar:* PaddleOCR, pysbd, BGE-M3, BGE reranker, DOCX/RTF parsing, PyMuPDF, Kokoro TTS.
- **Tauri Supervisor (S12c):**
  - Spawns Python and Node dynamically.
  - Uses `taskkill /F /T` on exit to prevent orphans.
  - Logs to `%LOCALAPPDATA%\Omnitome\logs\`.
- **Resource Manager (S13):**
  - **Manifest:** `backend/config/models.json` defines 4 models.
  - **Lockfile:** `%LOCALAPPDATA%\Omnitome\models\manifest.lock.json` pins SHA-256 hashes on first download.
  - **Downloads:** Streamed via Node `getReader()` with `AbortController` support and SSE progress.
  - **Extraction:** Uses `tar` and `adm-zip` to unpack into staging folders, verify marker files, and atomically promote.
  - **First-Run UX:** `FirstRunScreen.tsx` blocks the app if models are missing.

---

## 4. Phase Status

- **Phase 5, 5.7, 5.8, 5.9:** CLOSED.
- **Series 4 (Tauri Desktop):**
  - `S11` Scaffold: CLOSED
  - `S12` Supervisor & PyInstaller: CLOSED
  - `S13` Resource Manager: CLOSED
  - `S14` Dual-Installer (NSIS): NEXT
  - `S15` Release & Distribution: QUEUED

---

## 5. Next Session Opener

1. **Host the Models:** The `models.json` currently points to placeholder GitHub URLs. We must upload the 4 `.tar.gz` archives to Cloudflare R2 or GitHub Releases (BGE-M3 is 1.3GB, so R2 is preferred due to GitHub's 2GB limit).
2. **S14 (NSIS):** Begin generating the NSIS installers (Lightweight vs. Offline).
3. **Warning:** Before running `tauri build`, ensure `tauri.conf.json` is configured with the correct `externalBin` paths for the frozen sidecar.

---

## 6. Standing Rules

- **Raw Evidence Over Summaries:** Every test claim requires verbatim terminal output.
- **No Commits on Dirty Tree or Red Suite.**
- **Agents Never Declare Phase Closure.**
- **Strict Blast Radius:** Stop and propose before touching out-of-scope files.
- **Node Owns SQLite & LLM Routing.**
- **Every prompt includes "attempt at most N times, then stop."**
- **Kill servers before running full suite.**
- **VS Code closed during Antigravity/writer-script edits.**
