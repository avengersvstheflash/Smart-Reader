# Canonical Test Book

> **Purpose.** A single real book every frontend and backend test
> verifies against. Not synthetic fixtures — real content with known
> ground truth. When a test passes against this book, it's not a
> coincidence.

## The book

**File:** `backend/tests/fixtures/practical_machine_learning.pdf`
**Title:** Practical Machine Learning: A Beginner's Guide with Ethical Insights
**Authors:** Nyamawe, Mjahidi, Nnko, Diwani, Minja, Malyango
**Publisher:** CRC Press, 2025 (Open Access)
**License:** CC-BY-NC-ND 4.0
**Book ID (current DB):** `book-1789899596664-rpfcd` (changes on reimport)

## Known ground truth — parse stage

| Stage | Expected | Verified |
|---|---|---|
| Total structures | 15 | ✅ |
| Front matter | 4 (title, about, preface, acknowledgments) | ✅ |
| Body chapters | 8 | ✅ |
| Appendices | 1 | ✅ |
| Index | 1 | ✅ |
| Total words | ~69,400 | ✅ |
| Parse time | ~2s | ✅ |

## Known ground truth — chunk + index stage

| Stage | Expected | Verified |
|---|---|---|
| Total chunks | ~490 | ✅ (494 observed 2026-09-20) |
| Chunk word range | 350–500 | pending |
| Embedding model | BGE-M3 1024d q8 | ✅ |
| Index time | ~10s | pending |

## Known ground truth — editorial + synthesis stage

| Stage | Expected | Verified |
|---|---|---|
| Outline chapters | 6–10 single_book | ❌ (15 planned 2026-09-20 — too many) |
| Synopsis drawn from | preface p.10 + TOC p.6 + first paras | ✅ (Gate 3 confirmed) |
| Smart chapter target | 250–360 words | ❌ (3023 observed 2026-09-20) |
| Smart chapter hard bounds | 180–450 words | ❌ (validation fired but LLM ignored) |
| Provenance per chapter | 2+ source chunks | pending |
| Fallback chapters (if OpenRouter up) | 0 | ⚠️ mixed |

## Frontend verification checklist

Walk this list against the canonical book after every frontend change.

| Check | Where | Pass criteria | Status 2026-09-20 |
|---|---|---|---|
| Library shows book + Smart badge | `/` | Card with badge | ✅ |
| Book Details opens | Click card | Hero + synopsis + chapters | ✅ |
| Chapter list = 8 body chapters | Book Details | 8 visible, front matter excluded | ✅ |
| Semantic status | Book Details | "Indexed: 494 chunks ● ready" | ✅ |
| [Read] lands in Smart | Click Read | URL has `?rep=smart` | ✅ |
| Synopsis shows real content | Book Details | No "Structured synopsis" caption | ❌ fiction template |
| Synopsis drawn from preface | Book Details | Content reflects preface topic | ❌ fiction template |
| Smart chapter word range | Reader header | 250–360 (or 180–450) | ❌ 2692–3023 |
| No `[Source N]` in text | Reader body | 0 occurrences | ✅ |
| Smart chapters distinct | Reader body | No duplicate content across chapters | ❌ Ch3/Ch4 identical |
| Original toggle shows source | Reader toggle | Real source text | ✅ |
| Prev/Next navigation | Footer | Chapter N of 15 | ✅ |

## Known issues (2026-09-20)

### Phase 4.8.1 — Compressor prompt + input sizing (PRIORITY)

**Root cause identified:** Smart Reader produces **summaries**, not
**compressions**. The LLM prompt uses "synthesize" language, which
invites narrative transformation proportional to source size. Observed:
3023-word Smart chapter from ~15k words of source, with classic
summarizer register ("Machine learning represents one of the most
transformative technologies of the modern era...").

**Concrete evidence:**
- 3 chapters synthesized 2026-09-20 10:21–10:23 UTC: 1904 / 1714 / 3023 words
- 3 chapters synthesized 2026-09-20 ~10:53 UTC: 3023 words each, one flagged `length_violation: true`
- Prompt word bound (250-360) ignored — LLM obeys computed target, not instruction
- `editorialPlanner` assigns ~15k source words per editorial chapter

**Fix:** See Phase 4.8.1 in SESSION_HANDOFF.md §4.

### Phase 4.10 — contentType detection on import

Import defaults `contentType` to `'novel'`. Fiction template used for
technical book synopsis. Fix: infer contentType from structure +
vocabulary, or add UI selector.

### Phase 4.11 — Grounding density check

Ch1 conjured 1904 words from thin source. No validation exists for
"output length disproportionate to input." Add: if source word count
< 200 and output > 400, mark `metadata.grounding_violation = true`.

### Fallback content diversity

Ch3/Ch4 byte-identical when LLM times out. Fallback synthesizer not
chapter-aware. 4.x polish.

### Naming note

The word "synthesis" appears throughout the codebase (editorialService,
synthesisService, chapter_representations types). These are historical
names. Per PRODUCT_VISION §"Compression, not summarization", the
pipeline is compression. Rename over time, not in one pass. New code
should use "compression" language.

---
## Reset + reimport procedure

```powershell
# Reset database
curl.exe -X POST http://localhost:3000/api/dev/reset

# Remove sample books (they interfere with frontend testing)
node -e 'const db=require("better-sqlite3")("storage/data.db");db.prepare("DELETE FROM books WHERE id LIKE ?").run("%sample%");console.log("samples cleared");'

# Import CRC PDF via API
curl.exe -X POST http://localhost:3000/api/books/import -F "file=@backend/tests/fixtures/practical_machine_learning.pdf"

# Capture new book ID
node -e 'const db=require("better-sqlite3")("storage/data.db");const b=db.prepare("SELECT id FROM books ORDER BY created_at DESC LIMIT 1").get();console.log(b.id);'

# Wait ~2–3 min for background pipeline, then verify counts
node -e 'const db=require("better-sqlite3")("storage/data.db");const b=db.prepare("SELECT id FROM books ORDER BY created_at DESC LIMIT 1").get();console.log("Chapters:",db.prepare("SELECT COUNT(*) c FROM chapters WHERE book_id=?").get(b.id).c);console.log("Chunks:",db.prepare("SELECT COUNT(*) c FROM semantic_chunks WHERE book_id=?").get(b.id).c);console.log("Reps:",db.prepare("SELECT COUNT(*) c FROM chapter_representations WHERE book_id=?").get(b.id).c);'