<p align="center">
  <h1 align="center">claude-api-bridge</h1>
  <p align="center">
    <strong>Turn your Claude Code subscription into a REST API.</strong><br>
    Access Claude Code from anywhere — your website, scripts, bots, or any app.
  </p>
  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#how-it-works">How It Works</a> •
    <a href="#api-reference">API Reference</a> •
    <a href="#examples">Examples</a>
  </p>
</p>

---

## The Problem

You're paying **$100+/month** for Claude Code (Max plan). It's incredibly powerful — but it's trapped in your terminal. The official Anthropic API charges per token, so you'd be **paying twice** for the same AI.

Existing open-source wrappers only work on `localhost`. If you want to call Claude Code from a deployed web app, a Slack bot, or a CI pipeline — you're stuck.

## The Solution

**claude-api-bridge** lets you use your **existing Claude Code subscription** as a REST API. One command, and you get a secure HTTPS endpoint accessible from anywhere in the world.

```bash
npx claude-api-bridge start
```

That's it. You now have a REST API for Claude Code.

```
  ✅  Claude Code CLI detected
  🚀  API server running on http://localhost:3456
  🔑  Admin Token: cab-a1b2c3d4e5f6...
  🌐  Public URL: https://random-words.trycloudflare.com
```

## Features

| Feature | Description |
|---------|-------------|
| **🚀 One-command setup** | `npx claude-api-bridge start` — no config files, no env vars |
| **🌐 Remote access** | Auto-connects Cloudflare Tunnel with HTTPS. No port forwarding, no ngrok |
| **🔑 Token auth** | Create, revoke, expire API tokens. SHA256 hashed — raw tokens never stored |
| **💬 Session modes** | Stateless (fresh each time) or Stateful (conversation memory) |
| **📊 Web dashboard** | Monitor queue, requests, and token usage at `/dashboard` |
| **🔒 Secure by default** | Rate limiting, CSP headers, request size limits, execution timeout |
| **⚡ Request queue** | Handles concurrent requests gracefully with ordered processing |
| **🔄 Crash recovery** | Stuck requests auto-recover on restart |
| **💾 Zero dependencies** | SQLite for storage — no Redis, no Postgres, no cloud database |

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- Active Claude Code subscription (Max plan)

### Install & Run

```bash
# Option 1: Run directly (no install needed)
npx claude-api-bridge start

# Option 2: Install globally
npm install -g claude-api-bridge
claude-api-bridge start

# Option 3: Local only (no tunnel)
claude-api-bridge start --no-tunnel
```

### Your First API Call

```bash
# 1️⃣ Create an API token (using the admin token from startup output)
curl -X POST https://YOUR-URL.trycloudflare.com/api/tokens \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'

# Response: { "token": "cab-abc123...", "warning": "Save this token now." }

# 2️⃣ Send a message to Claude
curl -X POST https://YOUR-URL.trycloudflare.com/api/ask \
  -H "Authorization: Bearer cab-abc123..." \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a Python function to check if a number is prime"}'

# Response: { "ok": true, "requestId": "uuid-here", "poll": "GET /api/ask/uuid-here" }

# 3️⃣ Poll for the response
curl https://YOUR-URL.trycloudflare.com/api/ask/uuid-here \
  -H "Authorization: Bearer cab-abc123..."

# Response: { "status": "completed", "response": "def is_prime(n): ..." }
```

## How It Works

```
┌─────────────────────────────────────────────────┐
│  Your App / Script / Bot  (anywhere on internet) │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS request
                       ▼
              Cloudflare Tunnel
              (automatic SSL, no config)
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│  claude-api-bridge               (your desktop)  │
│                                                  │
│  ┌─────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Token Auth   │→│ Request  │→│ Claude CLI  │  │
│  │ (SHA256)     │  │ Queue    │  │ Executor   │  │
│  └─────────────┘  └──────────┘  └────────────┘  │
│                                       │          │
│  ┌─────────────┐  ┌──────────────────┘          │
│  │ SQLite DB    │←│  Response                    │
│  │ (local file) │  │                             │
│  └─────────────┘  └─────────────────────────────│
└──────────────────────────────────────────────────┘
```

