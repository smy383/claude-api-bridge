const express = require('express');
const crypto = require('crypto');
const auth = require('./auth');
const db = require('./db');
const queue = require('./queue');
const claude = require('./claude');

const router = express.Router();

// ── POST /api/ask — Send a message ──────────────────────

router.post('/api/ask', auth.authenticate(), (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message field is required (string)' });
    }

    if (message.length > claude.MAX_MESSAGE_SIZE) {
      return res.status(400).json({ error: `Message exceeds ${claude.MAX_MESSAGE_SIZE} byte limit` });
    }

    const requestId = crypto.randomUUID();
    const token = req.token;

    // Determine session handling
    let sessionId = null;
    if (token.session_mode === 'stateful') {
      const session = db.getOrCreateSession(token.id, claude.DEFAULT_WORKING_DIR);
      sessionId = session.id;
    }

    const { position } = queue.enqueue({
      requestId,
      tokenId: token.id,
      message,
      sessionMode: token.session_mode,
      sessionId,
    });

    res.status(202).json({
      ok: true,
      requestId,
      position,
      poll: `GET /api/ask/${requestId}`,
    });

  } catch (err) {
    if (err.message.includes('Queue is full')) {
      return res.status(429).json({ error: err.message });
    }
    console.error('POST /api/ask error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/ask/:requestId — Poll for response ─────────

router.get('/api/ask/:requestId', auth.authenticate(), (req, res) => {
  const request = db.getRequest(req.params.requestId);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  // Verify ownership
  if (request.token_id !== req.token.id && !req.token.is_admin) {
    return res.status(403).json({ error: 'Not your request' });
  }

  if (request.status === 'completed') {
    return res.json({
      status: 'completed',
      requestId: request.id,
      response: request.response,
      completedAt: new Date(request.completed_at * 1000).toISOString(),
    });
  }

  if (request.status === 'error') {
    return res.json({
      status: 'error',
      requestId: request.id,
      error: request.error,
    });
  }

  // Still processing or queued
  res.status(202).json({
    status: request.status, // 'queued' or 'processing'
    requestId: request.id,
    queuePosition: request.status === 'queued'
      ? db.getDb().prepare("SELECT COUNT(*) as c FROM requests WHERE status = 'queued' AND created_at <= ?").get(request.created_at).c
      : 0,
  });
});

// ── POST /api/tokens — Create token (admin only) ────────

router.post('/api/tokens', auth.authenticate(true), (req, res) => {
  try {
    const { name, sessionMode, expiresInDays } = req.body;
    const result = auth.createToken({ name, sessionMode, expiresInDays });

    res.status(201).json({
      ok: true,
      tokenId: result.id,
      token: result.raw, // Only returned once
      prefix: result.prefix,
      warning: 'Save this token now. It cannot be retrieved again.',
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/tokens — List tokens (admin only) ──────────

router.get('/api/tokens', auth.authenticate(true), (req, res) => {
  const tokens = auth.listTokens();
  res.json({ tokens });
});

// ── DELETE /api/tokens/:id — Delete token (admin only) ──

router.delete('/api/tokens/:id', auth.authenticate(true), (req, res) => {
  // Prevent deleting the last admin token
  const tokenToDelete = db.getDb().prepare('SELECT * FROM tokens WHERE id = ?').get(req.params.id);
  if (!tokenToDelete) {
    return res.status(404).json({ error: 'Token not found' });
  }
  if (tokenToDelete.is_admin) {
    const adminCount = db.getDb().prepare('SELECT COUNT(*) as c FROM tokens WHERE is_admin = 1').get().c;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin token' });
    }
  }

  const deleted = auth.deleteToken(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Token not found' });
  }
  res.json({ ok: true, message: 'Token revoked' });
});

// ── GET /api/status — Server status ─────────────────────

router.get('/api/status', (req, res) => {
  const queueStatus = queue.getStatus();
  const stats = db.getStats();

  res.json({
    status: 'running',
    version: require('../package.json').version,
    queue: {
      isProcessing: queueStatus.isProcessing,
      length: queueStatus.queueLength,
    },
    stats,
  });
});

module.exports = router;
