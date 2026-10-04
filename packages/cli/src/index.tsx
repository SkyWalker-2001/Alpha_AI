#!/usr/bin/env -S npx tsx
import "dotenv/config";
import React from "react";
import { render } from "ink";
import { ping } from "@alphaai/core";
import { App } from "./app.js";

async function main() {
  if (!(await ping())) {
    console.error(
      "AlphaAI: cannot reach Ollama. Start it with `ollama serve` (or set OLLAMA_HOST), then retry.",
    );
    process.exit(1);
  }
  render(<App />);
}

main();
