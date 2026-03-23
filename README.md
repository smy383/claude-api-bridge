# claude-api-bridge

> Turn your Claude Code subscription into a REST API.
> Access Claude Code from anywhere with a single command.

## Why?

- Claude Code has **no official HTTP API**
- You're already paying for a Max subscription ($100+/month)
- Existing wrappers are **local-only** — can't access from external apps
- **claude-api-bridge** exposes your Claude Code as a **secure, remote REST API** via Cloudflare Tunnel

## Features

- ✅ **One-command setup** — `npx claude-api-bridge start`
- 🌐 **Remote access** — Cloudflare Tunnel auto-connects, no port forwarding
- 🔑 **Token authentication** — SHA256 hashed, create/revoke/expire
- 💬 **Stateful conversations** — resume sessions across requests
- 📊 **Web dashboard** — monitor usage and status
- 🔒 **Secure by default** — rate limiting, helmet, CORS
- 📦 **Zero config** — works out of the box

## Quick Start

```bash
# Install
npm install -g claude-api-bridge

# Start (auto-connects Cloudflare Tunnel)
claude-api-bridge start
```

Output:
```
  ✅  Claude Code CLI detected (1.0.x)
  🚀  API server running on http://localhost:3456
  🔑  Admin Token: cab-a1b2c3d4e5...
  🌐  https://abc123.trycloudflare.com
```

## Usage

### Send a message

```bash
# 1. Create an API token (using admin token)
curl -X POST https://YOUR-URL.trycloudflare.com/api/tokens \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app", "sessionMode": "stateless"}'

# 2. Send a message
curl -X POST https://YOUR-URL.trycloudflare.com/api/ask \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a Python function to sort a list"}'

# Response: { "ok": true, "requestId": "xxx", "poll": "GET /api/ask/xxx" }

# 3. Poll for response
curl https://YOUR-URL.trycloudflare.com/api/ask/REQUEST_ID \
  -H "Authorization: Bearer YOUR_API_TOKEN"

# Response: { "status": "completed", "response": "..." }
```

### Python Example

```python
import requests
import time

BASE_URL = "https://YOUR-URL.trycloudflare.com"
TOKEN = "cab-your-token-here"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def ask_claude(message):
    # Send message
    res = requests.post(f"{BASE_URL}/api/ask", json={"message": message}, headers=HEADERS)
    request_id = res.json()["requestId"]

    # Poll for response
    while True:
        poll = requests.get(f"{BASE_URL}/api/ask/{request_id}", headers=HEADERS)
        data = poll.json()
        if data["status"] == "completed":
            return data["response"]
        if data["status"] == "error":
            raise Exception(data["error"])
        time.sleep(2)

print(ask_claude("Explain quantum computing in 3 sentences"))
```

### JavaScript Example

```javascript
const BASE_URL = "https://YOUR-URL.trycloudflare.com";
const TOKEN = "cab-your-token-here";

async function askClaude(message) {
  // Send message
  const res = await fetch(`${BASE_URL}/api/ask`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const { requestId } = await res.json();

  // Poll for response
  while (true) {
    const poll = await fetch(`${BASE_URL}/api/ask/${requestId}`, {
      headers: { "Authorization": `Bearer ${TOKEN}` },
    });
    const data = await poll.json();
    if (data.status === "completed") return data.response;
    if (data.status === "error") throw new Error(data.error);
    await new Promise(r => setTimeout(r, 2000));
  }
}

askClaude("What is the meaning of life?").then(console.log);
```

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/ask` | Token | Send a message to Claude |
| `GET` | `/api/ask/:requestId` | Token | Poll for response |
| `POST` | `/api/tokens` | Admin | Create a new API token |
| `GET` | `/api/tokens` | Admin | List all tokens |
| `DELETE` | `/api/tokens/:id` | Admin | Revoke a token |
| `GET` | `/api/status` | None | Server status |
| `GET` | `/dashboard` | None | Web dashboard |

### Token Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Token name (1-100 chars) |
| `sessionMode` | string | `"stateless"` | `"stateful"` or `"stateless"` |
| `expiresInDays` | number | `null` | 1, 7, 30, 90, or null (never) |

### Response Statuses

| Status | HTTP | Meaning |
|--------|------|---------|
| `queued` | 202 | Waiting in queue |
| `processing` | 202 | Claude is working |
| `completed` | 200 | Response ready |
| `error` | 200 | Execution failed |

## CLI Options

```bash
claude-api-bridge start [options]

Options:
  --port <number>    Server port (default: 3456)
  --no-tunnel        Local only, skip Cloudflare Tunnel
```

## How It Works

```
Your App (anywhere)
    │
    │ HTTPS (Cloudflare Tunnel)
    ▼
┌──────────────────────┐
│ claude-api-bridge     │  ← Your Desktop
│                       │
│  API Server           │
│  ├─ Token Auth        │
│  ├─ Request Queue     │
│  └─ Session Manager   │
│        │              │
│        ▼              │
│  Claude Code CLI      │
│  (your subscription)  │
│        │              │
│        ▼              │
│  SQLite (local)       │
└──────────────────────┘
```

## Security

- 🔐 **Token hashing**: Raw tokens are never stored — only SHA256 hashes
- 🔒 **HTTPS**: Cloudflare Tunnel provides automatic SSL
- 🛡️ **Rate limiting**: 120 requests/minute global limit
- 📏 **Message size limit**: 32KB per message
- 🗑️ **Token expiration**: Auto-expire tokens after 1/7/30/90 days
- ⚠️ **Sandbox**: Claude runs in a designated working directory

## Limitations

- ⏳ **Desktop must be on** — Claude CLI runs on your machine
- 📶 **One at a time** — requests are queued (Claude CLI is single-threaded)
- 🔄 **URL changes** — free Cloudflare Tunnel URL changes on restart (use Cloudflare account for fixed domain)
- ⏱️ **Response time** — depends on Claude CLI execution speed (10s–minutes)

## Disclaimer

This project runs Claude Code CLI on your behalf. Use it responsibly and in accordance with [Anthropic's Terms of Service](https://www.anthropic.com/terms). The authors are not responsible for any misuse or TOS violations.

## Contributing

PRs welcome! Please open an issue first to discuss major changes.

## License

MIT © [mogee](https://github.com/smy383)

---

Built by the team behind [ttapp](https://ttapp-remote.com) — the mobile remote for Claude Code.
