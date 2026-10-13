const { getDatabase } = require('../db/database');

class ImportQueueRepository {
  create({
    id,
    type,
    source_title,
    source_meta = {},
    status = 'queued',
    stage = 'preparing',
    stage_label = 'Queued for processing',
    progress = 0,
    queue_order,
    stages_json,
    stages,
  }) {
    const db = getDatabase();
    const taskId = id || `import-task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    let resolvedOrder = queue_order;
    if (resolvedOrder === undefined || resolvedOrder === null) {
      resolvedOrder = this.getNextQueueOrder();
    }

    const resolvedStages = stages_json !== undefined ? stages_json : stages;
    const metaStr = typeof source_meta === 'object' ? JSON.stringify(source_meta) : (source_meta || '{}');
    const stagesStr = typeof resolvedStages === 'object' && resolvedStages !== null ? JSON.stringify(resolvedStages) : (resolvedStages || '[]');

    db.prepare(`
      INSERT INTO import_queue (
        id, type, source_title, source_meta, status, stage, stage_label,
        progress, queue_order, book_id, error, created_at, started_at, completed_at, stages_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      taskId,
      type,
      source_title || 'Untitled Import',
      metaStr,
      status,
      stage,
      stage_label,
      progress,
      resolvedOrder,
      null,
      null,
      now,
      null,
      null,
      stagesStr
    );

    return this.getById(taskId);
  }

  getById(id) {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM import_queue WHERE id = ?').get(id);
    if (!row) return null;
    return this._formatRow(row);
  }

