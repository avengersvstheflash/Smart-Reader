# Smart Reader / Omnitome — Session Handoff

> Last updated: 2026-10-17 (post-S12)  
> Repository: github.com/avengersvstheflash/Smart-Reader  
> Purpose: Full orientation in one turn for any assistant. Answers: *where are we, how do we work, what is next.*

---

## 1. Current State

- **HEAD:** `9750d72` (`feat(tauri): rust process supervisor, logging, and frontend dynamic port bootstrap (S12c)`)
- **Tree:** clean
- **Origin:** synced with `main`
- **Tests:** 58 unit suites + 1 corpus gate (10/10 fixtures) green
- **Latest tag:** `v0.6.0`

### Recent Commit Trail
- `9750d72` — S12c: Rust supervisor + frontend bootstrap
- `eca3bea` — S12b: dynamic ports + boot handshake
- `fe7e45a` — S12a: PyInstaller onedir freeze
- `a0303a8` — F93.1: layered book emblem as app icon
- `db34cf8` — F93: sigil-on-gradient icons (superseded)
- `986db1a` — F92: package.json metadata refresh
- `8801469` — S11: Tauri v2 scaffold
- `b6f5d06` — docs: Tauri packaging spec
- `9a46973` — Series 3 close (Kokoro TTS S07–S10)

---

## 2. Product Identity (locked)

- **One-line thesis:** A local-first neural reading library whose differentiator is **loss-bounded, provenance-aware semantic compression**.
- **Not this:** "AI summarizes your books."
- **This:** Source → compressed reading layer → traceable back to source.
- **The Two-Representation Invariant:**
  - **Original Reading:** Immutable source. Authoritative. Lives in Research.
  - **Omni Reading:** Derived, compressed, traceable. Lives in Library. **This is the product.**
  - *Rule:* Omni is the product; Original is the proof.
- **Three Design Laws:**
  1. *Source is paper:* Original feels neutral, calm, book-like.
  2. *The lens is tinted:* Omni carries a quiet derived identity.
  3. *Derivation never masquerades as source:* Every Omni claim retains a provenance path.

---

## 3. Architecture

- **Node + Python Hybrid:**
  - *Node:* API/HTTP, orchestration, SQLite (sole writer), lifecycle, LLM routing.
  - *Python sidecar (127.0.0.1, dynamic port):* PaddleOCR, pysbd, BGE-M3, BGE reranker v2, DOCX/RTF parsing, PyMuPDF structure, pdfmath, Kokoro TTS.
  - *Hard boundary:* Node is sole SQLite writer. Python never writes to SQLite. Python never calls an LLM.
- **Tauri supervisor (S12c):**
  - Rust spawns Python sidecar on `--port 0`, parses `__OMNITOME_BOOT__ python-sidecar port=<N>`.
  - Sets `OMNITOME_SIDECAR_PORT`, spawns Node on `--port 0`, parses `__OMNITOME_BOOT__ node-backend port=<N>`.
  - Creates WebView only after both sentinels received.
  - Injects `window.__OMNITOME__ = { nodePort, sidecarPort }`.
  - Logs to `%LOCALAPPDATA%\Omnitome\logs\{sidecar,node}.log` with 5 MB rotation.
  - Atomic `pids.json` + stale-PID sweep on startup.
