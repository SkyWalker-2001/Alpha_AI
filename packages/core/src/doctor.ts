import "dotenv/config";
import { getConfig } from "./config.js";
import { ping, listModels, embed } from "./ollama.js";

/** Preflight check: verifies Ollama, the chat model, and the embedding model. */
async function main() {
  const cfg = getConfig();
  console.log("AlphaAI doctor\n");
  console.log(`  Ollama host : ${cfg.host}`);
  console.log(`  Chat model  : ${cfg.model}`);
  console.log(`  Embed model : ${cfg.embedModel}`);
  console.log(`  Workspace   : ${cfg.workspace}`);
  console.log(`  Data dir    : ${cfg.dataDir}`);
  console.log(`  Autonomy    : ${cfg.autonomy}\n`);

  let ok = true;

  if (!(await ping())) {
    console.error("  ✗ Ollama is not reachable. Is it running? (try: ollama serve)");
    process.exit(1);
  }
  console.log("  ✓ Ollama is reachable");

  const models = await listModels();
  const names = models.map((m) => m.name);
  const chat = models.find((m) => m.name === cfg.model);
  if (!chat) {
    console.error(`  ✗ Chat model "${cfg.model}" not found. Installed: ${names.join(", ") || "(none)"}`);
    ok = false;
  } else if (chat.capabilities && !chat.capabilities.includes("tools")) {
    console.warn(`  ⚠ Model "${cfg.model}" may not support tools; agentic actions could fail.`);
  } else {
    console.log(`  ✓ Chat model "${cfg.model}" is installed`);
  }

  try {
    const v = await embed("hello");
    console.log(`  ✓ Embedding model works (dim ${v.length})`);
  } catch (e) {
    console.error(`  ✗ Embedding model "${cfg.embedModel}" failed: ${String(e)}`);
    console.error(`    Fix with: ollama pull ${cfg.embedModel}`);
    ok = false;
  }

  console.log(ok ? "\nAll systems go." : "\nSome checks failed — see above.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
