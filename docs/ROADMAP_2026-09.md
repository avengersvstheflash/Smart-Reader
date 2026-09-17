# Part 15: RAG Upgrade + Multimodal Vision — Consolidated Context

---

## 1. Where We Are (Updated)

| Item | Status |
|------|--------|
| v0.3b.1.9 — Document Structure Engine | ✅ Frozen |
| v0.4.4 — Progressive Smart Chapter Synthesis | ✅ Tagged, pushed |
| OpenRouter + DeepSeek V4 Flash (text gen) | ✅ Live |
| Node 22 LTS | ✅ Pinned |
| Test suite | ✅ 12/12 in ~2 min |
| React migration | ⏳ Architecture + blueprint in flight |
| **BGE-M3 embeddings** | 🔴 **Decided — to build before React UI** |
| Audio mode | ⏳ Post-React, next multimodal feature |
| Discussion mode | ⏳ Post-audio |
| Story mode | ⏳ Build 7+ |

---

## 2. The RAG Audit — What We Discovered

### Current Setup (Before Upgrade)
| Layer | Current implementation | Location |
|-------|----------------------|----------|
| Chunking | Local semantic chunker | backend/services/semantic/ |
| Embeddings | `LocalDenseSemanticVectorizer` (256d) | backend/services/semantic/embeddings/ |
| Retrieval | Cosine similarity in SQLite | backend/services/semantic/ |
| Generation | OpenRouter → DeepSeek V4 Flash | backend/services/ai/ |

### The Diagnosis
The 256d "deterministic" embeddings explained two symptoms the user had been noticing:
- **Instant processing** on AI Studio and in `npm test` — no neural network, likely hash-based or a small projection
- **Mediocre synthesis quality** — retrieval was catching surface-level matches, missing nuance

The similarity test scores (`0.8144` related / `0.0982` unrelated) suggested real semantic capability, but the ceiling was low. This is the classic tradeoff: speed and simplicity at the cost of retrieval quality.

### The Architectural Insight
The app is hybrid by design — and this is a **selling point**, not a limitation:

```
Document ingestion     →  LOCAL (parser, chunker)
Embedding              →  LOCAL (was 256d, will become BGE-M3 1024d)
Retrieval / RAG        →  LOCAL (cosine similarity in SQLite)
Synthesis / generation →  CLOUD (OpenRouter → DeepSeek V4 Flash)
```

Content never leaves the machine unless synthesis is triggered. Retrieval is instant. Cloud costs only apply to generation, not to every query.

---

## 3. The BGE-M3 Decision

### The Naming Trap That Was Caught
The user initially said "so we go with bge base! Or bge small for a lite version" — which would have been the wrong choice. `bge-base-en-v1.5` and `bge-small-en-v1.5` are **English-only**. The `-en-` in the name is the tell.

For the multilingual requirement, the correct models are:
| Model | Dim | Max tokens | Size (INT8) | Languages |
|-------|-----|-----------|-------------|-----------|
| `BAAI/bge-m3` | 1024 | 8192 | ~571 MB | 170+ |
| `intfloat/multilingual-e5-small` | 384 | 512 | ~110 MB | 100+ |

### Final Choice: BGE-M3
BGE-M3 is the strongest open multilingual retriever as of 2026. Key advantages:
- **1024 dimensions** — 4x semantic resolution over current 256d
- **8192 token context** — whole sections can be embedded as one unit
- **Prefix-free** — unlike E5 models, no `"query: "` / `"passage: "` prefix required
- **MIT licensed** — commercial use fine
- **INT8 quantization** brings it to ~571 MB, cached after first download
- **Cross-lingual** — query in English retrieves Japanese content, and vice versa

### One model, not two tiers
Rather than shipping BGE-M3 for quality and multilingual-e5-small for "lite", the decision is **BGE-M3 only, with quantization levels as the runtime tier**:
- `dtype: 'fp32'` — highest quality (server, 2.27 GB)
- `dtype: 'q8'` — sweet spot (desktop, 571 MB)
- `dtype: 'q4'` — lite (mobile, ~300 MB)

