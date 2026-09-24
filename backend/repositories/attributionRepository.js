const { getDatabase } = require('../db/database');

class AttributionRepository {
  /**
   * Create a single paragraph attribution
   */
  create(attr) {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO paragraph_attributions (
        id, representation_id, paragraph_index, segments_json, source_chunk_ids,
        weights_json, method, confidence, grounded, verified_at, fell_back, fallback_reason
      ) VALUES (
        @id, @representation_id, @paragraph_index, @segments_json, @source_chunk_ids,
        @weights_json, @method, @confidence, @grounded, @verified_at, @fell_back, @fallback_reason
      )
    `);

    stmt.run({
      id: attr.id,
      representation_id: attr.representation_id,
      paragraph_index: attr.paragraph_index,
      segments_json: typeof attr.segments_json === 'string' ? attr.segments_json : JSON.stringify(attr.segments || []),
      source_chunk_ids: typeof attr.source_chunk_ids === 'string' ? attr.source_chunk_ids : JSON.stringify(attr.source_chunk_ids || []),
      weights_json: typeof attr.weights_json === 'string' ? attr.weights_json : JSON.stringify(attr.weights || {}),
      method: attr.method,
      confidence: attr.confidence,
      grounded: attr.grounded ? 1 : 0,
      verified_at: attr.verified_at || new Date().toISOString(),
      fell_back: attr.fell_back ? 1 : 0,
      fallback_reason: attr.fallback_reason || null,
    });

    return this.getById(attr.id);
  }

  /**
   * Batch insert multiple paragraph attributions inside a transaction
   */
  createBatch(attributions) {
    if (!Array.isArray(attributions) || attributions.length === 0) return [];
    const db = getDatabase();
    const insert = db.prepare(`
      INSERT INTO paragraph_attributions (
        id, representation_id, paragraph_index, segments_json, source_chunk_ids,
        weights_json, method, confidence, grounded, verified_at, fell_back, fallback_reason
      ) VALUES (
        @id, @representation_id, @paragraph_index, @segments_json, @source_chunk_ids,
        @weights_json, @method, @confidence, @grounded, @verified_at, @fell_back, @fallback_reason
      )
    `);

    const insertMany = db.transaction((items) => {
      for (const attr of items) {
        insert.run({
          id: attr.id,
          representation_id: attr.representation_id,
          paragraph_index: attr.paragraph_index,
          segments_json: typeof attr.segments_json === 'string' ? attr.segments_json : JSON.stringify(attr.segments || []),
          source_chunk_ids: typeof attr.source_chunk_ids === 'string' ? attr.source_chunk_ids : JSON.stringify(attr.source_chunk_ids || []),
          weights_json: typeof attr.weights_json === 'string' ? attr.weights_json : JSON.stringify(attr.weights || {}),
          method: attr.method,
          confidence: attr.confidence,
          grounded: attr.grounded ? 1 : 0,
          verified_at: attr.verified_at || new Date().toISOString(),
          fell_back: attr.fell_back ? 1 : 0,
          fallback_reason: attr.fallback_reason || null,
        });
      }
    });

    insertMany(attributions);
    return this.getByRepresentationId(attributions[0].representation_id);
  }

  /**
   * Get single attribution by ID
   */
  getById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM paragraph_attributions WHERE id = ?').get(id);
    return this.formatRow(row);
  }

  /**
   * Get all attributions for a given representation ordered by paragraph index
   */
  getByRepresentationId(representationId) {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM paragraph_attributions
      WHERE representation_id = ?
      ORDER BY paragraph_index ASC
    `).all(representationId);

    return rows.map((r) => this.formatRow(r));
  }

  /**
   * Delete all attributions for a representation
   */
  deleteByRepresentationId(representationId) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM paragraph_attributions WHERE representation_id = ?').run(representationId);
    return result.changes;
  }

  /**
   * Format SQLite row into structured object with parsed JSON fields
   */
  formatRow(row) {
    if (!row) return null;
    let segments = [];
    try {
      segments = typeof row.segments_json === 'string' ? JSON.parse(row.segments_json) : row.segments_json;
    } catch {
      segments = [];
    }

    let sourceChunkIds = [];
    try {
      sourceChunkIds = typeof row.source_chunk_ids === 'string' ? JSON.parse(row.source_chunk_ids) : row.source_chunk_ids;
    } catch {
      sourceChunkIds = [];
    }

    let weights = {};
    try {
      weights = typeof row.weights_json === 'string' ? JSON.parse(row.weights_json) : row.weights_json;
    } catch {
      weights = {};
    }

    return {
      id: row.id,
      representation_id: row.representation_id,
      paragraph_index: row.paragraph_index,
      segments,
      source_chunk_ids: sourceChunkIds,
      weights,
      method: row.method,
      confidence: row.confidence,
      grounded: Boolean(row.grounded),
      verified_at: row.verified_at,
      fell_back: Boolean(row.fell_back),
      fallback_reason: row.fallback_reason || null,
    };
  }
}

module.exports = new AttributionRepository();
