# F32 — Section Classification for Ingestion

## Problem
Real books leak TOC/preface/index/copyright as chapters. 5x waste
observed (Reddi ML Systems Vol 1: 225 generated vs ~30-50 real).

## Architecture
Two-layer classifier:
1. Heuristic layer (existing): pattern-based filtering of
   front_matter / back_matter / index / appendix
2. LLM layer (new): fires only when heuristics are ambiguous

Flow:
  Block extraction
    → heuristic classify
    → IF confident: use result
    → IF ambiguous: LLM classify (~$0.002-0.005/book avg)
    → store section_type per block
    → editorial planner excludes non-body sections

## Provider Routing
Uses resolved provider (OpenRouter OR Local). No silent cloud calls
for local-only users.

## Section Types
BODY, TOC, PREFACE, FOREWORD, INTRODUCTION, ACKNOWLEDGMENTS,
DEDICATION, COPYRIGHT, INDEX, APPENDIX, GLOSSARY, BIBLIOGRAPHY,
COLOPHON, UNKNOWN

## Cost
~$0.002-0.005 per book (hybrid, LLM fires ~20% of blocks)

## Files
- backend/services/ai/sectionClassifier.js
- backend/tests/f32_section_classifier_test.js

## Out of Scope
- Math extraction (that's F31)
- Frontend UI for section types
- Re-classification of existing books (user re-imports)

