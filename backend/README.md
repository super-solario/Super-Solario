# Super Solario Leaderboard Backend

Small Node HTTP API powering the global board.

## Endpoints

- `GET /health` — status
- `GET /board` — `{ entries, recent, version, updatedAt }`
- `POST /submit` — body `{ name, score, coins, level }`

## Run locally

```bash
node backend/server.js
# listens on :8787
```

Point `lb-config.js` `apiUrl` at your public URL (Cloudflare Tunnel, Railway, Render, Fly, etc.).

On each submit the server mirrors `data/leaderboard.json` (durable read for GitHub Pages).

## Deploy

Any Node host works. Example with Cloudflare Tunnel:

```bash
node backend/server.js &
cloudflared tunnel --url http://127.0.0.1:8787
```

Then set `apiUrl` in `lb-config.js` to the printed `*.trycloudflare.com` URL.
