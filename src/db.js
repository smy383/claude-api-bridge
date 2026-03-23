const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const DATA_DIR = process.env.CAB_DATA_DIR || path.join(os.homedir(), '.claude-api-bridge');
const DB_PATH = path.join(DATA_DIR, 'bridge.db');

let db;

function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const fs = require('fs');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ── Schema ──

  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      session_mode TEXT NOT NULL DEFAULT 'stateless',
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      is_admin INTEGER NOT NULL DEFAULT 0,
      rate_limit INTEGER NOT NULL DEFAULT 60
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      message TEXT NOT NULL,
      response TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      session_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER,
      error TEXT,
      FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      claude_session_id TEXT,
      working_dir TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at INTEGER,
      FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_requests_token ON requests(token_id);
    CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_id);
  `);

  return db;
}

// ── Token operations ──

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateToken() {
  const raw = 'cab-' + crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw), prefix: raw.substring(0, 12) };
}

function createToken({ name, sessionMode = 'stateless', expiresInDays = null, isAdmin = false, rateLimit = 60 }) {
  const { raw, hash, prefix } = generateToken();
  const id = crypto.randomUUID();
  const expiresAt = expiresInDays ? Math.floor(Date.now() / 1000) + expiresInDays * 86400 : null;

  getDb().prepare(`
    INSERT INTO tokens (id, name, token_hash, token_prefix, session_mode, expires_at, is_admin, rate_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, hash, prefix, sessionMode, expiresAt, isAdmin ? 1 : 0, rateLimit);

  return { id, raw, prefix };
}

function verifyToken(rawToken) {
  const hash = hashToken(rawToken);
  const token = getDb().prepare('SELECT * FROM tokens WHERE token_hash = ?').get(hash);
  if (!token) return null;
  if (token.expires_at && token.expires_at < Math.floor(Date.now() / 1000)) return null;
  return token;
}

function updateTokenLastUsed(id) {
  getDb().prepare('UPDATE tokens SET last_used_at = unixepoch() WHERE id = ?').run(id);
}

function listTokens() {
  return getDb().prepare('SELECT id, name, token_prefix, session_mode, expires_at, created_at, last_used_at, is_admin, rate_limit FROM tokens ORDER BY created_at DESC').all();
}

function deleteToken(id) {
  const result = getDb().prepare('DELETE FROM tokens WHERE id = ?').run(id);
  return result.changes > 0;
}

function getTokenCount() {
  return getDb().prepare('SELECT COUNT(*) as count FROM tokens').get().count;
}

// ── Request operations ──

function createRequest({ id, tokenId, message, sessionId = null }) {
  getDb().prepare(`
    INSERT INTO requests (id, token_id, message, session_id, status)
    VALUES (?, ?, ?, ?, 'queued')
  `).run(id, tokenId, message, sessionId);
}

function getRequest(id) {
  return getDb().prepare('SELECT * FROM requests WHERE id = ?').get(id);
}

function updateRequest(id, { status, response = null, error = null }) {
  getDb().prepare(`
    UPDATE requests SET status = ?, response = ?, error = ?, completed_at = CASE WHEN ? IN ('completed', 'error') THEN unixepoch() ELSE completed_at END
    WHERE id = ?
  `).run(status, response, error, status, id);
}

function getQueuedRequests() {
  return getDb().prepare("SELECT * FROM requests WHERE status = 'queued' ORDER BY created_at ASC").all();
}

function getQueueLength() {
  return getDb().prepare("SELECT COUNT(*) as count FROM requests WHERE status IN ('queued', 'processing')").get().count;
}

// ── Session operations ──

function getOrCreateSession(tokenId, workingDir) {
  let session = getDb().prepare('SELECT * FROM sessions WHERE token_id = ? ORDER BY last_used_at DESC LIMIT 1').get(tokenId);
  if (!session) {
    const id = crypto.randomUUID();
    getDb().prepare('INSERT INTO sessions (id, token_id, working_dir) VALUES (?, ?, ?)').run(id, tokenId, workingDir);
    session = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  } else {
    getDb().prepare('UPDATE sessions SET last_used_at = unixepoch() WHERE id = ?').run(session.id);
  }
  return session;
}

function updateSessionClaudeId(sessionId, claudeSessionId) {
  getDb().prepare('UPDATE sessions SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, sessionId);
}

// ── Stats ──

function getStats() {
  const d = getDb();
  return {
    totalTokens: d.prepare('SELECT COUNT(*) as c FROM tokens').get().c,
    totalRequests: d.prepare('SELECT COUNT(*) as c FROM requests').get().c,
    completedRequests: d.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'completed'").get().c,
    errorRequests: d.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'error'").get().c,
    queuedRequests: d.prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'queued'").get().c,
  };
}

// ── Cleanup ──

function cleanupOldRequests(daysToKeep = 7) {
  const cutoff = Math.floor(Date.now() / 1000) - daysToKeep * 86400;
  getDb().prepare("DELETE FROM requests WHERE completed_at < ? AND status IN ('completed', 'error')").run(cutoff);
}

module.exports = {
  getDb,
  hashToken,
  createToken,
  verifyToken,
  updateTokenLastUsed,
  listTokens,
  deleteToken,
  getTokenCount,
  createRequest,
  getRequest,
  updateRequest,
  getQueuedRequests,
  getQueueLength,
  getOrCreateSession,
  updateSessionClaudeId,
  getStats,
  cleanupOldRequests,
};