Same model ID, same 1024d vectors, same migration path — only the quantization changes.

### Implementation Path
```js
// backend/services/semantic/embeddings/bgeEmbeddingProvider.js
const { pipeline } = require('@huggingface/transformers');

let extractorPromise = null;
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/bge-m3', {
      dtype: 'q8',
    });
  }
  return extractorPromise;
}

async function embed(texts) {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: 'cls', normalize: true });
  return output.tolist();
}
```

Server warmup at boot to eliminate cold-start latency. Existing 256d vectors get marked "stale" and re-embedded lazily on next open.

### Cost Impact
Per-book indexing time goes from ~0s to ~10s. Disk cost: 571 MB one-time. Electricity: negligible. Total build effort: **~2-3 hours**.

---

## 4. The Story Mode Pipeline (Design)

### What It Actually Is
Not "AI images tacked on a summary." It's a **structured narrative transformation pipeline** with real cultural format targets:

```
Compressed Smart Chapter (250-350 words)
  ↓
Narrative rewriter (LLM, preserves chapter integrity)
  ↓
Story script (scene-by-scene breakdown, ~5-11 scenes)
  ↓
Character extraction (LLM, outputs locked visual descriptions)
  ↓
Per-scene image prompt builder
  ↓
Image generation (one call per scene, consistent seed)
  ↓
Storybook layout (spread) OR manga/webtoon layout (vertical scroll)
```

The vertical scroll (webtoon/manhua/manga) target has a huge technical advantage: **each image stands alone, stacked vertically**. No multi-panel composition problem. 100x easier than generating coherent manga spreads.

### The Character Consistency Solution
The user initially proposed **chain-of-context** (each scene prompt includes all prior scenes). This fails for three reasons:
1. Image models don't read narrative as constraint — "the same woman, still with black hair" is a vibe, not a rule
2. Context bloat dilutes the actual scene action
3. Drift compounds: 5% deviation per scene → different character by scene 10

The production pattern — and the one that will be used:

**Two layers, two mechanisms:**

Layer 1 — **Character Sheet** (locked, identical every call):
```
[CHARACTER] Yuki, 24, Japanese woman, shoulder-length black hair
with side-swept bangs, brown eyes, light blue oversized cardigan,
white t-shirt, dark jeans, casual sneakers, slim build, pale skin.
```

Layer 2 — **One Scene Back** (not cumulative):
```
[CONTEXT] Previously: Yuki picked up an old book.
```

Combined structure per image call:
```
[CHARACTER] {locked sheet — identical every time}
[CONTEXT]  Previously: {one line, last scene only}
[SCENE]    {what's happening now + framing + lighting + style}
[STYLE]    {consistent style tokens for the whole book}
```

This gets ~75% consistency for v1. Pixel-perfect consistency requires IP-Adapter or character LoRA fine-tuning — v2/v3 investments.

### Provenance Chain Extension
The two-representation invariant extends all the way through:
```
Source chapter → Smart Chapter → Story script → Character sheet
                                               → Scene N
                                               → Image N
```
Every image traces back: scene → story script → smart chapter → source page.

---

## 5. Cost Models — All Modes, All Tiers

### Image Generation (Story Mode)
| Model | Cost/image | Source |
|-------|-----------|--------|
| Qwen-Image (Beijing) | $0.0287 | Alibaba Cloud |
| Qwen-Image (Intl) | $0.03 | Alibaba Cloud |
| Qwen-Image 3.0 Pro (2K) | $0.075 | Alibaba Cloud |
| FLUX.1 Dev (cloud, scale) | ~$0.007 | packet.ai |
| SDXL Turbo (local GPU) | ~$0.0008 | RTX 5090 benchmark |
| DALL-E 3 | ~$0.08 | OpenAI |

