const express = require('express');
const router = express.Router();
const smartChapterRepository = require('../repositories/smartChapterRepository');
const attributionRepository = require('../repositories/attributionRepository');
const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const chapterRepository = require('../repositories/chapterRepository');
const provenanceResolver = require('../services/semantic/provenanceResolver');

// GET /api/smart-chapters/book/:bookId - list smart chapters with status and plan counts
router.get('/book/:bookId', (req, res, next) => {
  try {
    const chapters = smartChapterRepository.getByBookId(req.params.bookId);
    const total = chapters.length;
    const generated = chapters.filter((c) => c.status === 'generated').length;
    const pending = chapters.filter((c) => c.status === 'pending').length;
    const generating = chapters.filter((c) => c.status === 'generating').length;
    const failed = chapters.filter((c) => c.status === 'failed').length;

    return res.json({
      book_id: req.params.bookId,
      total,
      generated,
      pending,
      generating,
      failed,
      chapters,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/smart-chapters/:id - full content + attributions
router.get('/:id', (req, res, next) => {
  try {
    const smartChapter = smartChapterRepository.getById(req.params.id);
    if (!smartChapter) {
      return res.status(404).json({ error: `Smart chapter not found: ${req.params.id}` });
    }

    const attributions = attributionRepository.getBySmartChapterId(req.params.id);

    return res.json({
      success: true,
      smartChapter: {
        ...smartChapter,
        attributions,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/smart-chapters/:id/provenance - migrated from /api/representations/:id/provenance
router.get('/:id/provenance', (req, res, next) => {
  try {
    const result = provenanceResolver.getProvenance(req.params.id);
    if (req.query.expand === 'chunks' && Array.isArray(result.paragraphs)) {
      const chunkMap = {};
      const chunkIds = new Set();
      for (const p of result.paragraphs) {
        if (Array.isArray(p.source_chunk_ids)) {
          for (const cid of p.source_chunk_ids) {
            chunkIds.add(cid);
          }
        }
      }

      for (const cid of chunkIds) {
        const chunk = semanticChunkRepository.getById(cid);
        if (chunk) {
          let blockIds = [];
          if (chunk.canonicalBlock) {
            if (Array.isArray(chunk.canonicalBlock.blocks)) {
              blockIds = chunk.canonicalBlock.blocks.map((b) => b.id).filter(Boolean);
            } else if (chunk.canonicalBlock.id) {
              blockIds = [chunk.canonicalBlock.id];
            }
          }
          if (blockIds.length === 0 && chunk.chapterId) {
            const ch = chapterRepository.getById(chunk.chapterId);
            if (ch && Array.isArray(ch.canonical_blocks) && ch.canonical_blocks[chunk.sequence]) {
              const b = ch.canonical_blocks[chunk.sequence];
              if (b && b.id) {
                blockIds = [b.id];
              }
            }
          }
          chunkMap[cid] = {
            id: chunk.id,
            chapter_id: chunk.chapterId || null,
            sequence: chunk.sequence !== undefined && chunk.sequence !== null ? Number(chunk.sequence) : null,
            section_heading: chunk.sectionHeading || null,
            source_page: chunk.sourcePage !== undefined && chunk.sourcePage !== null ? Number(chunk.sourcePage) : null,
            excerpt: (chunk.textContent || '').trim().slice(0, 150),
            block_ids: blockIds,
          };
        }
      }
      result.chunks = chunkMap;
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/smart-chapters/:id/progress - reserved for Phase 5.5d (stub returns 501)
router.post('/:id/progress', (req, res) => {
  return res.status(501).json({
    error: 'Reading progress endpoints are reserved for Phase 5.5d.',
  });
});

module.exports = router;
