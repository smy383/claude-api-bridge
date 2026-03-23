const express = require('express');
const db = require('./db');
const queue = require('./queue');
const auth = require('./auth');

const router = express.Router();

// ── Dashboard HTML ──────────────────────────────────────

router.get('/dashboard', (req, res) => {
  res.send(getDashboardHtml());
});

function getDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>claude-api-bridge Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1b26;
      color: #a9b1d6;
      padding: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 { color: #7aa2f7; margin-bottom: 0.5rem; font-size: 1.8rem; }
    .subtitle { color: #565f89; margin-bottom: 2rem; }
    .card {
      background: #24283b;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      border: 1px solid #2f3549;
    }
    .card h2 { color: #bb9af7; font-size: 1.1rem; margin-bottom: 1rem; }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
    }
    .stat {
      background: #1a1b26;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .stat .value { font-size: 2rem; font-weight: bold; color: #7aa2f7; }
    .stat .label { font-size: 0.8rem; color: #565f89; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: #565f89; font-size: 0.8rem; padding: 0.5rem; border-bottom: 1px solid #2f3549; }
    td { padding: 0.75rem 0.5rem; border-bottom: 1px solid #2f3549; font-size: 0.9rem; }
    .badge {
      display: inline-block;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-active { background: #1a3a2a; color: #9ece6a; }
    .badge-expired { background: #3a1a1a; color: #f7768e; }
    .badge-admin { background: #2a2a3a; color: #bb9af7; }
    .mono { font-family: 'SF Mono', monospace; font-size: 0.85rem; }
    .footer {
      text-align: center;
      color: #565f89;
      margin-top: 3rem;
      font-size: 0.8rem;
    }
    .footer a { color: #7aa2f7; text-decoration: none; }
    .refresh-btn {
      background: #2f3549;
      color: #a9b1d6;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      float: right;
    }
    .refresh-btn:hover { background: #3b4261; }
    .queue-status { display: flex; align-items: center; gap: 0.5rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot-green { background: #9ece6a; }
    .dot-yellow { background: #e0af68; }
    .empty { color: #565f89; text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <h1>claude-api-bridge</h1>
  <p class="subtitle">Dashboard</p>

  <div class="card">
    <h2>Status</h2>
    <div class="stat-grid" id="stats">
      <div class="stat"><div class="value" id="s-tokens">-</div><div class="label">Tokens</div></div>
      <div class="stat"><div class="value" id="s-total">-</div><div class="label">Total Requests</div></div>
      <div class="stat"><div class="value" id="s-completed">-</div><div class="label">Completed</div></div>
      <div class="stat"><div class="value" id="s-errors">-</div><div class="label">Errors</div></div>
      <div class="stat"><div class="value" id="s-queue">-</div><div class="label">In Queue</div></div>
    </div>
  </div>

  <div class="card">
    <button class="refresh-btn" onclick="loadData()">Refresh</button>
    <h2>API Usage</h2>
    <p style="margin-top:0.5rem; color: #565f89; font-size: 0.9rem;">
      Use your admin token to manage tokens via the API.<br>
      See <a href="/api/status" style="color:#7aa2f7">/api/status</a> for server info.
    </p>
  </div>

  <div class="footer">
    Built by the team behind <a href="https://ttapp-remote.com" target="_blank">ttapp</a>
  </div>

  <script>
    async function loadData() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        document.getElementById('s-tokens').textContent = data.stats.totalTokens;
        document.getElementById('s-total').textContent = data.stats.totalRequests;
        document.getElementById('s-completed').textContent = data.stats.completedRequests;
        document.getElementById('s-errors').textContent = data.stats.errorRequests;
        document.getElementById('s-queue').textContent = data.stats.queuedRequests;
      } catch (e) {
        console.error('Failed to load stats:', e);
      }
    }
    loadData();
    setInterval(loadData, 10000);
  </script>
</body>
</html>`;
}

module.exports = router;
