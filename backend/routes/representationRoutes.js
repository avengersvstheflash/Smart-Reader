const express = require('express');
const router = express.Router();
const provenanceResolver = require('../services/semantic/provenanceResolver');

const semanticChunkRepository = require('../repositories/semanticChunkRepository');
const chapterRepository = require('../repositories/chapterRepository');

// GET /api/representations/:id/provenance - Get verified paragraph-level provenance
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
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/representations/:id/verify-provenance - Re-run provenance verification manually (invalidates existing rows)
router.post('/:id/verify-provenance', async (req, res, next) => {
  try {
    const options = {
      force: true,
      fast: req.body?.fast === true,
    };
    await provenanceResolver.verifyRepresentation(req.params.id, options);
    const result = provenanceResolver.getProvenance(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;

