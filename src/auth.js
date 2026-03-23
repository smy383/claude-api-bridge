const db = require('./db');

const MAX_TOKENS = 20;

// ── Middleware ──

function authenticate(requireAdmin = false) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header. Use: Bearer <token>' });
    }

    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) {
      return res.status(401).json({ error: 'Empty token' });
    }

    const token = db.verifyToken(rawToken);
    if (!token) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (requireAdmin && !token.is_admin) {
      return res.status(403).json({ error: 'Admin token required' });
    }

    db.updateTokenLastUsed(token.id);
    req.token = token;
    next();
  };
}

// ── Token management ──

function createToken({ name, sessionMode, expiresInDays, rateLimit }) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Token name is required');
  }
  if (name.length > 100) {
    throw new Error('Token name must be 100 characters or less');
  }

  const validModes = ['stateful', 'stateless'];
  if (sessionMode && !validModes.includes(sessionMode)) {
    throw new Error('sessionMode must be "stateful" or "stateless"');
  }

  const validDays = [1, 7, 30, 90, null];
  if (expiresInDays !== undefined && expiresInDays !== null && !validDays.includes(expiresInDays)) {
    throw new Error('expiresInDays must be 1, 7, 30, 90, or null (never)');
  }

  const count = db.getTokenCount();
  if (count >= MAX_TOKENS) {
    throw new Error(`Maximum ${MAX_TOKENS} tokens allowed`);
  }

  return db.createToken({
    name: name.trim(),
    sessionMode: sessionMode || 'stateless',
    expiresInDays: expiresInDays || null,
    rateLimit: rateLimit || 60,
  });
}

function listTokens() {
  return db.listTokens().map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.token_prefix,
    sessionMode: t.session_mode,
    expiresAt: t.expires_at ? new Date(t.expires_at * 1000).toISOString() : null,
    createdAt: new Date(t.created_at * 1000).toISOString(),
    lastUsedAt: t.last_used_at ? new Date(t.last_used_at * 1000).toISOString() : null,
    isAdmin: !!t.is_admin,
    rateLimit: t.rate_limit,
    isExpired: t.expires_at ? t.expires_at < Math.floor(Date.now() / 1000) : false,
  }));
}

function deleteToken(id) {
  return db.deleteToken(id);
}

module.exports = {
  authenticate,
  createToken,
  listTokens,
  deleteToken,
};
