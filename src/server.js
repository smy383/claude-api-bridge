const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const dashboard = require('./dashboard');
const tunnel = require('./tunnel');
const db = require('./db');
const auth = require('./auth');

async function start(port, options = {}) {
  const app = express();

  // ── Middleware ──

  app.use(helmet({
    contentSecurityPolicy: false, // Allow dashboard inline scripts
  }));

  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(express.json({ limit: '64kb' }));

  // Global rate limit
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  }));

  // ── Routes ──

  app.use(routes);
  app.use(dashboard);

  // Root
  app.get('/', (req, res) => {
    res.json({
      name: 'claude-api-bridge',
      version: require('../package.json').version,
      description: 'Turn your Claude Code subscription into a REST API',
      endpoints: {
        'POST /api/ask': 'Send a message to Claude',
        'GET /api/ask/:requestId': 'Poll for response',
        'POST /api/tokens': 'Create API token (admin)',
        'GET /api/tokens': 'List tokens (admin)',
        'DELETE /api/tokens/:id': 'Delete token (admin)',
        'GET /api/status': 'Server status',
        'GET /dashboard': 'Web dashboard',
      },
      docs: 'https://github.com/smy383/claude-api-bridge#readme',
    });
  });

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ── Start listening ──

  const server = app.listen(port, () => {
    console.log(`  🚀  API server running on http://localhost:${port}`);
  });

  // ── Auto-create admin token if none exists ──

  const tokens = auth.listTokens();
  const hasAdmin = tokens.some((t) => t.isAdmin);

  if (!hasAdmin) {
    const result = db.createToken({
      name: 'Admin',
      sessionMode: 'stateless',
      isAdmin: true,
    });
    console.log('');
    console.log('  🔑  Admin Token (save this — shown only once!):');
    console.log('');
    console.log(`      ${result.raw}`);
    console.log('');
    console.log('  Use this token to create/manage API tokens.');
    console.log('');
  }

  // ── Start Cloudflare Tunnel ──

  if (!options.noTunnel) {
    try {
      console.log('  🌐  Connecting Cloudflare Tunnel...');
      const { url, process: tunnelProcess } = await tunnel.startTunnel(port);

      console.log('');
      console.log('  ┌──────────────────────────────────────────────┐');
      console.log('  │  🌐  Public URL                              │');
      console.log('  │                                              │');
      console.log(`  │  ${url.padEnd(44)}│`);
      console.log('  │                                              │');
      console.log('  │  Access your Claude API from anywhere!       │');
      console.log('  └──────────────────────────────────────────────┘');
      console.log('');
      console.log(`  📖  Dashboard: ${url}/dashboard`);
      console.log('');

      // Graceful shutdown
      const cleanup = () => {
        console.log('\n  Shutting down...');
        tunnelProcess.kill();
        server.close();
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

    } catch (err) {
      console.log(`  ⚠️  Tunnel failed: ${err.message}`);
      console.log('  ℹ️  Running in local-only mode (http://localhost:' + port + ')');
      console.log('');
    }
  } else {
    console.log(`  ℹ️  Local-only mode (--no-tunnel)`);
    console.log(`  📖  Dashboard: http://localhost:${port}/dashboard`);
    console.log('');
  }

  // ── Periodic cleanup ──

  setInterval(() => {
    db.cleanupOldRequests(7);
  }, 60 * 60 * 1000); // Every hour

  return server;
}

module.exports = { start };
