#!/usr/bin/env bash
# AlphaAI — single entry point for all project commands
set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

usage() {
  cat <<EOF
Usage: ./run.sh <command>

Setup
  install       npm install (all workspaces)
  doctor        verify Ollama + models are reachable

Run
  cli           start the terminal CLI (Ink UI)
  server        start the Fastify + WebSocket server on :8787
  web           start the Vite dev server on :5173
  dev           start server + web together (recommended for dev)

Build / Type-check
  build         typecheck + build the web UI (production)
  typecheck     run tsc across core, server, cli
  preview       preview the production web build on :4173

Models (Ollama)
  pull-models   pull qwen3-coder:30b and nomic-embed-text

Help
  help          show this message
EOF
}

case "${1:-help}" in

  install)
    npm install
    ;;

  doctor)
    node --import tsx packages/core/src/doctor.ts
    ;;

  cli)
    npm run cli
    ;;

  server)
    npm run server
    ;;

  web)
    npm run web
    ;;

  dev)
    npm run dev
    ;;

  build)
    npm run build
    ;;

  typecheck)
    npm run typecheck
    ;;

  preview)
    npm run preview -w @alphaai/web
    ;;

  pull-models)
    echo "Pulling qwen3-coder:30b ..."
    ollama pull qwen3-coder:30b
    echo "Pulling nomic-embed-text ..."
    ollama pull nomic-embed-text
    echo "Done."
    ;;

  help|--help|-h)
    usage
    ;;

  *)
    echo "Unknown command: $1"
    usage
    exit 1
    ;;
esac
