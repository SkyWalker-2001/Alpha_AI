# AlphaAI

A local, agentic, Claude-like assistant powered by **your own Qwen model via Ollama**.

Your Qwen model can *talk* — AlphaAI lets it *act*. It wraps the model in an
agentic runtime that runs shell commands, reads/writes/edits files, browses the
web, and keeps **persistent memory** across sessions. Use it from a polished
**CLI** or a **Claude-style web UI** — both share one engine.

> ⚠️ AlphaAI runs with **full autonomy** by default: tool calls (including shell
> commands) execute immediately, without asking. It can do anything your user
> account can. Point `WORKSPACE` at a directory you trust it in.

## Architecture

```
packages/
  core/    the brain — Ollama client, agentic loop, tools, memory (shared)
  cli/     Ink terminal UI          →  npm run cli
  server/  Fastify + WebSocket API  →  npm run server
  web/     React + Vite chat UI     →  npm run web
```

The agentic loop lives once in `core/src/agent.ts` as an event stream; the CLI
and web UI both just render it.

## Requirements

- Node.js ≥ 20 (you have 22)
- [Ollama](https://ollama.com) running locally
- A tool-capable chat model: `ollama pull qwen3-coder:30b`
- An embedding model for memory: `ollama pull nomic-embed-text`

## Setup

```bash
cp .env.example .env       # tweak MODEL / WORKSPACE / AUTONOMY if you like
npm install
npm run doctor             # verifies Ollama + both models
```

## Usage

**CLI:**
```bash
npm run cli
```
Chat, or use `/new`, `/history`, `/help`, `/exit`. Esc quits.

**Web UI (two processes):**
```bash
npm run dev                # starts the server (:8787) and web (:5173) together
# open http://localhost:5173
```

Or run them separately: `npm run server` and `npm run web`.

**Production web build** (served by the API server on `:8787`):
```bash
npm run build
npm run server
# open http://localhost:8787
```

## Configuration (`.env`)

| Var          | Default                  | Meaning                                    |
|--------------|--------------------------|--------------------------------------------|
| `OLLAMA_HOST`| `http://localhost:11434` | Ollama endpoint                            |
| `MODEL`      | `qwen3-coder:30b`        | Chat model (must support tools)            |
| `EMBED_MODEL`| `nomic-embed-text`       | Embedding model for semantic memory        |
| `AUTONOMY`   | `full`                   | `full` = no prompts (`approve` reserved)   |
| `WORKSPACE`  | current dir              | Root the agent operates in                 |
| `MAX_STEPS`  | `25`                     | Max tool iterations per turn               |
| `PORT`       | `8787`                   | Server port                                |

Conversations and memory are stored in SQLite at `~/.alphaai/alphaai.db`.

## Tools the agent can use

`bash` · `read_file` · `write_file` · `edit_file` · `list_dir` · `glob` ·
`web_fetch` · `web_search` · `remember` · `recall`

## Memory

- **History** — every message of every conversation is persisted and resumable.
- **Semantic memory** — the agent calls `remember` to store durable facts and
  `recall` to retrieve them; relevant memories are also auto-injected into each
  turn's context. Retrieval uses in-process cosine similarity over embeddings
  (no native vector extension required).
