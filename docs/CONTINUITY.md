# Smart Reader — Continuity

> **Purpose.** If the current strategic-partner chat (or its model) becomes
> unavailable, any fresh capable model reading this file plus
> `SESSION_HANDOFF.md` and `PRODUCT_VISION.md` is fully oriented.
> Read in 60 seconds. Act in the next turn.

---

## Where the project is right now

**Repo:** https://github.com/avengersvstheflash/Smart-Reader
**HEAD:** (check with `git log -1 --oneline`)
**Test suite:** 13/13 green. Verify with `npm test`.
**Vision:** compression engine, not summarizer. See `PRODUCT_VISION.md`.

**Working now:**
- Import PDF/EPUB/web (backend complete; frontend import route shipped)
- BGE-M3 1024d local embeddings
- Semantic chunking + indexing
- Editorial outline generation
- Smart Chapter compression (OpenRouter → DeepSeek V4 Flash,
  reasoning disabled, 250–360 word target)
- Synopsis from preface + TOC + strategic samples
- Fallback honesty (marked + captioned)
- Library → Book Details → Reader works via clicks

**Known gaps (see `SESSION_HANDOFF.md` §8 for the full list):**
- Phase 4.6: Web + Paste import tabs not shipped
- Phase 4.7: Cinematic import experience not shipped
- Phase 4.10: contentType defaults to 'novel', tags don't exist
- Phase 4.11: no grounding density check
- Phase 4.12: compressor terminology refactor (file/class names)
- Phase 5: inline source tracker (the moat, still conceptual)
- Phase 6: Tauri wrap not started
- Builds 5/6/7: Audio / Discussion / Story not started

## How we work

**Standard:** confidence instead of shame. Every claim verified against
raw output. No commits on dirty tree or red suite. One workstream per
session. Docs before code. Antigravity write hazard: git diff after
every "replace" task, verify at HEAD.

**Two working files:**
- `docs/SESSION_HANDOFF.md` — current state, next phase, guardrails
- `docs/PRODUCT_VISION.md` — north star (compression, two-representation
  invariant)

**Read these on orientation:**
1. This file (you're reading it)
2. `docs/SESSION_HANDOFF.md` — where we are, how we work, what's next
3. `docs/PRODUCT_VISION.md` — the north star
4. `docs/CANONICAL_TEST_BOOK.md` — the test fixture
5. `docs/BRIEFING_CORRECTIONS.md` — known factual drift from a prior
   audit

**Then ask the human:** *"What's the current focus? SESSION_HANDOFF.md §4
lists the next phase — should I fire that prompt?"*

## The next three sessions (predicted)

1. **Phase 4.13** (currently running) — synopsis + book summary prompt
   rewrite. Compression-framed abstract at 200-300 words.

2. **Phase 4.10** — auto-classification on import. contentType + tags +
   reading level. One LLM call. Frontend chips + Library filters.

3. **Phase 4.6** — Web + Paste import. Completes the three-source
   digital library.

After those three, the app is a real product for personal use. Phase 5
(inline source tracker) is the next big lift.

## Tools

- **Antigravity** — executor (Gemini 3.8 Flash · Low/Medium/High or
  Gemini 3.1 Pro · High). Session state persists across prompts.
- **OpenRouter** — DeepSeek V4 Flash for compression. Reasoning must
  be `{ enabled: false }` on all synthesis calls.
- **BGE-M3** — local, INT8 q8, ~571 MB, warmup at server boot.

## Guardrails

- Root `package.json`, `scripts/run-all-tests.js`, and `backend/`
  structure are frozen for structure. Small edits inside existing
  files are OK.
- `npm test` stays 13/13 through every commit.
- No commits on dirty tree or red suite.
- Raw output over paraphrase in every report.
- Never commit `.env` or API keys.
- Backend frozen until specific phase work; frontend work is the current
  active surface.

## If the chat is lost

1. Open fresh chat with any capable model.
2. Paste: *"Read docs/CONTINUITY.md, docs/SESSION_HANDOFF.md, and
   docs/PRODUCT_VISION.md. Confirm orientation. Tell me what phase is
   next and what to fire."*
3. The fresh model orients in one turn and is ready to work.

That's the whole portability story. The repo is the source of truth.
Chat is replaceable.

---

*End of continuity doc. Update when HEAD changes to a new phase.*

