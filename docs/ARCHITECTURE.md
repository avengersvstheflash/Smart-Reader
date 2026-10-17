# Omnitome System Architecture

> In-depth engineering documentation for the Omnitome local-first neural reading library.

---

## 🏛️ Foundational Invariant: The Two-Representation Model

Omnitome enforces an uncompromising product identity founded on the separation of ground truth from derived synthesis:

| Representation | Placement | Behavior & Governance |
| :--- | :--- | :--- |
| 📄 **Original Reading** | **Research View** | **Immutable source.** The document exactly as uploaded. Nothing in the system modifies it. Governed by **Law 1: *"Source is paper"*** — neutral, calm, book-like typography serving as authoritative ground truth. |
| 🧠 **Omni Reading** | **Library View** | **Derived lens.** An adaptively compressed representation (~7:1 density) preserving core concepts and arguments. Governed by **Law 2: *"The lens is tinted"*** and **Law 3: *"Derivation never masquerades as source"*** — every claim retains deterministic paragraph-level provenance. |

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

## 🏗️ Hybrid Multi-Process Topology

Omnitome adopts a specialized multi-process topology separating orchestrational state management from heavy neural compute and native desktop presentation:

1. **Native Desktop Shell (Tauri v2 / Rust):** Manages window lifecycles, intercepts system shutdown signals, and acts as process supervisor for child processes.
2. **Orchestrator & State Engine (Node.js 22 LTS / Express 5):** Owns API routing, import queue persistence, editorial planning, LLM provider routing, and database writes. Node is the **sole SQLite writer**.
3. **Neural & Computation Sidecar (FastAPI / Python 3.10+):** Local microservice (`127.0.0.1:8765`) executing PyTorch FP16 CUDA vectorization, cross-encoder reranking, Kokoro-82M voice synthesis, and OCR parsing.
4. **Interactive Client (React 18.3 / Vite / Tailwind CSS):** Dual-pane and single-pane reading surfaces, KaTeX mathematical typesetting, synchronized audio highlights, and theme styling.

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
        TTS["Kokoro-82M TTS<br/>(Dual-Deck Audio Engine)"]
        
        LifecycleMgr -->|"Auto-Evicts on TTL"| Embedder & Reranker & OCR & TTS
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

## 🛡️ F52: Library / Research State Coordination

The F52 architecture decouples the lifecycle of original research dossiers from derived Omni readings. This guarantees that user annotations, reading continuity, and audit histories survive deletion and re-synthesis cycles.

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

### The Four Delete Operations
1. **Operation A (Remove from Library):** Removes the derived Omni reading (`in_library = 0`, `in_research = 1`, `lifecycle_state = 'research_only'`). The raw source dossier remains fully preserved in Research for future re-synthesis.
2. **Operation B (Archive Both):** Removes the book from the active Library and flags the research dossier as archived (`in_library = 0`, `in_research = 0`, `lifecycle_state = 'archived'`).
3. **Operation C (Delete Source Only):** Deletes the underlying heavy source file while preserving the lightweight Omni reading (`in_library = 1`, `in_research = 0`, `lifecycle_state = 'library_only'`). Provenance badges update cleanly to *"Source detached"*.
4. **Operation D (Terminal Purge):** Permanently purges an archived entry and all associated chunks from storage (`book_lifecycle` row deleted).

---

### 🔄 3-Tier Reading Progress Recovery Architecture (Phase 5.8f)

When a user re-synthesizes an Omni reading from an existing Research dossier, Omnitome dynamically recovers their exact reading position without resetting them to chapter 1:

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

---

### 🗄️ SQLite WAL Schema v3 Entity Relationship Diagram (ERD)

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

## ⚙️ Ingestion Pipeline Reliability (F65–F72) & Persistent Queue (F58)

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
3. **Dynamic Reranker Timeout Scaling (F71):** Replaced static 10s timeout with input-calibrated formula:
   $$\text{timeout} = 8000 + (\text{candidates} \times \text{paragraphs} \times 400) + (\text{paragraphs} \times 300)\text{ ms}$$
   clamped to $[8000, 60000]\text{ ms}$. This completely eliminates false centroid fallbacks on large chapters.
4. **Capacity-Aware Sidecar Backpressure (F72):** Non-blocking `/v1/lifecycle/status` polling with jittered 400–800ms backpressure retries when sidecar worker saturation reaches concurrency limits.
5. **Persistent SQLite Queue Worker (F58):** Background WAL queue worker with live stage checklist widget, paste wizard with mojibake fix, and expanded web discovery (arXiv, Gutenberg, IETF, Wikipedia).

---

## 🛡️ F42: 3-Class Diverse Corpus Release Gate

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

- **Class A (Universal Invariants):** Invariants that must hold for every document regardless of format: non-zero word count, monotonic chapter sequence, and non-empty content integrity.
- **Class B (Baseline Tolerance Bands):** Verifies that parsing output stays within ±10% words and ±20% chapters compared to committed golden baselines.
- **Class C (Regression Bug Locks):** Locks specific historical edge-case bugs:
  - `C1`: CJK chapter boundary collapse prevention.
  - `C2`: Synopsis `[PARTIAL]` tag stripping verification.
  - `C3`: Prologue narrative categorization protection.
  - `C4`: Lone fragment omission lock.

---

## 🔄 Sidecar Model Lifecycle State Machine (F43)

To maintain workstation responsiveness on consumer hardware, the Python sidecar incorporates an automated lifecycle eviction daemon:

```mermaid
stateDiagram-v2
    UNLOADED --> LOADING : Inference Request (/v1/embed, /v1/nlp/rerank, /v1/ocr, /v1/tts)
    LOADING --> LOADED : Model Weights Initialized in VRAM
    LOADED --> UNLOADING : Idle Daemon Tick (TTL Expired: OCR 5m, TTS 5m, Reranker 10m, Embed 15m)
    UNLOADING --> UNLOADED : torch.cuda.empty_cache() (Frees 3.2 GB VRAM)
    LOADED --> LOADED : Active In-Flight Requests (TTL Reset)
```

- **Per-Model Time-To-Live (TTL):**
  - Kokoro TTS: 5 minutes
  - PaddleOCR: 5 minutes
  - BGE Reranker v2: 10 minutes
  - BGE-M3 Embedder: 15 minutes
- **Idle Daemon:** Runs every 10 seconds in a background thread; evicts models only when active in-flight requests equal zero.
- **VRAM Reclaim:** Reduces idle sidecar VRAM to **174 MB**, returning **3.2 GB of GPU VRAM** to the user's host workstation.

