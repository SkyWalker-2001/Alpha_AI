import { getDb } from "./db.js";
import { embed } from "../ollama.js";

export interface RecallHit {
  id: number;
  text: string;
  tags: string[];
  score: number;
}

function toBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

function fromBlob(buf: Buffer): Float32Array {
  // Copy to guarantee correct alignment/length regardless of the source buffer.
  return new Float32Array(new Uint8Array(buf).buffer);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/** Store a fact in long-term semantic memory. */
export async function remember(text: string, tags: string[] = []): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const vec = await embed(clean);
  getDb()
    .prepare(`INSERT INTO memories (text, tags, embedding, created_at) VALUES (?, ?, ?, ?)`)
    .run(clean, tags.join(","), toBlob(vec), Date.now());
}

/**
 * Retrieve the top-k most semantically similar memories to `query`.
 * Uses in-process cosine similarity over stored Float32 embeddings — no native
 * vector extension required, plenty fast for a personal memory store.
 */
export async function recall(query: string, k = 5): Promise<RecallHit[]> {
  const rows = getDb().prepare(`SELECT id, text, tags, embedding FROM memories`).all() as any[];
  if (rows.length === 0) return [];
  const q = new Float32Array(await embed(query));
  const scored: RecallHit[] = rows.map((r) => ({
    id: r.id,
    text: r.text,
    tags: r.tags ? String(r.tags).split(",").filter(Boolean) : [],
    score: cosine(q, fromBlob(r.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export function countMemories(): number {
  const row = getDb().prepare(`SELECT COUNT(*) as c FROM memories`).get() as { c: number };
  return row.c;
}