**Per-book story mode (CRC, 84 Smart Chapters × 6 images):**
| Path | Per book |
|------|----------|
| Cloud Qwen-Image | ~$15.13 |
| Cloud FLUX Schnell | ~$3-5 |
| Local SDXL Turbo | ~$0.51 + one-time GPU ($300-500) |

### TTS / Audio Mode
| Provider | Cost per 1M chars | Quality | Languages |
|----------|------------------|---------|-----------|
| Local Kokoro-82M | $0 | MOS 3.87 (rivals 10x models) | Multilingual |
| Local Piper | $0 | Good, slight robotic | Many |
| Qwen qwen3-tts-flash | ~$10 | Very good | 16 |
| Qwen qwen3-tts-plus | ~$20-27 | Excellent | 16 |
| Sarvam Bulbul v3 | ~$34 | Good (Indian languages) | 11 |
| ElevenLabs Flash v2.5 | ~$50 | Excellent | 74 |
| MiniMax speech-2.8-turbo | ~$60 | Excellent | 30+ |

**Per-book TTS (CRC, ~340K chars):**
| Path | Per book |
|------|----------|
| Local Kokoro | $0 |
| Qwen Flash | ~$3.40 |
| MiniMax | ~$20.40 |

**Kokoro-82M is the sweet spot:** Apache 2.0, 82M params, MOS 3.87, CPU-capable, ~200 MB RAM. Runs alongside other services.

### Discussion Mode
Fully local via Ollama: load 2-4 models (`llama3`, `mistral`, `qwen2.5`), give each a persona, feed them Smart Chapters. **Zero API cost, zero privacy concerns.** Reference projects: Agent Discussion Arena, Quorum CLI, LLM Council.

### Full Cost Matrix — Per CRC Book
| Mode | Local | Cloud (Cheap) | Cloud (Premium) |
|------|-------|---------------|-----------------|
| TTS | $0 (Kokoro) | ~$3.40 (Qwen Flash) | ~$20.40 (MiniMax) |
| Discussion | $0 (Ollama) | ~$0.50 | ~$2 |
| Story | ~$0.51 (SDXL) | ~$15 (Qwen-Image) | ~$25 (Midjourney) |
| **Audio + Discussion** | **$0** | **~$4** | **~$22** |

### Tier Design (Business Model)
| Tier | Audio | Discussion | Story |
|------|-------|------------|-------|
| Free | Local Kokoro | Local Ollama | — |
| Standard | Local Kokoro | Local Ollama | Local SDXL (2-3 images/ch) |
| Premium | Qwen Flash | Qwen + OpenRouter | Qwen-Image (6-10 images/ch) |

Privacy-first positioning for Japan/Europe. Zero-cost for free users. Premium tier is what funds the cloud costs.

---

## 6. Market Positioning — The Real Insight

### Who Actually Wants This
**Japan:**
- Massive reading culture, but extremely high trust standards
- A "summary app" would be dismissed as 要約サービス trash
- 要約本 (business book summaries) ARE a huge legitimate market — because they're **respectful compressions with clear provenance**
- Won't accept untraceable AI slop pretending to be "the book"
- WILL accept a lens over a book they own, with click-through to original

**Europe:**
- Wildly heterogeneous — Germany, France, UK, Nordics differ
- **Germany:** "Bildung" tradition. Rejects "reading is a chore, let AI shortcut it." Accepts "reading is deep, here's a tool to help."
- **France:** protective of literary culture, "le plaisir du texte." Hardest market.
- **Nordics:** privacy-first by law, tech-forward, love local-first AI. **Best European market.**
- **UK:** closest to US. Mixed but open.

**The common thread:** nobody wants compression. They want **structure, navigation, and provenance**. Compression is the side effect, not the pitch.

### The Two-Representation Invariant Is the Moat
This is the entire product:

```
ORIGINAL READING: immutable source, never touched
SMART READING:    derived representation, fully traceable back to source
```

Every competitor sells compression. None sell traceability. ChatGPT summaries don't link back to page 47, paragraph 3. Blinkist doesn't show you the source. SumizeIt doesn't prove its claims.

