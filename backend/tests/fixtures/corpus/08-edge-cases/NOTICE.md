# Corpus Fixtures — 08-edge-cases

## chijinno_ai.txt

- Author: Jun'ichirō Tanizaki (1886–1965)
- Work: 痴人の愛 (Naomi / Chijin no Ai), first serialized 1924–1925
- Source: Aozora Bunko, text file 58093 (58093_ruby_62048.zip)
- Slice boundary: bytes 0 through end of Chapter 3 opening
- Encoding: ShiftJIS (CP932)
- License: Public domain in Japan. Author died 1965; copyright expired under
  the pre-2018 50-year rule on 2016-01-01. Aozora Bunko provides this text
  under public domain terms.
- Purpose: Exercises F51h.1 (CJK word count), F51h.2 (Aozora display title),
  F51h.3 (prologue/section preservation), and ShiftJIS encoding detection.

## chat_11-slice.md

- Source: Project-authored development session transcript (this repository)
- Slice boundary: bytes 0 through end of Turn 4
- Encoding: UTF-8
- License: MIT (same as repository)
- Purpose: Exercises F56 (markdown fast-path classification), F49d (no
  [PARTIAL] markers), and the section classifier circuit breaker on
  real conversational markdown.

Both slices were extracted once, committed to git, and are not dynamically
regenerated from external machine paths.

