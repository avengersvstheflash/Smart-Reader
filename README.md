# Omnitome

> A local-first neural reading library whose differentiator is **loss-bounded, provenance-aware semantic compression**.

*Ingests PDFs, EPUBs, DOCX, RTF, web articles, and raw text. Enforces a clean architectural split: **Import** is the entry point, **Library** holds curated Omni Readings only, and **Research** holds immutable original sources where every compressed sentence traces deterministically to its source passage.*

[![Node.js 22](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)](https://nodejs.org/) [![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/) [![React 18.3](https://img.shields.io/badge/React-18.3-61DAFB?logo=react&logoColor=black)](https://react.dev/) [![SQLite](https://img.shields.io/badge/SQLite-WAL_v3_Schema-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3) [![Tests](https://img.shields.io/badge/Tests-52_Suites_%2B_Corpus_Gate-3fb950)](https://github.com/avengersvstheflash/Smart-Reader) [![Local-First](https://img.shields.io/badge/Local--First-enabled-2ea043)](https://github.com/avengersvstheflash/Smart-Reader) [![Status](https://img.shields.io/badge/Status-Phase_5.8_F52%2FF65--72_Complete-blue)](https://github.com/avengersvstheflash/Smart-Reader) [![Encoding](https://img.shields.io/badge/Encoding-Tier_1%2B2_Auto_Detect-teal)](https://github.com/avengersvstheflash/Smart-Reader) [![Lifecycle](https://img.shields.io/badge/Sidecar_Lifecycle-Idle_Unload-555555)](https://github.com/avengersvstheflash/Smart-Reader) [![Corpus](https://img.shields.io/badge/Fixture_Corpus-10_docs_3--Class_Gate-blue)](https://github.com/avengersvstheflash/Smart-Reader) [![Release](https://img.shields.io/badge/Release-v0.6.0-purple.svg)](https://github.com/avengersvstheflash/Smart-Reader/releases/tag/v0.6.0) [![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 📊 Development Velocity & Project Progress

```text
Omnitome v1.0 Overall Completion:
[██████████████████░░] 89% (Phase 5.8 complete — 5.8i Frontend Walkthrough next)
```

| Subsystem / Milestone | Progress | Status | Key Accomplishments |
| :--- | :---: | :---: | :--- |
| **Ingestion & Parsing Engine** | `[████████████████████]` 100% | 🟢 COMPLETE | 5 formats (PDF/EPUB/DOCX/RTF/TXT), Tier 1+2 statistical encoding sniffer, Aozora Japanese |
| **Neural Sidecar & Vectors** | `[████████████████████]` 100% | 🟢 COMPLETE | BGE-M3 (FP16 CUDA, 1.1GB VRAM), BGE Reranker v2, bounded embed attention (62x speedup) |
| **Sidecar Lifecycle Manager** | `[████████████████████]` 100% | 🟢 COMPLETE | F43 auto-eviction daemon freeing 3.2 GB idle VRAM; transparent ~6.5s auto-reload |
| **State Coordination (F52)** | `[████████████████████]` 100% | 🟢 COMPLETE | SQLite Schema v3, `book_lifecycle`, 4-way delete semantics, 3-tier reading progress recovery |
| **Pipeline Reliability (F65–72)** | `[████████████████████]` 100% | 🟢 COMPLETE | Await barrier (Node RAM dropped 14.6 GB → 296 MB), dynamic timeouts (8–60s), backpressure |
| **Corpus Release Gate (F42)** | `[████████████████████]` 100% | 🟢 COMPLETE | 10 fixtures, 3-class assertion engine (A: invariants, B: tolerance bands, C: bug locks) |
| **Persistent Queue (F58)** | `[████████████████████]` 100% | 🟢 COMPLETE | SQLite WAL queue worker, live checklist widget, expanded web discovery (arXiv/Gutenberg/IETF) |
| **Theme & Procedural Art** | `[████████████████████]` 100% | 🟢 COMPLETE | 5 complete themes (`omni`, `spring`, `sakura`, `coffee`, `cyberpunk`), procedural book covers & sigils |
| **UI Surfaces & Settings** | `[██████████████████░░]` 92% | 🟡 IN PROGRESS | Library, Research, Reader, Settings, Help live; Phase 5.8i full frontend walkthrough queued |
| **Kokoro Local TTS** | `[░░░░░░░░░░░░░░░░░░░░]` 0% | ⏳ QUEUED | Phase 5.9 (3 sessions planned post-walkthrough) |
| **Tauri Desktop Wrap** | `[░░░░░░░░░░░░░░░░░░░░]` 0% | ⏳ QUEUED | Phase 6.0 desktop packaging to final v1.0 release |

---

## 🏛️ The Two-Representation Invariant

Omnitome enforces an uncompromising product identity:

| Representation | Behavior & Placement | Moat & Governance |
| :--- | :--- | :--- |
| 📄 **Original Reading** | **Immutable source.** The document exactly as uploaded. Nothing in the system modifies it. Lives in **Research**. | Governed by Law 1: *"Source is paper"*. Neutral, calm, book-like typography. Authoritative ground truth. |
| 🧠 **Omni Reading** | **Derived lens.** An adaptively compressed representation (~7:1 density) preserving concepts and arguments. Lives in **Library**. | Governed by Law 2: *"The lens is tinted"* & Law 3: *"Derivation never masquerades as source"*. Every claim retains a deterministic provenance citation. |

```text
┌──────────────────────────────────────────────┐
│       ORIGINAL READING (Research View)       │  ←  Immutable source, verbatim, never modified
│          [Raw PDF / EPUB / TXT / Web]        │
└──────────────────────┬───────────────────────┘
                       │  Loss-bounded neural compression (~7:1)
                       │  Deterministic paragraph-level vector attribution
                       ▼
┌──────────────────────────────────────────────┐
│        OMNI READING (Library View)           │  ←  Derived reading lens, adaptively synthesized
│  [250–360 words/chapter + Clickable Citations]│
└──────────────────────────────────────────────┘
```

---

## 📈 Recent Milestones & Architectural Evolution

```mermaid
timeline
    title Omnitome Engineering Evolution
    section Foundation
        2026-09-17 : BGE-M3 1024d Embedding Swap (v0.4.5)
                   : CLS pooling proof (1.68x separation)
                   : React 18 + TS + Tailwind Scaffold
        2026-09-20 : Phase 4 First Neural LLM Compression
                   : Reasoning budget fix & front-matter exclusion
        2026-09-24 : Phase 5.1 Bibliographic facts & provenance contract
        2026-09-26 : Phase 5.3 Two-Representation Invariant (Library vs Research)
    section Acceleration
        2026-09-30 : Phase 5.7.1 FastAPI Python Sidecar & PaddleOCR
        2026-10-07 : F31 Math/KaTeX & F32 PyMuPDF Fast Structure Detection
                   : F34 Multi-Query Batch Reranker
        2026-10-08 : F37.7 PyTorch FP16 CUDA Breakthrough
                   : 3,959 MiB to 1,135 MB VRAM (71% drop)
                   : 124s to under 1s per 16-chunk batch
    section Quality & Aesthetics
        2026-10-06 : Phase 5.8c 5-Theme Engine & Sticker Architecture
        2026-10-07 : Procedural SVG Book Covers & Per-Theme Sigils
        2026-10-09 : F38 Synthesis Contract [150, 500w] & Manual Resynthesize
        2026-10-10 : F43 Sidecar Lifecycle Manager & Idle Eviction Daemon
                   : 3.2 GB VRAM auto-freed on idle
    section Ingestion & Scale
        2026-10-12 : F51 Series Aozora Bunko Japanese End-to-End
                   : Tier 1 + 2 Statistical Encoding Detection
                   : Bounded Embed Attention (62x speedup on worst-case)
        2026-10-13 : F42 3-Class Corpus Release Gate (10 fixtures)
                   : F58 Persistent SQLite WAL Queue & Expanded Web Discovery
    section Reliability & State
        2026-10-14 : F65-F72 Sequential Pipeline Reliability Arc
                   : Node Peak RAM dropped from 14.6 GB to 296 MB
                   : Dynamic Reranker Timeout Scaling (8s to 60s)
                   : F52 Library/Research State Coordination (Schema v3)
                   : 4-Way Delete Semantics & 3-Tier Reading Progress Recovery
                   : 52 Regression Suites + 1 Corpus Gate Green
```

---

## ⚡ Performance & Empirical Benchmarks

Omnitome is engineered for local-first high-throughput reading and neural synthesis. All metrics below represent real, empirical measurements conducted across the **v1.0 Corpus Release Gate** (10 diverse fixtures across 5 document formats) and the **Juncture Document Corpus** (22 files, 211.5 MB, 6 languages) running on local consumer-grade hardware with active PyTorch FP16 GPU acceleration.

### 🚀 Optimization Impact Summary

| Metric | Before Optimization | Current Architecture | Impact |
| :--- | :--- | :--- | :---: |
| **508K-Word Book Import** | Multi-hour projection | **~5.9 minutes** | 🚀 30x+ faster |
| **Node.js Peak Memory Under Ingestion** | 14.6 GB (unbounded async tasks) | **296 MB** (F65 await barrier) | 📉 98% memory drop |
| **Semantic Index Throughput** | ~50–150 ms/chunk (CPU) | **~78 ms/chunk** (GPU FP16) | ⚡ Real-time indexing |
| **BGE-M3 Active VRAM** | 3,959 MiB | **1,135 MB** | 📉 71% reduction |
| **Idle VRAM (All Models Evicted)** | Held permanently in VRAM | **174 MB** | 🧹 3.2 GB freed |
| **16-Chunk Embedding Batch** | ~124 seconds | **< 1 second** | ⚡ 120x+ speedup |
| **Long-Sequence Embedder Attention** | Unbounded (OOM on giant chapters) | **Bounded seq 2048 / batch 4** | ⚡ 62x speedup on worst-case inputs |
| **Parallel Synthesis** | Sequential (1x) | **Concurrency = 2** (Configurable) | ⚡ 2x synthesis speed |
| **Auto-Reload Latency from Cold Idle** | n/a | **~6.5 seconds** | 🔄 Transparent on-demand reload |
| **Reranker Timeout Governance** | Fixed 10s (timed out on large chapters) | **Dynamic 8s–60s** (F71 input-calibrated) | 🛡️ Zero false timeout fallbacks |
| **Encoding Detection Latency** | n/a | **< 0.3 ms** (UTF-8 fast path) | ⚡ Zero statistical overhead |
| **SQLite WAL Queue Enqueue Throughput**| n/a | **931 tasks/sec** (F58 WAL transactions) | ⚡ Sub-millisecond persistence |

### 🖥️ Test Environment Specifications

| Component | Specification |
| :--- | :--- |
| **Operating System** | Windows 11 Home (x64, build 10.0.26300) |
| **Processor** | AMD Ryzen 7 4800H with Radeon Graphics (8 Cores, 16 Threads @ 2.9–4.2 GHz) |
| **System Memory** | 16 GB DDR4 (15.4 GB usable) |
| **Neural Accelerator (GPU)** | NVIDIA GeForce RTX 3050 Laptop GPU (4,096 MiB VRAM, Driver 610.88, PyTorch FP16 CUDA) |
| **Runtimes** | Node.js v22 LTS (Orchestrator & State) · Python 3.10+ FastAPI (Neural Sidecar) |
| **Database Storage** | SQLite 3 via `better-sqlite3` in WAL mode (Schema `user_version = 3`) |

---

### ⚡ 1. Real-World Document Corpus Benchmark (22 files, 211.5 MB, 6 languages)

Measured against `scripts/run-juncture-benchmark.js` on real-world reference documents. Evaluates parse + block extraction + chunking throughput post-F62 optimization:

| Document | Format | Size | Chapters | Words | Chunks | Parse (ms) | Chunk (ms) |
| :--- | :---: | ---:| ---:| ---:| ---:| ---:| ---:|
| *A Misanthrope Teaches a Class for Demi-Humans, Vol. 1* | EPUB | 20.7 MB | 27 | 59,960 | 254 | 58 ms | 64 ms |
| *Annual Report of Boston Art, 1899* | PDF | 23.5 MB | 15 | 72,599 | 565 | 3,832 ms | 2,346 ms |
| *Aozora Bunko Collection (02070)* | EPUB | 25.0 KB | 29 | 4,184 | 26 | 8 ms | 5 ms |
| *Chat Log Research Transcript (chat_11)* | MARKDOWN | 1.5 MB | 75 | 214,925 | 1,110 | 2,992 ms | 1,588 ms |
| *Chijin no Ai (痴人の愛 - Tanizaki)* | TEXT | 392.5 KB | 29 | 137,828 | 167 | 194 ms | 303 ms |
| *Corpsex Medical Pathology Manual* | PDF | 730.5 KB | 66 | 98,762 | 425 | 1,468 ms | 448 ms |
| *Kaggle and Code Dojo Vol 1* | PDF | 5.4 MB | 2 | 4,223 | 21 | 103,612 ms | 6 ms |
| *Kaggle and Code Dojo Vol 2* | PDF | 13.0 MB | 3 | 9,016 | 58 | 235,934 ms | 23 ms |
| *Machine Learning Systems Vol 1 (Reddi)* | PDF | 11.6 MB | 27 | 508,589 | 2,817 | 16,531 ms | 6,476 ms |
| *Overlord, Vol. 1: The Undead King* | EPUB | 13.0 MB | 13 | 76,960 | 345 | 47 ms | 56 ms |
| *Project Gutenberg pg1322* | EPUB | 839.6 KB | 378 | 124,338 | 617 | 71 ms | 988 ms |
| *Project Gutenberg pg17489* | EPUB | 343.8 KB | 6 | 110,567 | 556 | 70 ms | 474 ms |
| *Project Gutenberg pg25305* | EPUB | 426.8 KB | 4 | 84,969 | 404 | 34 ms | 67 ms |
| *Project Gutenberg pg2701* | EPUB | 795.0 KB | 12 | 213,708 | 1,067 | 88 ms | 642 ms |
| *Project Gutenberg pg36528* | EPUB | 198.1 KB | 3 | 41,806 | 209 | 21 ms | 23 ms |
| *Project Gutenberg pg83* | EPUB | 520.3 KB | 55 | 92,112 | 461 | 36 ms | 110 ms |
| *Practical Machine Learning: A Beginner's Guide* | PDF | 13.9 MB | 15 | 69,399 | 380 | 1,949 ms | 164 ms |
| *Geological Mapping Program 1982* | PDF | 11.4 MB | 4 | 24,044 | 136 | 757 ms | 23 ms |
| *Reverend Insanity, Book 1* | EPUB | 1.1 MB | 200 | 416,124 | 1,845 | 184 ms | 3,587 ms |
| *The Eminence in Shadow, Vol. 1* | PDF | 14.1 MB | 16 | 57,504 | 235 | 1,588 ms | 72 ms |
| *US Geological Survey 2009* | PDF | 24.1 MB | 16 | 28,480 | 148 | 971 ms | 72 ms |
| *Vienano — Esperanto per Esperanto (1932)* | PDF | 54.2 MB | 2 | 14,380 | 87 | 1,452 ms | 75 ms |
| **TOTAL / CORPUS AGGREGATE** | **ALL** | **211.5 MB** | **997** | **2,464,477** | **11,933** | **371,897 ms** | **17,612 ms** |

*Corpus highlights: 22/22 passed with zero failures across English, Japanese, French, German, Chinese, and Esperanto.*

---

### 🛡️ 2. Release-Corpus Gate Benchmark (10 fixtures, 5 formats, 3 assertion classes)

Measured across the **v1.0 Corpus Release Gate** (`scripts/run-corpus-tests.js`). Enforces Class A universal invariants, Class B tolerance bands, and Class C regression locks:

| Fixture Document | Format | File Size | Chapters | Word Count | Parse Time (Median) | Throughput (Words/s) | Transfer Rate (MB/s) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `01-narrative/moby_dick.epub` | **EPUB** | 711.7 KB | 27 | 212,711 | 86.9 ms | **2,447,768** | 8.00 MB/s |
| `01-narrative/pride_and_prejudice.epub` | **EPUB** | 548.0 KB | 16 | 128,191 | 54.3 ms | **2,360,792** | 9.85 MB/s |
| `02-poetry/leaves_of_grass.epub` | **EPUB** | 675.9 KB | 290 | 7,515 | 40.2 ms | **186,940** | 16.42 MB/s |
| `03-nonenglish/les_miserables_tome_1.epub` | **EPUB** | 354.3 KB | 13 | 110,567 | 54.2 ms | **2,039,982** | 6.38 MB/s |
| `06-docx-rtf/sample.docx` | **DOCX** | 37.8 KB | 4 | 1,343 | 95.3 ms | **14,092** | 0.39 MB/s |
| `06-docx-rtf/sample.rtf` | **RTF** | 7.7 KB | 1 | 1,343 | 16.0 ms | **83,938** | 0.47 MB/s |
| `07-epub/common_sense.epub` | **EPUB** | 172.2 KB | 3 | 22,637 | 11.0 ms | **2,057,909** | 15.29 MB/s |
| `08-edge-cases/chijinno_ai.txt` | **TXT** | 218.5 KB | 15 | 76,765 | 45.8 ms | **1,676,092** | 4.66 MB/s |
| `08-edge-cases/chat_11-slice.md` | **MD** | 266.5 KB | 9 | 36,906 | 82.2 ms | **448,978** | 3.17 MB/s |
| `08-edge-cases/prologue-sample.md` | **MD** | 1.7 KB | 3 | 317 | 0.8 ms | **396,250** | 2.06 MB/s |
| **TOTAL / CORPUS AGGREGATE** | **All 5** | **2.92 MB** | **381** | **598,295** | **486.7 ms** | **1,229,289 w/s** | **6.01 MB/s** |

---

### 🧠 3. Neural Vectorization & Reranking Throughput (FP16 CUDA)

Empirical benchmarks conducted on the local Python sidecar (`127.0.0.1:8765`):

#### BGE-M3 Dense Vectorization (`/v1/embed`)
- Attention sequence length bounded to 2,048 tokens (`EMBED_MAX_SEQ_LENGTH = 2048`)
- GPU micro-batch size bounded to 4–16 (`EMBED_GPU_BATCH_SIZE = 4`)

| Batch Size | Workload Scenario | Batch Latency (Median) | Per-Vector Latency | Vector Throughput |
| :---: | :--- | :---: | :---: | :---: |
| **1** | Interactive search / single query | 167.5 ms | 167.5 ms | **6.0 vectors/s** |
| **4** | Bounded chapter slice | 562.7 ms | 140.7 ms | **7.1 vectors/s** |
| **8** | Medium section batch | 691.9 ms | 86.5 ms | **11.6 vectors/s** |
| **16** | Standard pipeline batch | 899.0 ms | 56.2 ms | **17.8 vectors/s** |
| **32** | High-density bulk ingestion | 1,302.5 ms | 40.7 ms | **24.6 vectors/s** |

#### BGE Reranker v2 M3 Cross-Encoder (`/v1/nlp/rerank` & `/v1/nlp/rerank-batch`)
- Dynamic input-calibrated timeout: `8000 + candidates * paragraphs * 400 + paragraphs * 300` ms (clamped `[8000, 60000]`)

| Candidates Scored | Synthesis Context | Query Latency (Median) | Per-Pair Latency | Throughput |
| :---: | :--- | :---: | :---: | :---: |
| **5** | Top-5 candidate fine-refinement | 216.8 ms | 43.4 ms | **23.1 pairs/s** |
| **10** | Standard section synthesis context | 387.0 ms | 38.7 ms | **25.8 pairs/s** |
| **20** | Broad multi-paragraph context window | 1,214.1 ms | 60.7 ms | **16.5 pairs/s** |
| **50** | Deep multi-chapter cross-attention | 3,848.5 ms | 77.0 ms | **13.0 pairs/s** |

---

### 💾 4. Memory Footprint & Lifecycle Governance

The F43 Lifecycle Manager enforces aggressive idle eviction, ensuring the host workstation remains light and responsive:

| Subsystem & State | Process RAM (RSS) | VRAM (Allocated) | VRAM (Reserved) | Operational Behavior |
| :--- | :---: | :---: | :---: | :--- |
| **Node.js Orchestrator** | 118 MB (Peak 296 MB) | — | — | Sole SQLite writer, non-blocking HTTP event loop |
| **Python Sidecar (Active Load)** | 2,220 MB | 3,431.9 MB | 3,994.0 MB | Active FP16 CUDA vectorization & cross-encoding |
| **Python Sidecar (Idle Evicted)** | **1,762 MB** | **174.0 MB** | **476.0 MB** | **Frees 3,257.9 MB (3.2 GB) VRAM** after TTL |

---

## 📖 Supported Document Formats

| Format | Status | Ingestion Mechanism | Example Real-World Fixture Tested |
| :--- | :---: | :--- | :--- |
| **PDF (Text)** | ✅ | Layout-aware PyMuPDF + TOC extraction | Reddi *ML Systems* (508K words, 27 ch) |
| **PDF (Scanned/OCR)** | ✅ | Sidecar PaddleOCR fallback on 0-char pages | *Boston Art Annual*, Kaggle Dojo |
| **EPUB** | ✅ | Native XML/XHTML spine parser | *Moby Dick*, *Pride and Prejudice*, *Overlord* |
| **DOCX** | ✅ | Python sidecar `python-docx` extraction | Technical documentation sample |
| **RTF** | ✅ | Python sidecar `striprtf` extraction | Formatted legal brief sample |
| **Markdown** | ✅ | CommonMark AST parser with fast-path | Research transcripts (`chat_11.md`) |
| **Raw Text / Paste** | ✅ | UTF-8 buffer sniffer + wizard | Clipboard buffers, prose snippets |
| **Web Article / URL** | ✅ | Readability parser + arXiv / Gutenberg / IETF | Academic papers, Wikipedia, Gutenberg texts |
| **Japanese (Aozora / ShiftJIS)** | ✅ | Tier 2 `jschardet` + `AOZORA_HEADING_REGEX` | *Chijin no Ai* (*痴人の愛*, 201K chars) |
| **French / European (UTF-8)** | ✅ | UTF-8 fast-path + C1-aware accent rules | *Les Misérables*, *Monsieur Vénus* |
| **Russian (CP1251 / KOI8-R)** | ✅ | Tier 2 statistical charset detection | Russian classic prose excerpts |
| **Chinese (GB18030 / Big5)** | ✅ | Tier 2 charset + CJK `countWords` | *Daodejing*, *Reverend Insanity* |

---

## 🏗️ Architecture & Subsystem Engineering

Omnitome adopts a **Hybrid Node.js + Python** architecture. Node.js owns orchestration, state persistence, API routing, and LLM capability dispatch. A local FastAPI Python Sidecar (`127.0.0.1:8765`) owns heavy neural and CPU primitives. Node is the sole SQLite writer; Python never touches SQLite.

```mermaid
flowchart TB
    subgraph CLIENT ["1. Modern Frontend (React 18 + Vite + Tailwind)"]
        direction LR
        LibraryUI["Library Route<br/>(Omni Readings)"]
        ResearchUI["Research Route<br/>(Immutable Dossiers)"]
        ReaderUI["Dual-Pane Reader<br/>(KaTeX + Provenance)"]
        QueueWidget["Persistent Import<br/>Checklist Widget"]
        SettingsUI["Settings & Cost<br/>Ledger ($0.00 Ollama)"]
    end

    subgraph NODE_ORCHESTRATOR ["2. Node.js Orchestrator (Express 5 + SQLite WAL v3)"]
        direction TB
        API["REST API & Lifecycle Routes"]
        QueueWorker["Import Queue Worker<br/>(Single-Worker FIFO)"]
        SequentialGate["F65 Pipeline Await Barrier<br/>(14.6 GB → 296 MB RAM)"]
        
        subgraph PIPELINE ["Sequential 5-Stage Ingestion Pipeline"]
            S1["Stage 1: Ingestion & Fast Parse<br/>(Tier 1+2 Encoding Sniffer)"]
            S2["Stage 2: Semantic Indexing<br/>(75w Merge-Back, 8K Guard)"]
            S3["Stage 3: Section Classifier<br/>(CJK countWords, Fast Path)"]
            S4["Stage 4: Editorial Planner<br/>(1,500–2,500w Units, Title Dedup)"]
            S5["Stage 5: Synthesis & Attribution<br/>(Dynamic Timeout, Prior-Draft Retry)"]
            S1 --> S2 --> S3 --> S4 --> S5
        end

        Coordination["F52 book_lifecycle Coordination Layer<br/>(Active / Library-Only / Research-Only / Archived)"]
        LLM_Router["LLM Capability Router<br/>(Ollama / OpenRouter / LM Studio)"]
    end

    subgraph PYTHON_SIDECAR ["3. FastAPI Python Sidecar (127.0.0.1:8765)"]
        direction TB
        LifecycleMgr["F43 Lifecycle Manager<br/>(Idle Eviction Daemon)"]
        Embedder["BGE-M3 Embedder<br/>(FP16 CUDA, Bounded Attention)"]
        Reranker["BGE Reranker v2<br/>(Multi-Query Batching)"]
        OCR["PaddleOCR Engine<br/>(Image Scans Only)"]
        Parsers["PyMuPDF Structure &<br/>pdfmath Math Extractor"]
        
        LifecycleMgr -->|"Auto-Evicts on TTL"| Embedder & Reranker & OCR
    end

    subgraph STORAGE ["4. Local-First SQLite Database (storage/data.db)"]
        direction LR
        BL["book_lifecycle (v3)"]
        Satellites["Satellite Tables<br/>(chapter_name_history, synopsis_history,<br/>dossier_append_log, llm_usage)"]
        BooksTable["books, chapters,<br/>smart_chapters, semantic_chunks"]
        BL --- Satellites
        BL --- BooksTable
    end

    CLIENT ==>|"HTTP REST / SSE"| API
    API --> QueueWorker --> SequentialGate --> PIPELINE
    S1 -.->|"OCR / PDF Structure"| Parsers & OCR
    S2 -.->|"Vector Embeddings"| Embedder
    S5 -.->|"Cross-Encoder Rerank"| Reranker
    S5 -.->|"LLM Synthesis Prompts"| LLM_Router
    NODE_ORCHESTRATOR ===|"Sole SQLite Writer"| STORAGE
    Coordination -.->|"FSM State Transitions"| BL
```

---

### 🛡️ F52: Library / Research State Coordination Architecture

The F52 coordination architecture resolves the lifecycle coupling between original research dossiers and derived Omni readings, ensuring user reading continuity, provenance, and token accounting survive delete and re-synthesis cycles:

```mermaid
stateDiagram-v2
    [*] --> Active: Document Ingested (in_library=1, in_research=1)
    
    Active --> ResearchOnly: Delete Op A (Remove from Library, preserve in Research)
    Active --> LibraryOnly: Delete Op C (Delete source, orphan Library reading)
    Active --> Archived: Delete Op B (Remove from Library AND delete source)
    
    ResearchOnly --> Active: Synthesize Omni Reading (5.8f Re-synthesis + Progress Recovery)
    LibraryOnly --> Active: Re-attach Source Dossier
    
    ResearchOnly --> Archived: Delete Op B (Remove preserved source)
    LibraryOnly --> Archived: Delete Op B (Remove orphaned reading)
    
    Archived --> [*]: Delete Op D (Full Terminal Purge — llm_usage preserved via SET NULL)
    
    note right of Active
        in_library = 1
        in_research = 1
        Full bidirectional provenance active
    end note
    
    note right of ResearchOnly
        in_library = 0
        in_research = 1
        Source preserved in Research
        Omni reading cleanly removed
    end note
    
    note right of LibraryOnly
        in_library = 1
        in_research = 0
        Lightweight Omni reading preserved
        Badge: "Source detached"
    end note
    
    note right of Archived
        in_library = 0
        in_research = 0
        Both representations deleted
        Audit history & token ledger intact
    end note
```

#### The Four Delete Operations
1. **Operation A (Remove from Library):** Removes the derived Omni reading from the user's Library (`in_library = 0`, `in_research = 1`, `lifecycle_state = 'research_only'`). The raw source dossier remains fully preserved in Research for future synthesis.
2. **Operation B (Archive Both):** Removes the book from the active Library and flags the research dossier as archived (`in_library = 0`, `in_research = 0`, `lifecycle_state = 'archived'`).
3. **Operation C (Delete Source Only):** Deletes the underlying heavy source file while preserving the lightweight Omni reading (`in_library = 1`, `in_research = 0`, `lifecycle_state = 'library_only'`). Provenance markers update cleanly to *"Source detached"*.
4. **Operation D (Terminal Purge):** Permanently purges an archived entry and all associated chunks from storage (`book_lifecycle` row deleted).

#### 🔄 3-Tier Reading Progress Recovery Architecture (Phase 5.8f)
When a user re-synthesizes an Omni reading from an existing Research dossier, Omnitome recovers their exact reading position without resetting them to chapter 1:

```mermaid
flowchart TD
    Start["User Triggers Re-Synthesis (Phase 5.8f)<br/>POST /api/resynthesis/:dossierId"] --> Inspect["Inspect durable book_lifecycle snapshot<br/>(last_read_sequence, last_read_title, last_read_scroll_pct)"]
    
    Inspect --> T1{"Tier 1: Sequence Match?<br/>Does new chapter at last_read_sequence exist?"}
    T1 -- Yes --> ResT1["Restore Exact Sequence Position<br/>Restore chapter ID & scroll %"]
    T1 -- No --> T2{"Tier 2: Fuzzy Title Match?<br/>Levenshtein & Token Overlap > 0.6"}
    
    T2 -- Yes --> ResT2["Restore Highest Similarity Chapter<br/>Restore chapter ID & scroll %"]
    T2 -- No --> T3["Tier 3: Bounded Fallback<br/>Proportional progress clamp<br/>min(last_read_sequence, total_new_chapters)"]
    
    ResT1 --> ActiveReader["Reader Resumes Seamlessly<br/>Zero Reading Progress Lost"]
    ResT2 --> ActiveReader
    T3 --> ActiveReader
```

- **Tier 1 (Sequence Match):** Exact 1:1 chapter sequence alignment.
- **Tier 2 (Fuzzy Title Match):** Levenshtein and token overlap matching across chapter titles when chapter boundaries shift.
- **Tier 3 (Bounded Fallback):** Proportional completion fallback ensuring reading progress is never lost.

#### 🗄️ SQLite WAL Schema v3 Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    books ||--o{ book_lifecycle : "anchored by (soft FK, survives books deletion)"
    books ||--o{ chapters : "contains source chapters (1:N)"
    chapters ||--o{ smart_chapters : "compressed into (1:N)"
    chapters ||--o{ semantic_chunks : "chunked into (1:N)"
    
    book_lifecycle ||--o{ chapter_name_history : "tracks renames (ON DELETE CASCADE)"
    book_lifecycle ||--o{ synopsis_history : "versions synopsis (ON DELETE CASCADE)"
    book_lifecycle ||--o{ dossier_append_log : "logs acquisitions (UNIQUE dossier_id, file_hash)"
    book_lifecycle ||--o{ llm_usage : "audits compute (ON DELETE SET NULL)"
```

#### Token & Cost Accounting Ledger (`llm_usage`)
- **Accountant Model:** `llm_usage` rows maintain an independent foreign key `ON DELETE SET NULL`. If a book or lifecycle row is purged, historical token expenditures remain intact for audits.
- **Local LLM Zero-Dollar Policy:** Local inference (Ollama) records **$0.00 actual cost**, displaying cloud-equivalent value saved (e.g., *"Local Ollama (24,100 tokens — $0.00 actual / ~$0.05 cloud value saved)"*).

---

### ⚙️ Pipeline Reliability Arc (F65–F72) & Persistent Queue (F58)

The ingestion pipeline executes sequentially through an await barrier, backed by a persistent SQLite WAL queue and dynamic hardware-calibrated backpressure:

```mermaid
flowchart TD
    Client["Import Request<br/>(File / URL / Paste / Re-synthesis)"] --> QueueTable[("SQLite WAL import_queue<br/>(Persistent Queue Storage)")]
    
    QueueTable --> Worker["Single-Worker Queue Daemon<br/>(Strict FIFO Processor)"]
    
    subgraph PIPELINE ["Sequential 5-Stage Ingestion Pipeline (Awaited via F65 Barrier)"]
        direction TB
        S1["Stage 1: Ingest & Fast Parse<br/>(Tier 1+2 Charset Sniffer, Layout Extractor)"]
        S2["Stage 2: Semantic Indexing<br/>(BGE-M3 FP16 CUDA, 75w Merge-Back, 8K Guard)"]
        S3["Stage 3: Section Classifier<br/>(Role Detection, CJK countWords, Heuristic Path)"]
        S4["Stage 4: Editorial Planner<br/>(1,500–2,500w Units, Title Deduplication)"]
        S5["Stage 5: Synthesis & Provenance<br/>(Dynamic Timeout 8–60s, Attribution Alignment)"]
        S1 --> S2 --> S3 --> S4 --> S5
    end

    Worker ==> PIPELINE
    PIPELINE --> Finished["Mark Task: COMPLETED<br/>Update book_lifecycle & books timestamps<br/>Emit SSE 'Book Ready' (F66)"]
    Finished --> Next["Pull Next Pending Item<br/>(Peak Node.js RAM: 296 MB)"]
```

1. **Sequential Pipeline Await Barrier (F65):** Ingestion blocks until all 5 stages (including neural synthesis and paragraph attribution) finish before pulling the next queued document. Drops peak Node.js RSS under multi-book import from **14.6 GB to 296 MB (98% drop)**.
2. **Book Ready Semantics (F66):** The UI signals *"Book ready"* only after the entire neural synthesis and attribution pass completes.
3. **Dynamic Reranker Timeout Scaling (F71):** Replaced static 10s timeout with input-calibrated formula `computeRerankerTimeout = 8000 + candidates * paragraphs * 400 + paragraphs * 300` ms (clamped `[8s, 60s]`). Completely eliminated false centroid fallbacks on large chapters.
4. **Capacity-Aware Sidecar Backpressure (F72):** Non-blocking `/v1/lifecycle/status` polling with jittered 400–800ms backpressure retries when sidecar worker saturation reaches concurrency limits.
5. **Persistent SQLite Queue Worker (F58):** Background WAL queue worker with live stage checklist widget, paste wizard with mojibake fix, and expanded web discovery (arXiv, Gutenberg, IETF, Wikipedia).

---

### 🛡️ F42: 3-Class Diverse Corpus Release Gate Architecture

The F42 release gate enforces three distinct assertion classes across 10 diverse reference fixtures spanning 5 document formats:

```mermaid
flowchart TB
    subgraph FIXTURES ["10 Real-World Corpus Fixtures (5 Document Formats)"]
        direction LR
        FX1["Narrative EPUBs<br/>(Moby Dick, Pride & Prejudice)"]
        FX2["Poetry EPUB<br/>(Leaves of Grass, 290 ch)"]
        FX3["Non-English EPUB<br/>(Les Misérables, 110K words)"]
        FX4["Office Documents<br/>(Sample DOCX & RTF)"]
        FX5["Edge Cases & CJK<br/>(Aozora ShiftJIS, Chat Markdown, Prologue)"]
    end

    subgraph ENGINE ["F42 3-Class Corpus Assertion Engine"]
        direction TB
        CA["Class A: Universal Invariants<br/>• Non-zero word count<br/>• Strictly increasing chapter sequence<br/>• Integrity status != 'empty_content'"]
        CB["Class B: Baseline Tolerance Bands<br/>• Words: Baseline ± 10%<br/>• Chapters: Baseline ± 20%<br/>• Gated by --update-baseline"]
        CC["Class C: Cross-Cutting Bug Locks<br/>• C1: F51h.1 CJK chapter collapse lock<br/>• C2: F49d synopsis [PARTIAL] strip lock<br/>• C3: F51h.3 prologue narrative lock<br/>• C4: F38.11 lone-fragment drop lock"]
        CA --> CB --> CC
    end

    subgraph VERDICT ["Release Gate Verdict"]
        direction LR
        Pass["🟢 PASS (Release Green)"]
        Skip["🟡 SKIP (Requirement Probed: 'sidecar' / 'network')"]
        Fail["🔴 FAIL (Halts Release)"]
    end

    FIXTURES ==> ENGINE ==> VERDICT
```

---

### 🔄 Sidecar Model Lifecycle State Machine (F43)

```mermaid
stateDiagram-v2
    UNLOADED --> LOADING : Inference Request (/v1/embed, /v1/nlp/rerank, /v1/ocr)
    LOADING --> LOADED : Model Weights Initialized in VRAM
    LOADED --> UNLOADING : Idle Daemon Tick (TTL Expired: OCR 5m, Reranker 10m, Embed 15m)
    UNLOADING --> UNLOADED : torch.cuda.empty_cache() (Frees 3.2 GB VRAM)
    LOADED --> LOADED : Active In-Flight Requests (TTL Reset)
```

- **Per-Model TTLs:** PaddleOCR (5 min), BGE Reranker v2 (10 min), BGE-M3 Embedder (15 min).
- **Idle Daemon:** Runs every 10 seconds in a background thread; evicts models only when active in-flight requests equal zero.
- **VRAM Reclaim:** Reduces idle sidecar VRAM to **174 MB**, returning **3.2 GB of GPU VRAM** to the user's host workstation.

---

## 🎨 Theme & Visual System

Governed by three aesthetic laws:
1. **Source is paper:** Original reading renders on neutral, unadorned paper.
2. **The lens is tinted:** Omni reading carries a quiet accent identity reflecting synthesis.
3. **Derivation never masquerades as source:** Every Omni claim retains an explicit, clickable provenance path.

Omnitome features **5 adaptive themes**, procedural cover art, custom animated SVG sigils, and KaTeX math rendering:
- 🌸 **Sakura:** Quiet cherry blossom palette with delicate typography.
- 🌿 **Spring:** Sage accents with editorial breathing room.
- ☕ **Coffee:** Warm sepia tones inspired by aged parchment and bookshops.
- ⚡ **Cyberpunk:** High-contrast night theme with vibrant teal/magenta accents.
- 🌌 **Omni:** Signature brand theme with deep cosmic accents and subtle glowing sigils.

---

## 📅 Project Timeline & Chronological Build Logs

Omnitome's engineering journey documented session-by-session from `docs/session-logs/`. Below is the master chronological velocity and milestone progress dashboard reflecting real git commits, empirical benchmarks, and architectural breakthroughs:

### 📊 Chronological Velocity & Milestone Progress Dashboard (by Date)

| Date | Phase / Milestone Arc | Visual Milestone Progress Bar | % | Cumulative Capabilities & Architectural Breakthroughs | Commits | Tests |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: |
| **2026-09-17** | **Phase 0 & 1** | `[██░░░░░░░░░░░░░░░░░░]` | **10%** | BGE-M3 1024d embedding swap (v0.4.5), CLS pooling proof (1.68x separation), 40-file React 18 scaffold | 7 | 4 |
| **2026-09-18** | **Phase 2 & 3** | `[███░░░░░░░░░░░░░░░░░]` | **15%** | Immutable Research dossier route, SQLite ingestion transactions, raw text parsing | 4 | 7 |
| **2026-09-19** | **Phase 3.5** | `[████░░░░░░░░░░░░░░░░]` | **20%** | Dual-pane reading UX, TOC drawer navigation, synchronized scroll between views | 5 | 10 |
| **2026-09-20** | **Phase 4** | `[█████░░░░░░░░░░░░░░░]` | **25%** | First neural LLM compression (DeepSeek V4 Flash), reasoning token budget fix, front-matter exclusion filter | 8 | 14 |
| **2026-09-21** | **Phase 4.5** | `[██████░░░░░░░░░░░░░░]` | **30%** | Smart Badges on library cards, Omni view default reading action, typographic hierarchy | 4 | 16 |
| **2026-09-22** | **Phase 4.6** | `[███████░░░░░░░░░░░░░]` | **35%** | Automated regression harness expansion to 17 suites, parser stress test, single-book planner | 6 | 17 |
| **2026-09-23** | **Phase 4.7 & 5.0** | `[████████░░░░░░░░░░░░]` | **40%** | Two-Representation Invariant & Three Design Laws formulated; synthesis word boundaries [250, 360] | 5 | 20 |
| **2026-09-24** | **Phase 5.1** | `[█████████░░░░░░░░░░░]` | **45%** | Bibliographic extraction (ISBN/publisher/authors), deterministic paragraph-level provenance contracts | 5 | 23 |
| **2026-09-26** | **Phase 5.3** | `[██████████░░░░░░░░░░]` | **50%** | Hard architectural database split between curated Library readings and immutable Research dossiers | 4 | 26 |
| **2026-09-27–29**| **Phase 5.5** | `[██████████░░░░░░░░░░]` | **52%** | Sidecar boundary specification; decoupling heavy neural/CPU compute into a dedicated microservice | 3 | 28 |
| **2026-09-30** | **Phase 5.7.1** | `[███████████░░░░░░░░░]` | **55%** | FastAPI Python sidecar (`:8765`), PaddleOCR integration for scanned/image-only PDF recovery | 5 | 30 |
| **2026-10-01** | **Phase 5.7.2** | `[████████████░░░░░░░░]` | **58%** | Migrated BGE-M3 vectorization into Python sidecar; offloaded CPU vector compute from Node event loop | 4 | 32 |
| **2026-10-02** | **Phase 5.7.2b** | `[████████████░░░░░░░░]` | **60%** | Concurrency benchmarking, provider rate-limiting guards, local worker saturation diagnostics | 3 | 33 |
| **2026-10-03** | **Phase 5.7.3** | `[█████████████░░░░░░░]` | **64%** | Multi-format ingestion router: DOCX (`python-docx`) and RTF (`striprtf`) extraction pipelines | 6 | 35 |
| **2026-10-04** | **Phase 5.8.0j** | `[█████████████░░░░░░░]` | **66%** | End-to-end chat transcript parser (`chat_11.md`), conversation turn segmentation | 2 | 36 |
| **2026-10-04 (Eve)**| **Phase 5.8.0g/j.2**| `[██████████████░░░░░░]` | **68%** | Caption honesty (Omni time only on full generation); F23 PUA font normalizer (969 Adobe/Mac codepoints) | 3 | 38 |
| **2026-10-05** | **Phase 5.8a/b** | `[██████████████░░░░░░]` | **70%** | Replaced hardcoded CSS variables with dynamic theme engine; high-contrast Cyberpunk theme | 4 | 39 |
| **2026-10-06** | **Phase 5.8c** | `[███████████████░░░░░]` | **73%** | 5-theme engine (`omni`, `spring`, `sakura`, `coffee`, `cyberpunk`), procedural stickers, animated glowing sigils | 6 | 41 |
| **2026-10-07** | **Phase 5.8d / F31–37**| `[███████████████░░░░░]` | **76%** | KaTeX math (`pdfmath`), PyMuPDF structure detection, batch reranker (2,730 calls batched), procedural book covers | 5 | 43 |
| **2026-10-08** | **Phase 5.8e / F37.7**| `[████████████████░░░░]` | **80%** | PyTorch FP16 CUDA breakthrough: **71% VRAM drop** (1.1GB), **120x batch speedup** (<1s), rolling telemetry ETA | 5 | 45 |
| **2026-10-09** | **Phase 5.8f / F38** | `[████████████████░░░░]` | **82%** | Synthesis contract [150, 500w], manual re-synthesis path (`forceClaimForSynthesis`), scanned OCR hardening | 8 | 46 |
| **2026-10-10** | **Phase 5.8g / F43 & F45**| `[█████████████████░░░]` | **84%** | F43 Lifecycle Manager: auto-eviction daemon **frees 3.2 GB idle VRAM**; F45 configurable 50–200 MB file cap | 10 | 48 |
| **2026-10-12** | **Phase 5.8h / F51** | `[█████████████████░░░]` | **86%** | Aozora Bunko Japanese end-to-end; Tier 1+2 charset sniffer (<0.3ms); bounded attention (**62x speedup** on worst-case) | 13 | 48 |
| **2026-10-13** | **Phase 5.8h.3 / F42 & F58**| `[██████████████████░░]` | **88%** | F42 3-class corpus gate (10 fixtures, Classes A, B, C); F58 persistent SQLite WAL queue, paste wizard mojibake fix | 11 | 48 + 1 gate |
| **2026-10-14** | **Phase 5.8 / F65–72 & F52**| `[██████████████████░░]` | **89%** | F65 await barrier (**Node RAM: 14.6 GB → 296 MB, 98% drop**); dynamic timeouts (8–60s); F52 Schema v3; 52 suites green | 10 | **52 suites + 1 gate** |

---

### 🚀 Detailed Chronological Build Logs

#### 🗓️ 2026-09-17 — Phase 0 & 1: BGE-M3 Swap & Frontend Scaffold
- **Progress:** `[██░░░░░░░░░░░░░░░░░░]` 10%
- **Milestones:** Swapped 256d vectorizer for **BGE-M3 1024d** (v0.4.5). Replaced default mean pooling with **CLS pooling** after proving a **1.68x separation gap** on natural passage retrieval.
- **Frontend:** Shipped 40-file React 18 + Vite + Tailwind scaffold; connected Phase 1 Library route to live SQLite data.
- **Commits:** `0eefc1d`, `9a49cbb`, `73b6a57`, `b1e28a1`, `b5d2d51`, `fc04381`, `36fb643`.

#### 🗓️ 2026-09-18 — Phase 2 & 3: Research Route & Ingestion Pipeline
- **Progress:** `[███░░░░░░░░░░░░░░░░░]` 15%
- **Milestones:** Shipped Research route for immutable documents; implemented raw document parser and SQLite ingestion transactions.

#### 🗓️ 2026-09-19 — Phase 3.5: Dual-Pane Reader & Navigation
- **Progress:** `[████░░░░░░░░░░░░░░░░]` 20%
- **Milestones:** Shipped dual-pane reading UX; bound chapter navigation, TOC drawer, and scroll sync between views.

#### 🗓️ 2026-09-20 — Phase 4: First Successful Neural Compression
- **Progress:** `[█████░░░░░░░░░░░░░░░]` 25%
- **Milestones:** Achieved first real LLM semantic compression (328–373 words) via OpenRouter DeepSeek V4 Flash. Discovered reasoning tokens consumed the entire 550-token budget; enforced `reasoning: { enabled: false }`. Added front-matter exclusion filter so book covers are never compressed as chapter 1.
- **Commits:** `70a31c4`, `7b66648`, `d2f5605`, `fa02d2a`, `b3d22b5`, `07675e0`, `8f29417`, `c0d3764`.

#### 🗓️ 2026-09-21 — Phase 4.5: Library Badging & Reader Experience
- **Progress:** `[██████░░░░░░░░░░░░░░]` 30%
- **Milestones:** Added Smart Badges to library cards; defaulted reading action to Omni view; refined typographic hierarchy.

#### 🗓️ 2026-09-22 — Phase 4.6: Test Suite Expansion
- **Progress:** `[███████░░░░░░░░░░░░░]` 35%
- **Milestones:** Expanded automated regression suites to 17 suites, covering parser stress, single-book planner, and contract verification.

#### 🗓️ 2026-09-23 — Phase 4.7 & 5.0: Architectural Audit & Synthesis Contracts
- **Progress:** `[████████░░░░░░░░░░░░]` 40%
- **Milestones:** Formulated the *Two-Representation Invariant* and *Three Design Laws*; locked synthesis word-count boundaries [250, 360].

#### 🗓️ 2026-09-24 — Phase 5.1: Bibliographic Extraction & Provenance Foundation
- **Progress:** `[█████████░░░░░░░░░░░]` 45%
- **Milestones:** Shipped `bookBibliographer.js` extracting publisher, ISBN, publication year, and authors (verified against CRC Press and Apple 10-K). Locked the paragraph-level provenance resolution contract.
- **Commits:** `3814ebf`, `b8e1021`, `83a9bae`, `ce5d475`, `abae7db`.

#### 🗓️ 2026-09-26 — Phase 5.3: Library / Research Architectural Split
- **Progress:** `[██████████░░░░░░░░░░]` 50%
- **Milestones:** Implemented hard database split between curated Library readings and immutable Research dossiers.

#### 🗓️ 2026-09-27 — 2026-09-29: Architectural Transition & Sidecar Design Gate
- **Progress:** `[██████████░░░░░░░░░░]` 52%
- **Milestones:** Architectural design review for offloading CPU-intensive NLP, OCR, and GPU vectorization from Node.js to a dedicated Python FastAPI microservice.

#### 🗓️ 2026-09-30 — Phase 5.7.1: Python Sidecar & PaddleOCR
- **Progress:** `[███████████░░░░░░░░░]` 55%
- **Milestones:** Spawned FastAPI Python sidecar on `127.0.0.1:8765`. Integrated PaddleOCR for image-only PDF text recovery.

#### 🗓️ 2026-10-01 — Phase 5.7.2: Sidecar BGE-M3 Migration
- **Progress:** `[████████████░░░░░░░░]` 58%
- **Milestones:** Migrated BGE-M3 vector generation from Node HuggingFace Transformers into the Python sidecar.

#### 🗓️ 2026-10-02 — Phase 5.7.2b: Concurrency Benchmarking
- **Progress:** `[████████████░░░░░░░░]` 60%
- **Milestones:** Conducted empirical diagnostic testing on OpenRouter concurrency and local worker saturation.

#### 🗓️ 2026-10-03 — Phase 5.7.3: Capability Router & Multi-Format Ingestion
- **Progress:** `[█████████████░░░░░░░]` 64%
- **Milestones:** Added DOCX (`python-docx`) and RTF (`striprtf`) ingestion pipelines via sidecar capability router.

#### 🗓️ 2026-10-04 — Phase 5.8.0j: Chat-Log Parser
- **Progress:** `[█████████████░░░░░░░]` 66%
- **Milestones:** Implemented end-to-end chat transcript parser (`chat_11.md`) with dialogue turn segmentation and AST blocks.
- **Commits:** `5a4451c`.

#### 🗓️ 2026-10-04 (Late Evening) — Phase 5.8.0g.2 & 5.8.0j.2: Label Honesty & Legacy PUA Normalizer
- **Progress:** `[██████████████░░░░░░]` 68%
- **Milestones:** 
  - **Label Honesty (`448ca25`):** Book Details caption now displays Omni reading time only when `smartGenerated === smartTotal`; partial-generation documents show honest source-only time.
  - **F23 Legacy PUA Font Normalizer (`f390a14`):** Diagnosed 969 PUA codepoints across real-world ML PDFs (signature of Mac/Adobe Symbol LaTeX/MathType encoding). Shipped `legacyFontNormalizer.js` with 6 confirmed mappings and honest bracket placeholders.
- **Commits:** `448ca25`, `f390a14`.

#### 🗓️ 2026-10-05 — Phase 5.8a/b: Theme System Restructure & Cyberpunk Theme
- **Progress:** `[██████████████░░░░░░]` 70%
- **Milestones:** Replaced hardcoded CSS variables with dynamic theme engine; introduced high-contrast Cyberpunk theme.

#### 🗓️ 2026-10-06 — Phase 5.8c: 5-Theme Engine & Animated Sigils
- **Progress:** `[███████████████░░░░░]` 73%
- **Milestones:** Completed all 5 adaptive themes (`omni`, `spring`, `sakura`, `coffee`, `cyberpunk`) with decorative SVG stickers and animated glow sigils.

#### 🗓️ 2026-10-07 — Phase 5.8d / F31–F37: Procedural Covers, KaTeX Math & PyMuPDF Structure
- **Progress:** `[███████████████░░░░░]` 76%
- **Milestones:** 
  - **F31 Math Extraction:** Mounted `pdfmath` endpoint in sidecar with frontend KaTeX rendering.
  - **F32 Structure Detection:** PyMuPDF fast TOC extraction replaced per-block LLM classification.
  - **F34 Batch Reranker:** Shipped `POST /v1/nlp/rerank-batch` and `rerank-batch-multi`, reducing 2,730 sequential HTTP calls to batched round trips.
  - **Procedural Art:** Added dynamic SVG geometric book covers and theme-specific sigils.
- **Commits:** `587cf4d`, `d15b9ca`, `49f26a1`, `3d142d3`, `df9bff0`.

#### 🗓️ 2026-10-08 — Phase 5.8e / F37.7: FP16 CUDA Embedding Breakthrough
- **Progress:** `[████████████████░░░░]` 80%
- **Milestones:** Enabled PyTorch CUDA FP16 for BGE-M3. Active VRAM plummeted from **3,959 MiB to 1,135 MB (71% drop)**. 16-chunk batch latency dropped from **124 seconds to under 1 second (120x speedup)**. Added live batch telemetry with rolling ETA.
- **Commits:** `48a80e8`, `7d70b7e`, `ef8096d`, `6b387ae`, `3174b83`.

#### 🗓️ 2026-10-09 — Phase 5.8f / F38: Synthesis Contract & OCR Hardening
- **Progress:** `[████████████████░░░░]` 82%
- **Milestones:** Diagnosed 3-word overshoot bug; replaced contradictory prompt rules with a single range contract `[250, 360]` words and absolute ceiling 500 words. Added manual re-synthesis path (`forceClaimForSynthesis`). Hardened OCR for non-standard PDF scans.
- **Commits:** `cdb11ce`, `8e67d44`, `fedeee8`, `d0bbce7`, `1d81623`, `3e32cfa`, `6cd3fe1`, `f586e9d`.

#### 🗓️ 2026-10-10 — Phase 5.8g / F43 & F45: Sidecar Lifecycle Manager & Import Size Cap
- **Progress:** `[█████████████████░░░]` 84%
- **Milestones:** Implemented `LifecycleManager` state machine with background daemon loop (10s tick). Automatically evicts idle models, **freeing 3,257.9 MB (3.2 GB) VRAM** back to the operating system. Transparent on-demand reload in ~6.5s. Configured `IMPORT_MAX_SIZE_MB` (50–200 MB via F45).
- **Commits:** `46232bb`, `fc638b8`, `90d3046`, `18f7097`, `3423233`, `ba021a6`, `72a5fb8`, `cb62a6f`, `d13dc0f`, `a30a379`.

#### 🗓️ 2026-10-12 — Phase 5.8h / F51: Aozora Bunko Japanese End-to-End Ingestion
- **Progress:** `[█████████████████░░░]` 86%
- **Milestones:** Successfully ingested *Chijin no Ai* (*痴人の愛*, 201K chars, 29 chapters). Shipped Tier 1 BOM + Tier 2 statistical `jschardet` encoding detection (<0.3ms fast path). Unified `countWords()` helper (whitespace tokens + CJK chars × 0.7). Added `AOZORA_HEADING_REGEX` and bounded embed attention (`EMBED_MAX_SEQ_LENGTH = 2048`, `batch_size = 4`), achieving a **62x speedup on worst-case inputs**.
- **Commits:** `7a6a530`, `370f86f`, `779aea3`, `fc2c086`, `844c566`, `2544dd8`, `c67d970`, `2170586`, `155b3c7`, `98dfee0`, `9fa8a1f`, `bae9c5d`, `b663dc2`.

#### 🗓️ 2026-10-13 — Phase 5.8h.3 / F42 & F58: 3-Class Corpus Gate & Persistent Import Queue
- **Progress:** `[██████████████████░░]` 88%
- **Milestones:**
  - **F42 Corpus Release Gate:** Built 3-class assertion engine (A: universal invariants, B: tolerance bands ±10% words/±20% chapters, C: bug locks) across 10 diverse fixtures.
  - **F58 Persistent Import Queue:** Built SQLite WAL-backed single-worker queue with live checklist widget, paste wizard with mojibake fix, and expanded web discovery (arXiv, Gutenberg, IETF Datatracker, Wikipedia).
- **Commits:** `1a89222`, `fe66031`, `5019425`, `905de59`, `1de10e8`, `de8c611`, `9e5e4ef`, `66aa9f0`, `eed0468`, `c5fd69f`, `69bc025`.

#### 🗓️ 2026-10-14 — Phase 5.8 / F65–F72 & F52: Pipeline Reliability Arc & State Coordination
- **Progress:** `[██████████████████░░]` 89%
- **Milestones:**
  - **F65–F72 Pipeline Reliability Arc:** Awaited full pipeline inside `importBook()`. Peak Node.js RAM under import dropped from **14.6 GB to 296 MB (98% drop)** with zero reranker timeouts. Shipped input-calibrated dynamic reranker timeout scaling (8s to 60s, F71) and sidecar capacity backpressure retries (F72).
  - **F52 Library/Research State Coordination:** Designed and implemented normalized coordination schema (user_version = 3, `book_lifecycle` + 4 satellite history tables). Shipped 4 delete operations, 3-tier reading progress recovery, and accountant-model token ledger (`llm_usage` surviving deletions).
  - **Regression Gate:** **All 52 unit test suites + 1 corpus gate passed clean.**
- **Commits:** `32e3ea9`, `b076dd8`, `63b9be4`, `9498815`, `d047d59`, `1b5f402`, `5d7b87d`, `a9fe14d`, `9888bed`, `8c54ea2`.

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js 22 LTS** (see `.nvmrc`)
- **Python 3.10+** (for the neural sidecar)
- **Local LLM Engine** (Ollama recommended at `http://localhost:11434/v1`) or OpenRouter API key

### Installation

```bash
# Clone the repository
git clone https://github.com/avengersvstheflash/Smart-Reader.git
cd Smart-Reader

# Install Node dependencies & configure environment
npm install
cp .env.example .env

# Set up Python sidecar virtual environment
cd sidecars/python
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
# source .venv/bin/activate
pip install -r requirements.txt
cd ../..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Running the Services

```bash
# Terminal 1 — Python Neural Sidecar (:8765):
cd sidecars/python
uvicorn main:app --port 8765

# Terminal 2 — Node Orchestrator & Backend (:3000):
node backend/server.js

# Terminal 3 — React Frontend Dev Server (:5173):
cd frontend
npm run dev
```

### Running the Regression Test Suite & Benchmarks

```bash
# Run all 52 regression suites + the 10-fixture corpus gate:
npm test
# (Equivalent to: node scripts/run-all-tests.js)

# Run the 10-fixture corpus release gate standalone:
node scripts/run-corpus-tests.js              # Standard gate (Class A + B + C)
node scripts/run-corpus-tests.js --dry-run    # Invariant checks only (Class A + C)

# Run the empirical performance & throughput benchmark suite:
node scripts/run-benchmarks.js

# Run the 22-document Juncture corpus benchmark:
node scripts/run-juncture-benchmark.js
```

---

## 🗺️ Roadmap & Phase Status

| Phase | Milestone / Objective | Status | Notes & Capabilities |
| :---: | :--- | :---: | :--- |
| **5.0** | Core Capabilities Foundation | 🟢 CLOSED | Word-count distribution, initial reading contracts |
| **5.7** | Python Neural Sidecar Foundation | 🟢 CLOSED | PaddleOCR, pysbd NLP, modular router |
| **5.8.0**| Compression Contract & Word Sizing | 🟢 CLOSED | 1,500–2,500w units, front-matter exclusion |
| **5.8a/c**| Rebrand + 5-Theme Engine + Sigils | 🟢 CLOSED | Full CSS variables, procedural cover generator, 5 themes |
| **F37.x**| FP16 PyTorch CUDA Acceleration | 🟢 CLOSED | 71% VRAM reduction (1.1GB), 120x batch speedup |
| **F38.x**| Synthesis Range Contract & Recovery | 🟢 CLOSED | [150, 500w] validation, `forceClaimForSynthesis` path |
| **F42**  | 3-Class Diverse Corpus Release Gate | 🟢 CLOSED | 10 fixtures, universal invariants, baseline tolerance bands |
| **F43**  | Sidecar Lifecycle & Idle Eviction | 🟢 CLOSED | 3.2 GB idle VRAM freed; transparent ~6.5s reload |
| **F45**  | Configurable Import File Size Cap | 🟢 CLOSED | 50–200 MB configurable via `IMPORT_MAX_SIZE_MB` |
| **F51**  | Aozora Bunko Japanese End-to-End | 🟢 CLOSED | Tier 1+2 charset detection, bounded embed attention |
| **F58**  | Persistent SQLite Import Queue | 🟢 CLOSED | Background WAL queue, stage checklist, web discovery |
| **F65-72**| Sequential Pipeline Reliability Arc | 🟢 CLOSED | Await barrier (RAM 14.6GB → 296MB), dynamic reranker timeout |
| **F52**  | Library/Research State Coordination | 🟢 CLOSED | Schema v3, 4-way delete FSM, 3-tier reading progress recovery |
| **5.8j-k**| Settings & Help Pages | 🟢 CLOSED | `/settings` + `/help` routes, token cost accounting ($0.00 Ollama) |
| **5.8i** | Full Frontend Walkthrough | ⏳ **CURRENT** | Verification of all routes, modals, and stage indicators |
| **5.9**  | Kokoro Local TTS Audio Narration | ⏳ QUEUED | 3 sessions planned (local neural speech synthesis) |
| **6.0**  | Tauri Desktop Packaging → v1.0 | ⏳ QUEUED | 5–8 sessions planned (cross-platform desktop binary) |

**Current Focus:** Phase 5.8i full frontend route and modal walkthrough preparing for v1.0 desktop packaging.

> For deep architectural insights and findings, see [`docs/SESSION_HANDOFF.md`](./docs/SESSION_HANDOFF.md) and [`docs/DESIGN_LIBRARY_RESEARCH_STATE.md`](./docs/DESIGN_LIBRARY_RESEARCH_STATE.md).

---

## 📄 License

Omnitome is open-source software licensed under the [MIT License](./LICENSE).
