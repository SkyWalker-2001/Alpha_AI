import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
// Load .env from repo root (3 levels up from packages/server/src/)
import { config as dotenvConfig } from "dotenv";
const __rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
dotenvConfig({ path: path.join(__rootDir, ".env") });
import os from "node:os";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import {
  runAgent,
  createConversation,
  listConversations,
  getConversation,
  getMessages,
  deleteConversation,
  getConfig,
  resetConfig,
  ping,
  listModels,
} from "@alphaai/core";

const cfg = getConfig();
const app = Fastify({ logger: false });

const UPLOADS_DIR = path.join(os.tmpdir(), "alphaai-uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

await app.register(cors, { origin: true });
await app.register(websocket);
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

// --- REST API -------------------------------------------------------------

app.get("/api/health", async () => {
  const alive = await ping();
  let models: string[] = [];
  try {
    models = (await listModels()).map((m) => m.name);
  } catch {
    /* ignore */
  }
  return { ok: alive, model: cfg.model, models, workspace: cfg.workspace, autonomy: cfg.autonomy };
});

app.get("/api/conversations", async () => listConversations());

app.post("/api/conversations", async () => {
  const id = createConversation();
  return getConversation(id);
});

app.get("/api/conversations/:id", async (req) => {
  const { id } = req.params as { id: string };
  const conv = getConversation(id);
  if (!conv) return { error: "not found" };
  return { ...conv, messages: getMessages(id) };
});

app.delete("/api/conversations/:id", async (req) => {
  const { id } = req.params as { id: string };
  deleteConversation(id);
  return { ok: true };
});

// --- Config read / update -------------------------------------------------

app.get("/api/config", async () => {
  const c = getConfig();
  return { ollamaHost: c.host, model: c.model };
});

app.patch("/api/config", async (req, reply) => {
  const body = req.body as { ollamaHost?: string };
  if (!body?.ollamaHost) return reply.code(400).send({ error: "ollamaHost required" });
  const newHost = body.ollamaHost.trim().replace(/\/$/, "");
  process.env.OLLAMA_HOST = newHost;
  resetConfig();
  const alive = await ping();
  return { ok: alive, ollamaHost: newHost };
});

// --- File upload endpoint -------------------------------------------------

app.post("/api/upload", async (req, reply) => {
  const data = await req.file();
  if (!data) return reply.code(400).send({ error: "no file" });

  const ext = path.extname(data.filename) || "";
  const fileId = randomUUID() + ext;
  const filePath = path.join(UPLOADS_DIR, fileId);

  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    data.file.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });

  return {
    fileId,
    originalName: data.filename,
    mimetype: data.mimetype,
    size: fs.statSync(filePath).size,
    url: `/api/uploads/${fileId}`,
    path: filePath,
  };
});

app.get("/api/uploads/:fileId", (req, reply) => {
  const { fileId } = req.params as { fileId: string };
  if (!/^[\w.-]+$/.test(fileId)) return reply.code(400).send({ error: "invalid" });
  const filePath = path.join(UPLOADS_DIR, fileId);
  if (!fs.existsSync(filePath)) return reply.code(404).send({ error: "not found" });
  return reply.send(fs.createReadStream(filePath));
});

// --- WebSocket: stream the agent event stream to the browser --------------

app.register(async (instance) => {
  instance.get("/ws", { websocket: true }, (socket) => {
    let ac: AbortController | null = null;

    socket.on("message", async (raw) => {
      let payload: {
        conversationId?: string;
        message?: string;
        type?: string;
        attachments?: Array<{ originalName: string; mimetype: string; path: string; url: string }>;
      };
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (payload.type === "stop") {
        ac?.abort();
        return;
      }

      const message = (payload.message || "").trim();
      if (!message && !payload.attachments?.length) return;

      // Prepend attached-file context so the agent can reference/read them.
      const attachmentContext =
        payload.attachments?.length
          ? `[Attached files:\n${payload.attachments.map((a) => `  - ${a.originalName} (${a.mimetype}) → ${a.path}`).join("\n")}\n]\n\n`
          : "";
      const fullMessage = attachmentContext + message;

      const conversationId = payload.conversationId || createConversation();
      ac = new AbortController();

      const send = (obj: unknown) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
      };

      send({ type: "conversation", conversationId });

      try {
        for await (const ev of runAgent({ conversationId, userMessage: fullMessage, signal: ac.signal })) {
          send(ev);
        }
      } catch (e) {
        send({ type: "error", error: String(e) });
      }
      send({ type: "turn_end" });
    });

    socket.on("close", () => ac?.abort());
  });
});

// --- Serve the built web UI if present (production) ------------------------

const webDist = path.resolve(__rootDir, "packages/web/dist");
if (fs.existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api") || req.raw.url?.startsWith("/ws")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.sendFile("index.html");
  });
}

// --- Boot -----------------------------------------------------------------

const alive = await ping();
console.log(`AlphaAI server`);
console.log(`  Ollama : ${cfg.host} ${alive ? "✓ reachable" : "✗ UNREACHABLE (start `ollama serve`)"}`);
console.log(`  Model  : ${cfg.model}`);
console.log(`  Autonomy: ${cfg.autonomy}   Workspace: ${cfg.workspace}`);

app.listen({ port: cfg.port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`  Listening on ${address}`);
  if (!fs.existsSync(webDist)) {
    console.log(`  (dev) Run the web UI separately with: npm run web`);
  }
});
