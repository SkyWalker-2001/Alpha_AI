import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface Config {
  host: string;
  model: string;
  embedModel: string;
  autonomy: "full" | "approve";
  workspace: string;
  dataDir: string;
  maxSteps: number;
  port: number;
}

let cached: Config | null = null;

export function resetConfig() {
  cached = null;
}

export function getConfig(): Config {
  if (cached) return cached;
  const dataDir = process.env.ALPHAAI_DATA || path.join(os.homedir(), ".alphaai");
  fs.mkdirSync(dataDir, { recursive: true });
  cached = {
    host: (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, ""),
    model: process.env.MODEL || "qwen3-coder:30b",
    embedModel: process.env.EMBED_MODEL || "nomic-embed-text",
    autonomy: (process.env.AUTONOMY as Config["autonomy"]) || "full",
    workspace: process.env.WORKSPACE || process.cwd(),
    dataDir,
    maxSteps: Number(process.env.MAX_STEPS || 25),
    port: Number(process.env.PORT || 8787),
  };
  return cached;
}
