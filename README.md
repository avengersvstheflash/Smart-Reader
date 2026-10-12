# Omnitome

> A local-first neural reading library whose differentiator is **loss-bounded, provenance-aware semantic compression**.

*Ingests PDFs, EPUBs, DOCX, RTF, web articles, and raw text. Enforces a clean architectural split: **Import** is the entry point, **Library** holds curated Omni Readings only, and **Research** holds immutable original sources where every compressed sentence traces deterministically to its source passage.*

[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/) [![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/) [![React 18.3](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/) [![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3) [![Tests](https://img.shields.io/badge/Tests-46_Suites_%2B_Corpus_Gate-3fb950)](https://github.com/avengersvstheflash/Smart-Reader) [![Local-First](https://img.shields.io/badge/Local--First-enabled-2ea043)](https://github.com/avengersvstheflash/Smart-Reader) [![Status](https://img.shields.io/badge/Status-F51_Japanese_Complete-blue)](https://github.com/avengersvstheflash/Smart-Reader) [![Encoding](https://img.shields.io/badge/Encoding-Tier_1%2B2_Auto_Detect-teal)](https://github.com/avengersvstheflash/Smart-Reader) [![Lifecycle](https://img.shields.io/badge/Sidecar_Lifecycle-Idle_Unload-555555)](https://github.com/avengersvstheflash/Smart-Reader) [![Corpus](https://img.shields.io/badge/Fixture_Corpus-9_docs-blue)](https://github.com/avengersvstheflash/Smart-Reader) [![Release](https://img.shields.io/badge/Release-v0.6.0-purple.svg)](https://github.com/avengersvstheflash/Smart-Reader/releases/tag/v0.6.0) [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## The Two-Representation Invariant

| Representation | Behavior |
| --- | --- |
| 📄 **Original Reading** | **Immutable source.** The text exactly as uploaded. Nothing in the system modifies it. Lives in Research. |
| 🧠 **Omni Reading** | **Derived lens.** An adaptively compressed representation preserving concepts and arguments with deterministic provenance. Lives in Library. |

```text
ORIGINAL READING  →  immutable source, never touched
OMNI READING      →  derived lens, fully traceable back to source
```

---

## 📈 Recent Milestones

```mermaid
timeline
    title Omnitome Development Arc
    section Foundation
        Phase 5.0 : Core capabilities
        Phase 5.7 : Python sidecar
    section Speed
        F37.7 : FP16 CUDA breakthrough
              : 3959 to 1135 MB VRAM
              : 124s to under 1s per batch
    section Quality
        F38 / F48-F50 : Synthesis contract repair
                      : Chunker 75w merge-back
                      : Publisher & title deduplication
                      : Synopsis circular refresh
    section Reliability
        F43 : Sidecar lifecycle
            : Idle eviction daemon
            : 3.2 GB VRAM freed
    section Ingestion
        F51 series : Aozora Bunko Japanese end-to-end
                   : Tier 1 + 2 statistical encoding detection
                   : Bounded embed attention (62x speedup)
                   : Bilingual sentence splitting & 8K chunk guard
```

---

## ⚡ Performance

Omnitome processes a 508K-word technical book end-to-end on a laptop RTX 3050 in under 6 minutes, with models that idle-unload to 103 MiB VRAM when not in use.

| Metric | Before Optimization | Current Architecture | Impact |
| :--- | :--- | :--- | :---: |
| **508K-Word Import** | Multi-hour projection | **~5.9 minutes** | 🚀 30x+ faster |
| **Semantic Index Throughput** | ~50–150 ms/chunk (CPU) | **~78 ms/chunk** (GPU FP16) | ⚡ Real-time indexing |
| **BGE-M3 Active VRAM** | 3,959 MiB | **1,135 MB** | 📉 71% reduction |
| **Idle VRAM (All Evicted)** | n/a (held permanently) | **103 MiB** | 🧹 3.2 GB freed |
| **16-Chunk Embedding Batch** | ~124 seconds | **< 1 second** | ⚡ 120x+ speedup |
| **Long-Sequence Embedder Attention** | Unbounded (OOM on giant text) | **Bounded seq 2048 / batch 4** | ⚡ 62x speedup on worst-case inputs |
| **Auto-Reload Latency** | n/a | **~6.5 seconds** | 🔄 Transparent reload |
| **Encoding Detection Latency** | n/a | **< 0.3 ms** (UTF-8 fast path) | ⚡ Zero statistical overhead |

---

## 📖 What Works Today

| Format | Status | Example Tested |
| :--- | :---: | :--- |
| **PDF (text)** | ✅ | Reddi ML Systems (508K words) |
| **PDF (scanned)** | ✅ | Kaggle dojo, Boston Art Annual |
| **EPUB** | ✅ | Moby Dick, Les Misérables |
| **DOCX** | ✅ | Generated sample |
| **RTF** | ✅ | Generated sample |
| **Markdown** | ✅ | Standard CommonMark |
| **Text / Paste** | ✅ | UTF-8 clipboard buffer |
| **Web URL** | ✅ | Wikipedia, OpenLibrary |
| **Japanese (UTF-8)** | ✅ | センツアマニ (Mori Ōgai) |
| **Japanese (ShiftJIS / Aozora)** | ✅ | 痴人の愛 (*Chijin no Ai*, 201K chars, 29 chapters) |
| **French (UTF-8)** | ✅ | Monsieur Vénus |
| **Russian (Windows-1251 / KOI8-R)** | ✅ | Russian prose samples |
| **Chinese (GB18030 / Big5)** | ✅ | Daodejing samples |

> *Automatic character encoding detection (Tier 1 BOM/heuristic + Tier 2 statistical via jschardet) detects ShiftJIS, EUC-JP, Windows-1252, Windows-1250, and UTF-8/16/32 transparently without pre-conversion. Max file size configurable via `IMPORT_MAX_SIZE_MB` (50–200 MB).*

---

## 🏗️ Architecture & Data Flow

Omnitome leverages a **Hybrid Node + Python** architecture. Node.js owns orchestration, state (SQLite), and API routing. A local FastAPI Python Sidecar (`127.0.0.1:8765`) owns neural and CPU-heavy primitives. Node is the sole SQLite writer.

```mermaid
flowchart LR
    subgraph INGESTION ["1. Ingestion (Import)"]
        RawDoc["Source Material<br/>(PDF, EPUB, DOCX, RTF, TXT)"] --> Dec["Encoding Detection<br/>(Tier 1 BOM + Tier 2 jschardet)"]
        Dec --> Parser["Layout-Aware Parser"]
    end
    subgraph PYTHON_SIDECAR ["2. Python Sidecar (FastAPI)"]
        Lifecycle["Lifecycle Manager<br/>(Idle Unload Daemon)"]
        OCR["PaddleOCR<br/>(Rasterization)"]
        NLP["NLP Segmentation<br/>(pysbd)"]
        Structure["Structure Detection<br/>(PyMuPDF)"]
        Math["Math Extraction<br/>(pdfmath)"]
        Embedder["BGE-M3 Vector Index &<br/>Reranker (FP16 CUDA, Bounded Seq)"]
        Lifecycle -.->|"Manages"| OCR & Embedder
    end
    subgraph NODE_ENGINE ["3. Node Engine (Orchestration)"]
        direction TB
        Canon["Canonical Source"]
        Classifier["Hybrid Section Classifier<br/>(CJK-Aware Word Counts)"]
        Planner["Editorial Planner<br/>(1,500–2,500w Units + Title Dedup)"]
        Compressor["Parallel Synthesis<br/>(Bounded Pool + Prior Drafts)"]
        Canon --> Classifier & Planner --> Compressor
    end
    Parser --> Canon
    Parser -.->|"Image PDF"| OCR
    Parser -.->|"Structure"| Structure
    Parser -.->|"Math/LaTeX"| Math
    Canon -.->|"Sentences"| NLP
    Canon -.->|"Vectorization/Rerank"| Embedder
    Compressor -.->|"status / warm"| Lifecycle
    Compressor -.->|"Chapter Synthesis Finished"| SynopsisRef["Synopsis Auto-Refresh"]
    subgraph PRESENTATION ["4. Presentation Layer"]
        Canon ===>|"Immutable Paper"| ResearchViewer["Research Viewer"]
        Compressor ===>|"Tinted Lens"| LibraryReader["Library Omni Reader<br/>(KaTeX + Theme Engine)"]
        LibraryReader -.->|"Clickable Provenance"| ResearchViewer
    end
```

### Key Architectural Subsystems

1. **Two-Tier Encoding Detection:** Fast BOM sniffing and zero-overhead UTF-8 validation (<0.3ms), with strategic 64KB sampling via `jschardet` for non-UTF-8 formats (ShiftJIS, EUC-JP, GB18030, Windows-125x).
2. **CJK-Aware Pipeline Guards:** Shared `countWords()` helper (whitespace tokens + CJK chars × 0.7) prevents false starvation across pre-LLM guards, section filtering, and chunker merge floors.
3. **Aozora Structural Intelligence:** Dedicated pattern matching (`AOZORA_HEADING_REGEX`) identifies Japanese heading annotations while preserving source text verbatim in canonical blocks.
4. **Bounded Neural Attention:** Environment-configurable attention caps (`EMBED_MAX_SEQ_LENGTH = 2048`, `EMBED_GPU_BATCH_SIZE = 4`) cap peak activation VRAM below 1.4GB and eliminate quadratic attention blowup.
5. **Circular Synopsis Refresh:** Fire-and-forget background synopsis regeneration once chapter synthesis completes, ensuring synopses reflect fully synthesized book representations with honest status badges (`insufficient_inputs`, `deferred_fast_path`, `provider_unavailable`).
6. **Sidecar Lifecycle Management:** Central `LifecycleManager` coordinates model acquisition, state transitions (`UNLOADED`, `LOADING`, `LOADED`, `UNLOADING`), and idle eviction (3.2 GB VRAM freed on idle).

**Provider Abstraction:** OpenRouter (cloud fallback) or Local (OpenAI-compatible: Ollama at `http://localhost:11434/v1`, LM Studio, llama.cpp, vLLM). Trust boundaries ensure the Python sidecar NEVER calls an LLM.

---

## 🎨 Theme & Visual System

Omnitome features 5 adaptive themes (`spring`, `sakura`, `coffee`, `cyberpunk`, `omni`) with procedural cover art, custom animated sigils, and KaTeX math rendering governed by three design laws:
1. **Source is paper:** Original reading renders on neutral, unadorned paper.
2. **The lens is tinted:** Omni reading carries a quiet accent identity reflecting synthesis.
3. **Derivation never masquerades as source:** Every Omni claim retains an explicit, clickable provenance path.

---

## 🛠️ Getting Started

### Prerequisites & Installation
- **Node.js 22 LTS** (see `.nvmrc`) and **Python 3.10+** (local sidecar)
- **Local LLM Engine** (Ollama recommended) or OpenRouter API key

```bash
git clone https://github.com/avengersvstheflash/Smart-Reader.git && cd Smart-Reader
nvm use && npm install && cp .env.example .env
cd sidecars/python && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && cd ../..
```

### Running the App
```bash
# Terminal 1 (Sidecar :8765): cd sidecars/python && uvicorn main:app --port 8765
# Terminal 2 (Node :3000):    node backend/server.js
# Terminal 3 (Vite :5173):    cd frontend && npm run dev
```

### Running the Test Suite
```bash
# Full release gate: 46 unit suites + 1 corpus gate (9 fixtures)
node scripts/run-all-tests.js

# Corpus gate standalone:
node scripts/run-corpus-tests.js              # Standard gate (Class A + B + C)
node scripts/run-corpus-tests.js --dry-run    # Invariant checks only (Class A + C)
```

---

## 🗺️ Roadmap & Phase Status

| Phase | Description | Status |
| :---: | --- | :---: |
| **5.0** | Core Capabilities | 🟢 CLOSED |
| **5.7** | Python Sidecar Foundation | 🟢 CLOSED |
| **5.8.0** | Compression Contract Repair | 🟢 CLOSED |
| **5.8a/c** | Rebrand + Omni Theme System | 🟢 CLOSED |
| **F37.x** | FP16 Embedding Breakthrough | 🟢 CLOSED |
| **F38.x** | Synthesis Contract + Chunker + Titles | 🟢 CLOSED |
| **F42** | Diverse Fixture Corpus Gate (9 fixtures) | 🟢 CLOSED |
| **F43** | Sidecar Lifecycle + Idle Unload | 🟢 CLOSED |
| **F45** | Configurable Import Cap | 🟢 CLOSED |
| **F48-F50** | Publisher Validation, Synopsis Extraction & Title Dedup | 🟢 CLOSED |
| **F51 series** | Aozora / Japanese End-to-End Ingestion | 🟢 CLOSED |
| **5.8i** | Frontend Walkthrough | ⏳ QUEUED |
| **5.8j-k** | Settings + Help pages | ⏳ QUEUED |
| **5.9** | Kokoro TTS | ⏳ QUEUED |
| **6.0** | Tauri Packaging → v1.0 | ⏳ QUEUED |

**Current Focus:** v1.0 release preparation (5.8i frontend walkthrough).

> For deep architectural insights, see [`docs/SESSION_HANDOFF.md`](./docs/SESSION_HANDOFF.md).

---

## 📄 License

MIT © [Omnitome Contributors](./LICENSE)