**You do.** That's what makes it not insulting.

### The Pitch That Works
❌ "Reading is slow, here's a shortcut"
✅ "Reading is deep, here's a navigable layer over the source you own"

Japanese and European users accept the second. They reject the first.

### The Business Sentence
> "Your personal library, understood by local AI, with every compressed view traceable back to the source. You own the content. You own the AI. You own the outputs."

Sells in Tokyo, Berlin, Amsterdam, Stockholm. Doesn't sell in San Francisco — they don't care about local-first. **You're not pitching to SF.**

### The Professional Angle
The user articulated the standard they're holding themselves to:
> "I want to build something I would personally find confidence in when talking instead of shame."

**What recruiters in Japan and Europe actually see:**
| Signal | What You Have |
|--------|---------------|
| Commit messages | Clear, present-tense, scoped |
| Release tags | v0.3b.1.9, v0.4.4 — semantic versioning on real milestones |
| Test suite | 12 suites, real fixtures, 2-minute runtime |
| README | Honest architecture, clear thesis |
| Retrospectives | docs/SESSION_RETROSPECTIVE.md with corrections section |
| Architecture docs | docs/FRONTEND_ARCHITECTURE.md, docs/ROADMAP_*.md |
| Tagged history | Every commit is a shippable state |

That's more process maturity than most mid-level engineers show publicly. **The AI doesn't matter — the judgment about what to accept, reject, rewrite is entirely yours.**

---

## 7. Updated Build Order

### Phase 0 — BGE-M3 Embedding Swap ⬅️ NEXT
**Time:** 2-3 hours · **Model:** Gemini 3.8 Flash · Medium
- Create `bgeEmbeddingProvider.js` wrapping `Xenova/bge-m3` with `dtype: 'q8'`
- Swap provider in `embeddingService.js`, `EMBEDDING_DIM` 256 → 1024
- Server boot warmup to eliminate cold start
- Migration: detect 256d vectors → mark stale → re-embed lazily
- Test: `build4_5_bge_migration_test.js` (8 tests, incl. cross-lingual check)
- Tag `v0.4.5` if 12/12 stay green

**Do NOT proceed until 12/12 pass with BGE-M3.**

### Phase 1 — React Migration: Shell + Library
**Time:** 1 evening
- Vite + TS + Tailwind scaffold
- Router + Query + Theme + Modal providers
- LibraryRoute, BookGrid, BookCard, FilterChips
- Header + Nav
- `useBooks` (React Query) + `useLibraryStore` (Zustand)

### Phase 2 — Reader + Canonical Blocks
**Time:** 1 evening · **Model:** Claude Sonnet 4.6
- `<CanonicalBlock>` recursive renderer
- ReaderRoute, ReaderView, ChapterNav, ScrollProgress
- Original/Smart mode toggle
- `useChapters`, `useReaderStore`

### Phase 3 — Modals + Remaining Features
**Time:** 1-2 evenings
- ModalProvider + 11 modal components
- Web search, add book, settings, jobs, delete confirm
- Research collection route
- Editorial/Synthesis integration
- Replace "fake progress" timers with real polling

### Phase 4 — Progressive Smart Reading UI
**Time:** 1 evening · **Model:** Claude Sonnet 4.6
- "+1 / +3 / +5 / +10" buttons
- Live progress bar during background synthesis
- Wire to `/api/books/:id/editorial/synthesize-next` + `/progress`

### Build 5 — Audio Mode (TTS)
**Time:** 2-3 evenings
- **Local Kokoro-82M first** (free, private, MOS 3.87)
- Cloud Qwen TTS as premium upgrade
- Per-chapter audio caching

### Build 6 — Discussion Mode
**Time:** 2-3 evenings
- Local Ollama multi-agent book club
- 2-4 personas per book
- Zero API cost

