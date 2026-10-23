// Match the small D1 API surface used by the shared account handlers locally.
export function d1Adapter(db) {
  return {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        first() { return db.prepare(sql).get(...params) ?? null; },
        all() { return { results: db.prepare(sql).all(...params) }; },
        run() { const result = db.prepare(sql).run(...params); return { meta: { changes: result.changes, rows_written: result.changes, last_row_id: Number(result.lastInsertRowid) } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      // Run the synchronous SQLite transaction without yielding to another request.
      try { const results = statements.map((statement) => statement.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
