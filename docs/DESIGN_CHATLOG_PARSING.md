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

## DECISIONS NEEDED FROM USER

1. Should we rely entirely on silent auto-detection, or expose an explicit "Import as Chat Log" override option in the UI dropzone?
2. How should the slicer handle long, multi-page AI responses that exceed the standard 2,500-word limit? Should they be forcefully split, or should the budget be dynamically increased for this specific document type?
