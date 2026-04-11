import { getDb } from './connection.js';

/**
 * Create a members table from CSV headers and insert rows.
 * Columns are dynamically created based on CSV data.
 */
export function createTableFromCsv(dbFile, headers, rows) {
  const db = getDb(dbFile);

  // Sanitize column names: lowercase, replace spaces/special chars with underscores
  const columns = headers.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  // Drop existing table
  db.exec('DROP TABLE IF EXISTS members');

  // Create table with all TEXT columns (flexible for any CSV)
  const colDefs = columns.map((c) => `"${c}" TEXT`).join(', ');
  db.exec(`CREATE TABLE members (id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs})`);

  // Build insert statement
  const placeholders = columns.map(() => '?').join(', ');
  const colNames = columns.map((c) => `"${c}"`).join(', ');
  const insert = db.prepare(`INSERT INTO members (${colNames}) VALUES (${placeholders})`);

  // Batch insert with transaction
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const values = columns.map((_, i) => (row[i] !== undefined ? row[i] : null));
      insert.run(values);
    }
  });

  insertMany(rows);

  // Create indexes on common columns if they exist
  const indexableColumns = ['member_id', 'market', 'segment', 'purchase_date', 'last_visit_date', 'status'];
  for (const col of indexableColumns) {
    if (columns.includes(col)) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${col} ON members("${col}")`);
    }
  }

  return { rowCount: rows.length, columns };
}

export function getTableInfo(dbFile) {
  const db = getDb(dbFile);
  try {
    const info = db.prepare("PRAGMA table_info('members')").all();
    const count = db.prepare('SELECT COUNT(*) as count FROM members').get();
    return { columns: info.map((c) => c.name), rowCount: count.count };
  } catch {
    return { columns: [], rowCount: 0 };
  }
}
