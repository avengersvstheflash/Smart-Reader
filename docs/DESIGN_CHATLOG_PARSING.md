# Design: Chat-Log Parsing (F24)

## Problem Statement

When users import PDFs containing exported chat conversations (e.g., Gemini interactions, ChatGPT conversations, or generated study notes), the standard book parser fails structurally. The parser mistakes repeated conversational phrases or prompt instructions (such as "Check your answer", "User:", or "Model:") for standard chapter headings. This leads to severe segmentation errors, wildly inaccurate table of contents generation, and dropped content during downstream LLM synthesis (e.g., only 2 out of 3 generated chapters synthesize successfully, leaving large gaps in the ingested material).

This is a structural-level failure (tracked as F24) and is fundamentally distinct from character-level extraction failures like missing math glyphs (F23).

## Structural Markers in Chat Logs

Unlike traditional books or academic papers, chat logs and exported study notes completely lack standard Tables of Contents (TOC) and preface material. However, they possess distinct, repeating structural markers that can be leveraged:

* User prompts (e.g., "User:", "Prompt:", or repeating profile icon artifacts)
* AI responses (e.g., "Model:", "Gemini:", "ChatGPT:")
* Code fences (```) wrapping code blocks, data schemas, or command outputs
* Standardized markdown tables representing structured data
* Repeating pagination headers or footers derived from the PDF export process (e.g., "Page 1 of 5", URL strings at the bottom of the page)

## Detection Strategy

To prevent standard parser failure, we need a pre-parsing classifier situated early within the ingestion pipeline. The strategy involves analyzing the first N blocks of extracted text to dynamically identify the document class before routing.

If the density of alternating prompt/response markers, high code-fence frequency, and the explicit lack of a traditional TOC exceeds a specified heuristic threshold, the document should be flagged as a "Chat Log" and forcefully routed to a specialized parser branch.

## Parser Branch Design

The specialized chat-log parser branch will handle segmentation significantly differently than the standard book parser:

* **Conversation Turns as Chapters:** Map each complete conversation turn (the User Prompt followed by the AI Response) to a single semantic chapter.
* **Heading Suppression:** Actively ignore repeated phrasing in the body text (like "Check your answer") to prevent false chapter breaks from fragmenting a single conversation turn.
* **Synthesized Titles:** Generate chapter titles based on the semantic content of the user prompt itself, rather than relying on visual font weight or formatting heuristics.
* **Code Fence Integrity:** Ensure code fences that span page breaks are merged correctly before slicing, preventing code snippets from being split across multiple chunks.

## Fallback Behavior

If the detection classifier's confidence is marginal (e.g., scoring below the strict threshold), the system should default to the standard book parsing logic to avoid breaking standard documents with false positives. However, it will emit a warning flag in the database metadata. The UI can subsequently surface this flag, allowing the user to manually trigger the specialized chat-log re-parser if the resulting structure appears incorrect.

## Effort Estimate

Approximately 2-3 sessions in total:

* 1 session for implementing the detection heuristics and conditional routing logic.
* 1-2 sessions for building the custom parser branch, testing with various chat-log fixtures, and refining the code-fence merging logic.

## Locked Decisions (2026-10-04)

### D1 — Detection mechanism: Option C (auto-detect + flag + manual re-parse)

- Classifier runs automatically during ingestion. No mandatory UI step at import time.
- `books.metadata_json` gains `parse_mode` (`book` | `chat_log`) and `parse_confidence` (0–1).
- Book Details shows a badge when `parse_confidence` is below threshold: `Parsed as: Book (auto) · looks unusual? Re-parse as Chat Log`.
- Manual "Re-parse as X" action triggers the alternate parser branch and re-runs the pipeline.
- Marginal-confidence detection defaults to standard book parsing (safe fallback per the original heuristic), flagged in metadata.
- **Rationale:** preserves honest failure states, avoids import-time friction, small blast radius (one DB field, one badge, one action).

### D2 — Overlong AI response handling: dynamic budget, soft ceiling

- Target chapter size remains the existing dynamic 1,500–2,500 words.
- Single turns up to **~4,000 words** become one chapter (soft ceiling).
- Above 4,000 words, split with a continuation marker; chapter N+1 title reads `Chapter N (continued)`.
- **Rationale:** the whole point of the chat-log parser is turn → chapter mapping. Force-splitting at 2,500 fragments coherent AI answers. Matches precedent from 4.8.3 (even-distribution slicing) and 5.8.0b (dynamic chapter budget).

### Real-world fixture evidence

The `kaggle and code dojo 1.pdf` currently in the Library is the F24 artifact: it was parsed as a book and produced 2 chapters titled `Part 1: Check your answer` / `Part 2: Check your answer (2)`. Use it for manual verification of the chat-log parser branch. Build a small synthetic chat-log fixture for the committed test suite (no license risk).
