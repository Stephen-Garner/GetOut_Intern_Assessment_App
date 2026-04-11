import Database from 'better-sqlite3';
import path from 'path';

let rootDir = process.cwd();

export function setDbRoot(dir) {
  rootDir = dir;
}

const connections = new Map();

export function getDb(dbFile) {
  const dbPath = path.resolve(rootDir, dbFile);

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
  const dbPath = path.resolve(rootDir, dbFile);
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
