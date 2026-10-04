import { getConfig } from "./config.js";

export interface ChatResult {
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, any> | string } }[];
}

export interface ChatStreamOptions {
  model?: string;
  messages: any[];
  tools?: any[];
  signal?: AbortSignal;
  temperature?: number;
}

/**
 * Streams a chat completion from Ollama. Yields content-token deltas as they
 * arrive and RETURNS the final { content, tool_calls } once the stream ends.
 *
 *   const s = chatStream({ messages, tools });
 *   let r = await s.next();
 *   while (!r.done) { render(r.value); r = await s.next(); }
 *   const result = r.value; // ChatResult
 */
export async function* chatStream(
  opts: ChatStreamOptions,
): AsyncGenerator<string, ChatResult, unknown> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      model: opts.model || cfg.model,
      messages: opts.messages,
      tools: opts.tools,
      stream: true,
      options: { temperature: opts.temperature ?? 0.4 },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama /api/chat failed (${res.status}): ${detail}`);
  }

  let content = "";
  let toolCalls: ChatResult["tool_calls"];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let json: any;
      try {
        json = JSON.parse(line);
      } catch {
        continue; // ignore partial/garbled lines
      }

      if (json.error) throw new Error(String(json.error));

      const msg = json.message;
      if (msg) {
        if (msg.content) {
          content += msg.content;
          yield msg.content as string;
        }
        if (msg.tool_calls && msg.tool_calls.length) {
          // Ollama typically sends the full tool_calls array in one chunk.
          toolCalls = msg.tool_calls;
        }
      }
    }
  }

  return { content, tool_calls: toolCalls };
}

/** Non-streaming convenience wrapper. */
export async function chat(opts: ChatStreamOptions): Promise<ChatResult> {
  const s = chatStream(opts);
  let r = await s.next();
  while (!r.done) r = await s.next();
  return r.value;
}

/** Returns an embedding vector for the given text using EMBED_MODEL. */
export async function embed(text: string): Promise<number[]> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.host}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.embedModel, prompt: text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama /api/embeddings failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { embedding: number[] };
  return json.embedding;
}

export interface OllamaModel {
  name: string;
  capabilities?: string[];
}

/** Lists installed models. Throws if Ollama is unreachable. */
export async function listModels(): Promise<OllamaModel[]> {
  const cfg = getConfig();
  const res = await fetch(`${cfg.host}/api/tags`);
  if (!res.ok) throw new Error(`Ollama /api/tags failed (${res.status})`);
  const json = (await res.json()) as { models: OllamaModel[] };
  return json.models || [];
}

/** True if Ollama responds at all. */
export async function ping(): Promise<boolean> {
  try {
    const cfg = getConfig();
    const res = await fetch(`${cfg.host}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}