  getAll(limit = 100) {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM import_queue
      ORDER BY
        CASE
          WHEN status IN ('initializing', 'processing') THEN 0
          WHEN status = 'queued' THEN 1
          ELSE 2
        END,
        queue_order ASC,
        created_at DESC
      LIMIT ?
    `).all(limit);
    return rows.map((r) => this._formatRow(r));
  }

  getQueue() {
    const all = this.getAll(150);
    const activeTasks = all.filter((t) => t.status === 'initializing' || t.status === 'processing');
    const active = activeTasks[0] || null;
    const queued = all.filter((t) => t.status === 'queued').sort((a, b) => a.queue_order - b.queue_order);
    const history = all.filter((t) => ['completed', 'failed', 'cancelled', 'interrupted'].includes(t.status));

    return {
      active,
      queued,
      history,
      totalCount: all.length,
      pendingCount: queued.length + activeTasks.length,
    };
  }

  getNextQueued() {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM import_queue
      WHERE status = 'queued'
      ORDER BY queue_order ASC, created_at ASC
      LIMIT 1
    `).get();
    return row ? this._formatRow(row) : null;
  }

  getActiveTask() {
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM import_queue
      WHERE status IN ('initializing', 'processing')
      ORDER BY started_at ASC
      LIMIT 1
    `).get();
    return row ? this._formatRow(row) : null;
  }

  update(id, updates) {
    const db = getDatabase();
    const current = this.getById(id);
    if (!current) return null;

    const merged = {
      ...current,
      ...updates,
    };

    if (updates.source_meta !== undefined && typeof updates.source_meta === 'object') {
      merged.source_meta = JSON.stringify(updates.source_meta);
    } else if (typeof merged.source_meta === 'object') {
      merged.source_meta = JSON.stringify(merged.source_meta);
    }

    if (updates.stages_json !== undefined && typeof updates.stages_json === 'object') {
      merged.stages_json = JSON.stringify(updates.stages_json);
    } else if (typeof merged.stages_json === 'object') {
      merged.stages_json = JSON.stringify(merged.stages_json);
    }

    db.prepare(`
      UPDATE import_queue
      SET status = @status,
          stage = @stage,
          stage_label = @stage_label,
          progress = @progress,
          queue_order = @queue_order,
          book_id = @book_id,
          error = @error,
          source_meta = @source_meta,
          stages_json = @stages_json,
          started_at = @started_at,
          completed_at = @completed_at
      WHERE id = @id
    `).run(merged);

    return this.getById(id);
  }

  updateStage(id, stageName, status) {
    if (!id) return null;
    const task = this.getById(id);
    if (!task) return null;
    const currentStages = Array.isArray(task.stages) ? [...task.stages] : [];
    const now = new Date().toISOString();
    const existingIdx = currentStages.findIndex((s) => s.stage === stageName);
    if (existingIdx >= 0) {
      currentStages[existingIdx] = {
        ...currentStages[existingIdx],
        status,
        started_at: status === 'running' ? now : (currentStages[existingIdx].started_at || now),
        completed_at: ['done', 'failed', 'skipped'].includes(status) ? now : currentStages[existingIdx].completed_at,
      };
    } else {
      currentStages.push({
        stage: stageName,
        status,
        started_at: now,
        completed_at: ['done', 'failed', 'skipped'].includes(status) ? now : null,
      });
    }
    return this.update(id, {
      stages_json: currentStages,
    });
  }

  delete(id) {
    const db = getDatabase();
    const info = db.prepare('DELETE FROM import_queue WHERE id = ?').run(id);
    return info.changes > 0;
  }

  getNextQueueOrder() {
    const db = getDatabase();
    const maxRow = db.prepare(`
      SELECT COALESCE(MAX(queue_order), 0) AS max_order
      FROM import_queue
      WHERE status IN ('queued', 'initializing', 'processing')
    `).get();
    return (maxRow?.max_order || 0) + 1;
  }

  clearCompleted() {
    const db = getDatabase();
    try {
      const rows = db.prepare(`
        SELECT source_meta FROM import_queue
        WHERE status IN ('completed', 'cancelled', 'failed', 'interrupted')
      `).all();
      const fs = require('fs');
      for (const row of rows) {
        try {
          const meta = typeof row.source_meta === 'string' ? JSON.parse(row.source_meta || '{}') : (row.source_meta || {});
          if (meta.stagingPath && fs.existsSync(meta.stagingPath)) {
            fs.unlinkSync(meta.stagingPath);
          }
        } catch (_) {}
      }
    } catch (_) {}

    const info = db.prepare(`
      DELETE FROM import_queue
      WHERE status IN ('completed', 'cancelled')
    `).run();
    return info.changes;
  }

  reorder(taskIds = []) {
    if (!Array.isArray(taskIds) || taskIds.length === 0) return;
    const db = getDatabase();

    const updateStmt = db.prepare(`
      UPDATE import_queue
      SET queue_order = ?
      WHERE id = ? AND status = 'queued'
    `);

    db.transaction(() => {
      taskIds.forEach((id, index) => {
        updateStmt.run(index + 1, id);
      });
    })();
  }

  markStaleTasksInterrupted() {
    const db = getDatabase();
    const now = new Date().toISOString();

    const info = db.prepare(`
      UPDATE import_queue
      SET status = 'failed',
          error = COALESCE(error, 'Interrupted by server restart. Retry is safe.'),
          completed_at = ?
      WHERE status IN ('initializing', 'processing')
    `).run(now);

    return info.changes;
  }

  _formatRow(row) {
    let meta = {};
    try {
      meta = typeof row.source_meta === 'string' ? JSON.parse(row.source_meta || '{}') : (row.source_meta || {});
    } catch {
      meta = {};
    }

    let stages = [];
    try {
      stages = typeof row.stages_json === 'string' ? JSON.parse(row.stages_json || '[]') : (row.stages_json || []);
    } catch {
      stages = [];
    }

    return {
      ...row,
      source_meta: meta,
      sourceMeta: meta,
      sourceTitle: row.source_title,
      queueOrder: row.queue_order,
      bookId: row.book_id,
      stageLabel: row.stage_label,
      stages,
      stages_json: stages,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }
}

module.exports = new ImportQueueRepository();

