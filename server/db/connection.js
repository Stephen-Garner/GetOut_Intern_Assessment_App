import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const connections = new Map();

export function getDb(dbFile) {
  const dbPath = path.resolve(ROOT, dbFile);

  if (connections.has(dbPath)) {
    return connections.get(dbPath);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  connections.set(dbPath, db);
  return db;
}

export function closeDb(dbFile) {
  const dbPath = path.resolve(ROOT, dbFile);
  const db = connections.get(dbPath);
  if (db) {
    db.close();
    connections.delete(dbPath);
  }
}

export function closeAll() {
  for (const db of connections.values()) {
    db.close();
  }
  connections.clear();
}
