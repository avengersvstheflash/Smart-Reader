# Smart Reader — Product Vision

> **North star document.** Every technical decision defers to this. The
> backend exists to serve this model; the frontend exists to surface it.
> When implementation and this document disagree, this document wins —
> or this document gets revised deliberately, in its own commit.

---

## The core insight

Smart Reader is not a summary app. It is a **navigable lens over source
material you own**. Every compressed view is traceable back to the exact
position and passage it was derived from.

The Original is not a "mode." It is the ground truth you reach by
clicking through from Smart. The two representations are not peers —
one serves the other.

---

## The backend model — word-count-driven, not chapter-driven

### On import

1. Parse the file. Detect all sections — body chapters, preface, table
   of contents, index, appendix, front matter.

2. **Strip non-body content** from the chapter synthesis pipeline:
   preface, index, TOC, boilerplate. These sections are still stored
   and processed, but they feed the **synopsis**, not the chapters.

3. Compute total **body** word count.

4. Distribute body words into source units of **1,500–2,500 words**
   (target ceiling 2,800). This is **not** the same as source chapter
   boundaries. A source unit may span the end of one chapter and the
   beginning of the next.
   - **Boundary tolerance:** when a natural chapter break falls within
     ±10% of the target word count, shift the unit boundary to the
     chapter break. Prefer clean boundaries when they're close; only
     cut mid-chapter when the deviation would exceed 10%.

5. Each source unit → **one Smart Chapter**, output **250–360 words**
   (compression ratio ~7:1). The output length is a **target**, not a
   guarantee — the UI must handle 200-word and 420-word outputs
   gracefully. Hard bounds: 180 minimum, 450 maximum. Anything outside
   is a synthesis failure and triggers a retry.

6. **Synopsis is generated first**, before chapters, from:
   - the preface (if present)
   - the table of contents
   - strategic samples: first paragraph of chapter 1, first paragraph
     of the last chapter

   The synopsis is not a compressed version of the body. It is an
   **abstract drawn from the author's own framing**. Body compression
   produces a summary of the body; the abstract produces the *point*
   of the book.

### The smart internal ledger

The result of processing is a ledger:
```
source words (format-appropriate position, sequence)
→ source unit id
→ smart chapter id
→ synthesized text
→ per-sentence citation refs back to source chunks
```

Every line in a Smart Chapter knows which source chunk it came from,
which source chapter that chunk belongs to, and which position.

---

## Compression, not summarization

Smart Reader is a **compression** engine, not a **summarization**
engine. The difference is the whole product.

A summarizer:
- Skips content to fit a narrative
- Adds framing not in the source
- Produces output length proportional to input
- Invents connective tissue between ideas
- Answers the question "what is the gist?"

A compressor:
- Preserves every distinct concept, argument, and factual claim
- Adds nothing that isn't in the source
- Produces output length dictated by the instruction, not the input
- Uses the source's own structure, denser
- Answers the question "what would this say if every sentence
  carried 5–8× its information?"

Every Smart Chapter is a **compressed** representation of its source
unit. Every sentence is a compression of one or more source sentences.
The ideas survive; the phrasing doesn't.

This is why the two-representation invariant works: the original is
the fully expanded source; Smart is the compressed lens. Nothing is
lost, only densified. Trace any compressed line back and you'll find
the full source idea it derived from.

### The ratio

- Source unit: 1,500–2,500 words
- Smart Chapter target: 250–360 words
- Compression ratio: **~5:1 to ~10:1, target ~7:1**
- Hard output bounds: 180 minimum, 450 maximum
- If a source unit is only 800 words, output ~200 words — short
  but honest. Do not pad.
- If a source unit is 5,000 words, split into two source units
  before synthesis. Do not compress at 15:1 — quality collapses.

### Implementation implications

- **Prompts must say "compress," never "synthesize" or "summarize."**
  The word sets the mode. "Synthesize" invites narrative
  transformation; "compress" demands preservation.
- **Output length is a hard ceiling, not a target.** The prompt
  must use "exactly N words" with explicit hard bounds, not
  "approximately N words."
- **Retry behavior:** if the LLM overflows, retry with stricter
  framing (explicit ratio, explicit "do not exceed").
- **Failure mode:** if the source's information density is too
  high for the target M, the LLM should emit `[INSUFFICIENT_M:
  needs ~X words]` as the last line rather than silently overflowing.
- **Length violations (>M+30 or <M-30) are compression failures**,
  not content failures. Flag them as such in metadata
  (`compression_violation: true` rather than `length_violation`).
- **The compression ratio is the fundamental quality metric.**
  2,000 source words → 300 output words is a ~6.7:1 compression.
  Ratio outside [4:1, 10:1] is a red flag worth investigating.

### What this rules out

- Calling the pipeline "synthesis" in code, prompts, or docs
  (rename over time, not in one pass)
- Any prompt that says "provide a comprehensive overview of..."
- Any prompt that says "summarize the following..."
- Any output that adds framing not present in the source

---

## The frontend model — Smart is the surface, Original is the depth

### Reader defaults to Smart

