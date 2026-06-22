import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

// Determine a sensible default location for the SQLite DB when SQLITE_PATH
// is not provided. Prefer OS app-data directories so the DB is per-user and
// survives app updates.
function defaultDbPath() {
  if (process.env.SQLITE_PATH && process.env.SQLITE_PATH.trim() !== '') {
    const customPath = process.env.SQLITE_PATH.trim();
    const customDir = path.dirname(customPath);
    if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });
    return customPath;
  }

  const home = os.homedir();
  let base;
  if (process.platform === 'win32') {
    base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    base = path.join(home, 'Library', 'Application Support');
  } else {
    base = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  }

  const appFolder = process.env.POS_APP_FOLDER || 'p3l-pos';
  const dbDir = path.join(base, appFolder);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  return path.join(dbDir, 'pos.db');
}

export const dbPath = defaultDbPath();

// Log resolved DB path for easier debugging in packaged apps
try {
  console.log(`SQLite DB path: ${dbPath}`);
} catch (e) {
  // ignore logging errors in restricted environments
}

const sqlite = new Database(dbPath);
sqlite.pragma('foreign_keys = ON');

// --- Backup Implementation ---
function performBackup() {
  try {
    const backupDir = path.join(path.dirname(dbPath), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const dateStr = new Date().toISOString().split('T')[0];
    const backupFile = path.join(backupDir, `pos_backup_${dateStr}.db`);
    
    if (!fs.existsSync(backupFile)) {
      sqlite.backup(backupFile)
        .then(() => console.log(`[BACKUP] Database successfully backed up to ${backupFile}`))
        .catch(err => console.error('[BACKUP] Database backup failed', err));
    }
  } catch (e) {
    console.error('[BACKUP] Database backup setup failed', e);
  }
}

// Run backup immediately on startup
performBackup();
// Setup interval check (every 12 hours)
setInterval(performBackup, 12 * 60 * 60 * 1000);
// -----------------------------

function normalizeSql(sql) {
  let query = String(sql).trim();
  query = query.replace(/`/g, '');
  query = query.replace(/CURDATE\(\)/gi, "date('now', 'localtime')");
  query = query.replace(/NOW\(\)/gi, "datetime('now', 'localtime')");
  query = query.replace(/DATE_SUB\(CURRENT_TIMESTAMP, INTERVAL (\d+) WEEK\)/gi, "datetime('now', 'localtime', '-$1 week')");
  query = query.replace(/DATE_SUB\(CURRENT_TIMESTAMP, INTERVAL (\d+) MONTH\)/gi, "datetime('now', 'localtime', '-$1 month')");
  query = query.replace(/DATE_SUB\(CURRENT_TIMESTAMP, INTERVAL (\d+) YEAR\)/gi, "datetime('now', 'localtime', '-$1 year')");
  query = query.replace(/DATE_SUB\(NOW\(\), INTERVAL (\d+) WEEK\)/gi, "datetime('now', 'localtime', '-$1 week')");
  query = query.replace(/DATE_SUB\(NOW\(\), INTERVAL (\d+) MONTH\)/gi, "datetime('now', 'localtime', '-$1 month')");
  query = query.replace(/DATE_SUB\(NOW\(\), INTERVAL (\d+) YEAR\)/gi, "datetime('now', 'localtime', '-$1 year')");
  return query;
}

function expandArrayParams(sql, params = []) {
  const nextParams = [];
  let query = sql;

  for (const param of params) {
    if (Array.isArray(param) && query.includes('IN (?)')) {
      const placeholders = param.map(() => '?').join(', ');
      query = query.replace('IN (?)', `IN (${placeholders})`);
      nextParams.push(...param);
    } else {
      nextParams.push(param);
    }
  }

  return { query, params: nextParams };
}

function isSelect(query) {
  return /^(select|with|pragma|explain)\b/i.test(query.trim());
}

async function runQuery(sql, params = []) {
  const normalized = normalizeSql(sql);
  const expanded = expandArrayParams(normalized, params);
  const stmt = sqlite.prepare(expanded.query);

  if (isSelect(expanded.query)) {
    const rows = stmt.all(...expanded.params);
    return [rows, []];
  }

  const result = stmt.run(...expanded.params);
  return [{ insertId: Number(result.lastInsertRowid || 0), affectedRows: result.changes || 0 }];
}

async function beginTransaction() {
  sqlite.exec('BEGIN');
}

async function commit() {
  sqlite.exec('COMMIT');
}

async function rollback() {
  sqlite.exec('ROLLBACK');
}

async function release() {
  return undefined;
}

const pool = {
  query: runQuery,
  getConnection: async () => ({
    query: runQuery,
    beginTransaction,
    commit,
    rollback,
    release,
  }),
  beginTransaction,
  commit,
  rollback,
  release,
  raw: sqlite,
};

export default pool;
