# Cinder MCP — Agent Instructions

This file provides context and instructions for AI agents working on the Cinder MCP server.

## Project Overview

`cinder-tmcp` is a TMCP (lightweight MCP) server that exposes the [Cinder](https://github.com/Michael-Obele/cinder) web scraping API to AI assistants via the Model Context Protocol.

- **Backend API**: Cinder (Go) — set `CINDER_API_URL` in your env
- **MCP SDK**: [tmcp](https://tmcp.io/) — modern, type-safe, Web-standard
- **Runtime**: Bun (native TypeScript, ESM)
- **Validation**: Valibot via `@tmcp/adapter-valibot`
- **Auth**: OAuth 2.1 via `@tmcp/auth`

## Architecture

```
MCP Client → Cinder MCP Server (tmcp + Bun) → Cinder API (Go) → Chromium/Colly
                                                        ↓
                                                   Redis (Asynq Queue)
```

### Transports
- **HTTP** (Streamable HTTP, MCP spec compliant) — production
- **STDIO** — local development / CLI
- **SSE** — legacy fallback

## Project Structure

```
src/
  index.ts          — Entry point (HTTP + STDIO + SSE)
  server.ts         — McpServer setup, tool registration, instructions
  config.ts         — Valibot-validated env config
  client.ts         — Cinder API HTTP client (SSRF prevention, timeouts, errors)
  auth-provider.ts  — OAuth 2.1 SimpleProvider
  tools/
    scrape.ts       — cinder_scrape tool
    crawl.ts        — cinder_crawl tool
    crawl-status.ts — cinder_crawl_status tool
    search.ts       — cinder_search tool
cinder-mcp/         — Design docs (notes, tasks, README, quick-start)
```

## Cinder API Endpoints

All endpoints are at `<your-cinder>/v1/`:

| Tool | Method | Path | Purpose |
|------|--------|------|---------|
| `cinder_scrape` | POST | `/v1/scrape` | Sync scrape (smart/static/dynamic modes) |
| `cinder_crawl` | POST | `/v1/crawl` | Async crawl enqueue (returns task ID) |
| `cinder_crawl_status` | GET | `/v1/crawl/:id` | Poll crawl job status |
| `cinder_search` | POST | `/v1/search` | Brave Search via Cinder |

## Key Implementation Details

### SSRF Prevention
The `client.ts` validates all URLs before sending to Cinder:
- Blocks non-HTTP(S) protocols
- Blocks private IPs (10.x, 172.16.x, 192.168.x, localhost)
- Blocks `.local` and `.internal` domains

### Error Handling
- `CinderError` class with status code and body
- Tool handlers catch errors and return `isError: true` responses
- Timeout per endpoint type (scrape: 30s, crawl: 10s, status: 5s, search: 15s)

### OAuth 2.1
- Uses `@tmcp/auth` SimpleProvider with in-memory stores
- Enabled via `OAUTH_ENABLED=true`
- For production: swap in-memory stores for database-backed (Redis, Postgres)

## Commands

```bash
bun start           # Start server (production)
bun dev             # Start with watch mode (development)
bun run check       # Full validation: tsc --noEmit (catches type errors, run before commits)
bun check           # Built-in Bun type checker (quick check, no tsconfig needed)
bun run typecheck   # TypeScript type checking via tsc --noEmit
bun install         # Install dependencies
```

## Deployment (Fly.io)

The project includes Fly.io deployment files for the free/hobby tier:

- **`Dockerfile`** — Multi-stage build: `oven/bun:1` for deps, `oven/bun:1-slim` for runtime. Runs as non-root `bun` user, exposes port 8080.
- **`fly.toml`** — `shared-cpu-1x` 256MB VM, scales to zero (`auto_stop_machines = "stop"`, `min_machines_running = 0`). Health check on `/health`. `SIGTERM` graceful shutdown.
- **`.dockerignore`** — Excludes env files, git, node_modules from build context.

### Deploy

```bash
fly launch --no-deploy          # First time: create app
fly secrets set CINDER_API_URL=https://your-cinder.fly.dev
fly deploy                      # Build & deploy
```

Deployed Machine costs ~$2/month running, nearly $0 when stopped (only root FS billed).

## Dependencies

Core: `tmcp`, `@tmcp/adapter-valibot`, `valibot`, `@tmcp/transport-stdio`, `@tmcp/transport-http`, `@tmcp/transport-sse`, `@tmcp/auth`, `srvx`
Dev: `typescript`, `@types/bun`, `@types/node`

## Design Docs

The `cinder-mcp/` folder contains comprehensive design documents:
- `README.md` — Full architecture plan with tool definitions, config guide
- `notes.md` — Technical deep dives (tmcp vs official SDK, OAuth 2.1, SSRF, session management)
- `tasks.md` — Step-by-step implementation checklist (7 phases)
- `QUICK-START.md` — Quick reference for common questions

## References

- [Cinder GitHub](https://github.com/Michael-Obele/cinder)
- [TMCP Docs](https://tmcp.io/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Valibot](https://valibot.dev/)
- [Bun](https://bun.sh/)