**Key point**: Claude Code runs on **your machine** using **your subscription**. No API keys sent to third parties. No middleman servers.

## Examples

### Python

```python
import requests
import time

BASE_URL = "https://YOUR-URL.trycloudflare.com"
TOKEN = "cab-your-token-here"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def ask_claude(message):
    """Send a message to Claude Code and wait for response."""
    # Send
    res = requests.post(f"{BASE_URL}/api/ask",
                        json={"message": message}, headers=HEADERS)
    request_id = res.json()["requestId"]

    # Poll
    while True:
        poll = requests.get(f"{BASE_URL}/api/ask/{request_id}", headers=HEADERS)
        data = poll.json()
        if data["status"] == "completed":
            return data["response"]
        if data["status"] == "error":
            raise Exception(data["error"])
        time.sleep(2)

# Use it
response = ask_claude("Explain quantum computing in 3 sentences")
print(response)
```

### JavaScript / TypeScript

```javascript
const BASE_URL = "https://YOUR-URL.trycloudflare.com";
const TOKEN = "cab-your-token-here";

async function askClaude(message) {
  // Send
  const res = await fetch(`${BASE_URL}/api/ask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
  const { requestId } = await res.json();

  // Poll
  while (true) {
    const poll = await fetch(`${BASE_URL}/api/ask/${requestId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await poll.json();
    if (data.status === "completed") return data.response;
    if (data.status === "error") throw new Error(data.error);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// Use it
const answer = await askClaude("What is the meaning of life?");
console.log(answer);
```

### Shell Script

```bash
#!/bin/bash
URL="https://YOUR-URL.trycloudflare.com"
TOKEN="cab-your-token-here"

# Send message
RESPONSE=$(curl -s -X POST "$URL/api/ask" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "List 5 useful Linux commands"}')

REQUEST_ID=$(echo $RESPONSE | jq -r '.requestId')

# Poll until complete
while true; do
  RESULT=$(curl -s "$URL/api/ask/$REQUEST_ID" \
    -H "Authorization: Bearer $TOKEN")
  STATUS=$(echo $RESULT | jq -r '.status')

  if [ "$STATUS" = "completed" ]; then
    echo $RESULT | jq -r '.response'
    break
  fi
  sleep 2
done
```

## API Reference

### Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/ask` | Token | Send a message to Claude Code |
| `GET` | `/api/ask/:requestId` | Token | Poll for response |
| `POST` | `/api/tokens` | Admin | Create a new API token |
| `GET` | `/api/tokens` | Admin | List all tokens |
| `DELETE` | `/api/tokens/:id` | Admin | Revoke a token |
| `GET` | `/api/status` | — | Server status & stats |
| `GET` | `/dashboard` | — | Web dashboard |

### POST /api/ask

Send a message to Claude Code for processing.

**Request:**
```json
{
  "message": "Your prompt here (max 32KB)"
}
```

**Response (202):**
```json
{
  "ok": true,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "position": 1,
  "poll": "GET /api/ask/550e8400-e29b-41d4-a716-446655440000"
}
```

### GET /api/ask/:requestId

Poll for the result of a previous request.

**Responses:**

| Status | HTTP Code | Body |
|--------|-----------|------|
| Queued | 202 | `{ "status": "queued", "queuePosition": 2 }` |
| Processing | 202 | `{ "status": "processing" }` |
| Completed | 200 | `{ "status": "completed", "response": "..." }` |
| Error | 200 | `{ "status": "error", "error": "..." }` |

### POST /api/tokens

Create a new API token (admin only).

**Request:**
```json
{
  "name": "my-slack-bot",
  "sessionMode": "stateless",
  "expiresInDays": 30
}
```

| Field | Type | Default | Options |
|-------|------|---------|---------|
| `name` | string | *required* | 1–100 characters |
| `sessionMode` | string | `"stateless"` | `"stateful"` / `"stateless"` |
| `expiresInDays` | number | `null` | `1`, `7`, `30`, `90`, or `null` (never) |

**Session modes:**
- **Stateless** — each request starts a fresh conversation. Best for independent queries.
- **Stateful** — conversations persist across requests using `--resume`. Best for multi-turn interactions.

### Error Codes

| HTTP | Meaning |
|------|---------|
| 400 | Bad request (missing/invalid fields) |
| 401 | Missing, invalid, or expired token |
| 403 | Insufficient permissions (admin required) |
| 404 | Request or token not found |
| 429 | Rate limit or queue full |
| 500 | Internal server error |

## CLI Options

```
claude-api-bridge start [options]

Options:
  --port <number>    Server port (default: 3456)
  --no-tunnel        Local only mode, skip Cloudflare Tunnel

Other commands:
  --version, -v      Show version
  --help, -h         Show help
```

## Security

| Measure | Details |
|---------|---------|
| **Token hashing** | Raw tokens are never stored in the database — only SHA256 hashes |
| **HTTPS** | Cloudflare Tunnel provides automatic TLS/SSL encryption |
| **Rate limiting** | 120 requests/minute global limit |
| **Message size** | 32KB maximum per message |
| **Output limit** | 10MB maximum Claude CLI output |
| **Execution timeout** | 5 minute maximum per request |
| **Token expiration** | Auto-expire after 1/7/30/90 days |
| **Admin protection** | Last admin token cannot be deleted |
| **CSP headers** | Content Security Policy enabled via Helmet |
| **Crash recovery** | Stuck requests auto-recover on server restart |

## Limitations

| Limitation | Details |
|------------|---------|
| **Desktop must be running** | Claude CLI executes on your machine — it must be on |
| **Sequential processing** | One request at a time (Claude CLI is single-threaded) |
| **URL changes on restart** | Free Cloudflare Tunnel assigns a new URL each time. Use a [Cloudflare account](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for a persistent domain |
| **Response time** | Depends on Claude CLI speed (typically 10s–2min) |
| **Subscription required** | You need an active Claude Code Max subscription |

## Comparison with Alternatives

| Feature | claude-api-bridge | coder/agentapi | claude-code-api |
|---------|:-:|:-:|:-:|
| Remote access (HTTPS) | ✅ Built-in | ❌ Local only | ❌ Local only |
| Token management | ✅ Full CRUD | ❌ None | ⚠️ Static keys |
| Token security | ✅ SHA256 hash | ❌ N/A | ❌ Plaintext |
| Session persistence | ✅ SQLite | ❌ In-memory | ⚠️ In-memory |
| Crash recovery | ✅ Auto | ❌ No | ❌ No |
| Zero config | ✅ One command | ✅ One command | ⚠️ Config needed |
| Multi-agent support | ❌ Claude only | ✅ 10+ agents | ❌ Claude only |

## Data Storage

All data is stored locally in `~/.claude-api-bridge/`:

```
~/.claude-api-bridge/
├── bridge.db          # SQLite database (tokens, requests, sessions)
└── bin/
    └── cloudflared    # Auto-downloaded tunnel binary
```

No data is sent to any external server except Cloudflare (for tunneling) and Anthropic (via Claude CLI).

## Disclaimer

This project executes Claude Code CLI on your behalf using your existing subscription. Use it responsibly and in accordance with [Anthropic's Terms of Service](https://www.anthropic.com/terms).

The authors are not affiliated with Anthropic and are not responsible for any misuse, TOS violations, or unexpected charges.

## Contributing

Contributions are welcome! Please:

1. Open an issue first to discuss major changes
2. Fork the repository
3. Create your feature branch (`git checkout -b feature/amazing-feature`)
4. Commit your changes
5. Push to the branch
6. Open a Pull Request

## License

MIT © [mogee](https://github.com/smy383)

---

<p align="center">
  Built by the team behind <a href="https://ttapp-remote.com"><strong>ttapp</strong></a> — the mobile remote for Claude Code.
</p>
