#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const VERSION = require('../package.json').version;
const DATA_DIR = path.join(os.homedir(), '.claude-api-bridge');

// ── Helpers ──────────────────────────────────────────────

function log(emoji, msg) {
  console.log(`  ${emoji}  ${msg}`);
}

function error(msg) {
  console.error(`\n  ❌  ${msg}\n`);
  process.exit(1);
}

function checkClaudeCli() {
  const { execFileSync } = require('child_process');
  const candidates = [
    'claude',
    '/usr/local/bin/claude',
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
  ];
  // Windows paths
  if (os.platform() === 'win32') {
    candidates.push(
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude', 'claude.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'claude-cli-nodejs', 'claude.exe'),
    );
  }
  for (const bin of candidates) {
    try {
      return execFileSync(bin, ['--version'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch { /* continue */ }
  }
  return null;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ── Banner ───────────────────────────────────────────────

function showBanner() {
  console.log(`
  ┌─────────────────────────────────────┐
  │                                     │
  │       claude-api-bridge v${VERSION}      │
  │                                     │
  │   Turn Claude Code into a REST API  │
  │                                     │
  └─────────────────────────────────────┘
  `);
}

// ── Commands ─────────────────────────────────────────────

async function startServer(options = {}) {
  showBanner();

  // 1. Check Claude CLI
  const claudeVersion = checkClaudeCli();
  if (!claudeVersion) {
    error('Claude Code CLI not found. Install it first: https://docs.anthropic.com/en/docs/claude-code');
  }
  log('✅', `Claude Code CLI detected (${claudeVersion})`);

  // 2. Ensure data directory
  ensureDataDir();
  log('✅', `Data directory: ${DATA_DIR}`);

  // 3. Start server
  const port = options.port || process.env.PORT || 3456;
  const noTunnel = options.noTunnel || false;

  process.env.CAB_DATA_DIR = DATA_DIR;
  process.env.CAB_PORT = String(port);
  process.env.CAB_NO_TUNNEL = noTunnel ? '1' : '0';

  const server = require('../src/server');
  await server.start(port, { noTunnel });
}

// ── CLI Parsing ──────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'start') {
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      options.port = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--no-tunnel') {
      options.noTunnel = true;
    }
  }

  startServer(options).catch((err) => {
    error(err.message);
  });

} else if (command === '--version' || command === '-v') {
  console.log(VERSION);

} else if (command === '--help' || command === '-h') {
  showBanner();
  console.log(`
  Usage:
    claude-api-bridge start [options]

  Options:
    --port <number>    Server port (default: 3456)
    --no-tunnel        Local only, skip Cloudflare Tunnel

  Examples:
    claude-api-bridge start
    claude-api-bridge start --port 8080
    claude-api-bridge start --no-tunnel
  `);

} else {
  error(`Unknown command: ${command}. Use --help for usage.`);
}