### Build 7 — Story Mode Pipeline
**Time:** 8-10 evenings
- Character extractor (LLM, one call per chapter)
- Scene decomposer (LLM)
- Image prompt builder (character sheet pattern)
- Image generation (local SDXL Turbo first)
- Layout renderer (manga/webtoon scroll + storybook spread)
- Provenance chain extension
- Character consistency debugging (the hard part)

---

## 8. Guardrails

- **Backend is frozen during React migration.** BGE-M3 swap happens first, in its own session.
- **`npm test` must stay 12/12 green** through every phase. If it goes red, stop and fix.
- **One build at a time.** BGE-M3, then React Phase 1, then Phase 2, etc.
- **Commit docs before code.** The blueprint is the contract.
- **Local-first by default.** Cloud is an optional premium tier, not a requirement.
- **Never commit on a red suite.**
- **The two-representation invariant extends through every new mode.** Every image, every audio segment, every discussion turn must trace back to source.
- **Antigravity recovery prompt:** *"STOP. Report git status --short, git diff --stat, and every file modified. Then wait."*

---

## 9. Key Insights Worth Remembering

1. **"Instant processing" was a symptom, not a feature.** The 256d embeddings were cheap, not fast. BGE-M3 trades ~10s indexing for 4x semantic resolution and 170+ languages.

2. **The chain-of-context approach to character consistency fails.** Use character sheets (locked visual description) + one-scene-back context. Solve visual consistency and narrative continuity with separate mechanisms.

3. **Audio is the next big unlock, not images.** Commute reading is universal. Japan has the longest commute times in the developed world. Europe has massive audiobook culture. Kokoro-82M makes it free and private.

4. **Nobody wants compression. They want traceability.** The two-representation invariant — Original is immutable, Smart is a traceable lens — is the entire moat. Competitors sell summaries; you sell navigable provenance.

5. **The market is Japan + Nordics first, not the US.** Data sovereignty, privacy culture, reading culture, and willingness to pay for quality tools. The US market is distracted by cloud-first, social-first, ad-first products.

6. **The professional standard is "confidence instead of shame."** Commit history, tagged releases, tests with real fixtures, retrospectives with corrections — this is what senior engineers show publicly. The AI writes code; the judgment is entirely yours.

---

## 10. Artifacts On Disk (To Create or Update)

| File | Purpose | Status |
|------|---------|--------|
| `docs/FRONTEND_ARCHITECTURE.md` | Component tree, state map, API surface | ✅ Exists |
| `docs/FRONTEND_BLUEPRINT.md` | Visual language, screen blueprints | ⏳ In progress |
| `docs/ROADMAP_2026-09.md` | Full roadmap including BGE-M3 + multimodal | ✅ This file |
| `docs/RAG_UPGRADE_PLAN.md` | BGE-M3 migration specifics | ⏳ To create |
| `docs/STORY_MODE_ARCHITECTURE.md` | Character sheet pattern, pipeline | ⏳ To create |
| `docs/MARKET_POSITIONING.md` | Japan + Europe pitch, business case | ⏳ To create |

---

## 11. What to Do Next

**Immediate (this session or tomorrow morning):**
1. Save this document as `docs/ROADMAP_2026-09.md` and `docs/RAG_UPGRADE_PLAN.md` (or merge into one).
2. Fire the BGE-M3 swap prompt in Antigravity with Gemini 3.8 Flash · Medium.
3. Verify 12/12 tests pass with new embeddings.
4. Tag `v0.4.5` if green.

**Then:** Return to React migration Phase 1 (scaffold) with the design blueprint ready.

**The next major feature after React:** Audio mode with Kokoro-82M local TTS.

**The ambitious feature after audio:** Story mode with the character-sheet pattern.

---

## 12. The Standard

> "I want to build something I would personally find confidence in when talking instead of shame."

Every decision in this document serves that standard. Local-first privacy. Traceable provenance. Real tests. Honest retrospectives. Milestone tags. One build at a time.

That's not a hobby project. That's a product with a thesis, a market, and a standard.