- **Model cache:** `%LOCALAPPDATA%\Omnitome\models\` (env: `OMNITOME_MODEL_DIR`).
- **Frozen binary:** `dist-sidecar/omnitome-sidecar/omnitome-sidecar.exe` (4,558 MB, 11,322 files, ~10 min build).

---

## 4. Phase Status (current)

- **Phase 5:** CLOSED
- **Phase 5.7 / 5.7.2 / 5.7.3:** CLOSED
- **Phase 5.8:** IN PROGRESS (Feature freeze achieved)
  - `5.8.0` Compression Contract Repair: CLOSED
  - `5.8a` Omnitome Rebrand: CLOSED
  - `5.8c` Omni Theme Identity: CLOSED
  - `5.8i` Frontend Walkthrough: QUEUED
- **Phase 5.9 (Series 3):** Kokoro TTS — CLOSED (S07–S10)
- **Series 4 (Tauri packaging):**
  - `S11` Tauri v2 scaffold: CLOSED
  - `S12a` PyInstaller freeze: CLOSED
  - `S12b` Dynamic ports + handshake: CLOSED
  - `S12c` Rust supervisor + bootstrap: CLOSED
  - `S12c` orphan verification: **PENDING** (tomorrow)
  - `S13` Resource Manager + Kokoro packaging: NEXT
  - `S14` Dual-installer pipeline: QUEUED
  - `S15` Release + distribution: QUEUED

---

## 5. Licensing and Distribution Plan

**Decision:** Closed-source commercial for v1.0.

### Distribution targets
- **Primary:** Lemon Squeezy (5% + $0.50, MoR, tax handled)
- **Secondary:** itch.io (0–10% self-set)
- **Steam:** DROPPED (SDK conflicts with AGPL; not needed)
- **Product Hunt:** launch channel only

### Pricing
- Base: **$29 one-time**
- Launch window: **$19 for first 2–4 weeks**
- Model: one-time (local-first, no server costs)

### Licensing blocker: PyMuPDF (AGPL-3.0)
- Incompatible with closed-source distribution.
- Resolution: replace with `pypdfium2` (Apache-2.0) before v1.0.
- Filed as F94. Blocks S14.

### Note
PyInstaller Python bundles are trivially extractable. "Closed source" is a legal position, not technical. Applies equally to all Python desktop apps.

---

## 6. Active Findings Ledger

| ID | Name | Status |
|---|---|---|
| F18 | Heading ancestor skipping | CLOSED |
| F20 | Synopsis sampler index leak | OPEN (low) |
| F23 | PDF legacy PUA glyph mapping | CLOSED |
| F24 | Chat-log document classification | CLOSED |
| F29 | KaTeX LaTeX rendering | CLOSED |
| F31 | PDF math extraction (pdfmath) | CLOSED, gated OFF |
| F32 | Hybrid section classifier | CLOSED |
| F37 | Python BGE-M3 embedder default | CLOSED |
| F38 | Chapter synthesis quality | CLOSED |
| F39 | TOC-listing leakage | CLOSED |
| F42 | Corpus release gate | CLOSED (10 fixtures) |
| F43 | Model lifecycle manager | CLOSED |
| F49 | Synopsis quality | CLOSED |
| F51 | Japanese/Aozora ingestion | CLOSED |
| F52 | Library/Research coordination | CLOSED |
| F58 | Persistent import queue | CLOSED |
| F65–F72 | Pipeline reliability | CLOSED |
| F85 | Kokoro TTS sidecar | CLOSED |
| F86 | Settings temp-file leak | CLOSED |
| F88 | TTS cold-start UX | CLOSED |
| F89 | Podcast auto-advance | CLOSED |
| F90 | Ambient music | DEFERRED v1.1 |
| F92 | Package metadata | CLOSED |
| F93 / F93.1 | App icons (sigil → emblem) | CLOSED |
| F94 | PyMuPDF → pypdfium2 swap | OPEN, blocks S14 |
| F95 | Repo relicense + private | OPEN, before v1.0 tag |
| F96 | NOTICE.md + attribution | OPEN, blocks distribution |
| F97 | Landing page + checkout | OPEN, pre-PH launch |
| F98 | Bundle size 4.6 GB | ACCEPTED for v1.0 |
| F99 | HF cache dedup (21.8 GB → ~5 GB) | OPEN, pre-S13 |
| F100 | Frozen binary test in dev mode | OPEN, pre-S14 |

---

## 7. Next Session Opener

1. Verify HEAD = `9750d72`, tree clean.
2. **Complete S12c verification:** run `npm run tauri:dev`, close window, verify no orphan `node`/`python`/`omnitome-sidecar` processes remain.
3. Optional: warm-path embed verification (wait 30s+ after boot, re-probe `/v1/embed/batch`).
4. Then **S13** — Kokoro ONNX packaging + Resource Manager.

---

## 8. Standing Rules

- **Raw Evidence Over Summaries:** Every test claim requires verbatim terminal output.
- **No Commits on Dirty Tree or Red Suite.**
- **Agents Never Declare Phase Closure.**
- **Strict Blast Radius:** Provisional extension clause applies — stop and propose before touching out-of-scope files.
- **Node Owns SQLite & LLM Routing.**
- **Verify-Before-Stage:** Check file byte counts before staging.
- **Never `git reset --hard`:** Use targeted `git checkout HEAD -- <file>`.
- **Every prompt includes "attempt at most N times, then stop."**
- **Kill servers before running full suite.**
- **VS Code closed during Antigravity/writer-script edits.**
- **Compress evidence before transmitting to an LLM.**
- **Attempt at most 3 times, then stop and report.**

---

## 9. Reference

- `docs/PRODUCT_VISION.md` — Core thesis
- `docs/CONTINUITY.md` — 60-second orientation
- `docs/DESIGN_TAURI_PACKAGING.md` — Series 4 architecture
- `docs/DESIGN_SIDECAR_LIFECYCLE.md` — Model lifecycle
- `docs/DESIGN_KOKORO_TTS.md` — TTS design
- `docs/ARCHITECTURE_AUDIT.md` — Backend history
- `docs/RIGHTS.md` — Licensing and fixtures
- `docs/ROADMAP_2026-09.md` — Long-term map
- `docs/session-logs/2026-10-17.md` — This session's full log