The user sees the derived lens first. Original is reached by tracing
back from a specific Smart passage, or by explicit toggle.

### Import shows real progress

Parsing → stripping → distributing → synopsis → synthesizing Chapter 1
→ Chapter 2 → ... Each stage animates into the UI with genuine
status from `processing_jobs`. **No `setTimeout` theatre.** If a stage
takes 40 seconds, the UI says 40 seconds, not a fake progression.

### Inline source tracker

Every Smart sentence carries a subtle citation marker. Interaction
opens the source material **inside the Smart Reader interface** at the
exact position, with the passage highlighted.

**Cross-platform interaction pattern:**

- **Desktop:** hover reveals the marker; click opens the source panel.
- **Tablet:** tap-and-hold reveals a "Trace to source" action.
- **Mobile:** long-press (with haptic feedback) opens an action sheet
  with "Trace to source."

The source view is **not a separate route**. It is an overlay or side
panel within the reader. The user never leaves the Smart Reader — the
original material is available within it.

**Round-trip required:** after tracing to source, browser Back (or
explicit close) returns to the exact Smart position, not to the top of
the chapter.

---

## Trust is fragile — provenance must be earned, not decorative

This is the moat. It must be enforced, not hoped for.

### The failure mode to avoid

If the backend stores only "which chunks the LLM was given," and the
LLM writes a plausible sentence that synthesizes nothing specific
from any chunk, then clicking "Trace to source" lands on chunks that
**don't support the claim**. The moat collapses in one click. The
user never trusts the app again.

### The three-layer enforcement

**1. Prompt-level.**
Every sentence in a Smart Chapter must end with a citation marker
(`[1]`, `[2]`). The LLM is instructed: *"If you cannot cite a source
chunk for a sentence, do not write it."*

**2. Validation-level.**
If fewer than **80% of sentences** in a generated chapter have
citations, the chapter is rejected and regenerated. Failed
validations are logged with the chapter id and provider used.

**3. UI-level.**
Sentences without a citation render in a visibly different style —
`text-ink-muted` with a dotted underline instead of `text-ink` with
solid. **Honest about what is traced and what is not.** Never silently
link to the nearest chunk.

---

## Position, not page — formats do not share a coordinate system

Your source material may be PDF, EPUB, HTML, Markdown, or plain text.
Only PDF has pages. The product must not promise "page 47" for a book
that has no pages.

**Format-appropriate position representation:**

| Source format | Position expressed as |
|---|---|
| PDF | page N |
| EPUB | location (chapter + paragraph index) |
| HTML / web | anchor or paragraph index |
| Markdown | line N |
| Plain text | line N |

The backend already stores `semantic_chunks.source_page` for PDF. For
other formats, position falls back to chapter + sequence. The UI
displays whichever the source provides — never invents one.

---

## Smart Chapters are their own object

A Smart Chapter may span the end of source Chapter 3 and the start of
source Chapter 4. It is **not** "Chapter 3.5" or "Chapters 3-4."

Smart Chapters have:
- **their own titles**, generated by the LLM from content
- **their own numbering** (1, 2, 3...)
- **their own reading length** (target 250–360 words)

The source mapping is a provenance concern, not a naming concern.
Smart Chapter titles are *about the argument*, not inherited from
source boundaries. This is more useful to the reader than inherited
titles would be.

---

## The source view is text-first

**v1 renders the stored parsed text with the target passage
highlighted** — not the raw PDF page, not a PDF viewer embedded in the
browser.

Rationale: in-browser PDF rendering requires `pdfjs-dist` (~500KB
bundle), canvas page rendering, scroll synchronization, and a class of
bugs unrelated to the core product. Users who click "Trace to source"
want to **verify the claim** — they do not want to see the original
typesetting.

Optional addition: a "View original file" button that opens the raw
uploaded document in the OS default viewer. Cheap, honest, and lets
users who genuinely want the original format get to it.

If v2 users demand in-app PDF rendering, revisit then. Do not build it
for v1.

---

## What this rules out

- Treating Original as a peer mode to Smart.
- Chapter-boundary-based synthesis (source chapters ≠ Smart Chapters).
- Synopsis generated from body text.
- Fake loading animations or `setTimeout`-driven progress.
- Provenance as a one-directional jump — must be a round-trip.
- Page numbers as a universal coordinate (only PDF has pages).
- Decorative provenance — citations without verification are worse
  than no citations.

## What this reaffirms

- **The two-representation invariant** (Original immutable, Smart
  traceable) is not a UI pattern. It is the product.
- **The moat** — every competitor sells compression; none sell
  traceability to position and passage, with per-sentence honesty
  about what is and isn't traced.
- **The market** — Japan and Europe. Data sovereignty, reading
  culture, and refusal of AI slop.

## Sequencing principle

**Synopsis before chapters.** The synopsis depends only on parsing
(preface + TOC + samples), not on any synthesis. Build it first, show
it in the UI as soon as it exists, then stream chapters in as they
complete. The user sees meaningful value in seconds; the full Smart
Chapter set arrives over the next minute.

---

*End of vision. Revision requires its own commit.*

