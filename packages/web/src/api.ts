import type { Conversation, ChatMessage } from "./types";

const STORAGE_KEY = "alphaai_server_base";

export function getServerBase(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setServerBase(url: string) {
  const trimmed = url.trim().replace(/\/$/, "");
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function api(path: string): string {
  return getServerBase() + path;
}

export async function fetchHealth() {
  const r = await fetch(api("/api/health"));
  return r.json() as Promise<{
    ok: boolean;
    model: string;
    models: string[];
    workspace: string;
    autonomy: string;
  }>;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const r = await fetch(api("/api/conversations"));
  return r.json();
}

export async function createConversation(): Promise<Conversation> {
  const r = await fetch(api("/api/conversations"), { method: "POST" });
  return r.json();
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(api(`/api/conversations/${id}`), { method: "DELETE" });
}

export async function fetchConversation(
  id: string,
): Promise<Conversation & { messages: RawMessage[] }> {
  const r = await fetch(api(`/api/conversations/${id}`));
  return r.json();
}

export interface RawMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: { function: { name: string; arguments: any } }[];
  tool_name?: string;
}

/** Rebuild renderable chat messages (with tool cards) from stored raw rows. */
export function toChatMessages(rows: RawMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      out.push({ role: "user", content: row.content });
    } else if (row.role === "assistant") {
      const tools =
        row.tool_calls?.map((tc, i) => ({
          id: `${out.length}-${i}`,
          name: tc.function.name,
          args: typeof tc.function.arguments === "string" ? {} : tc.function.arguments,
        })) || [];
      out.push({ role: "assistant", content: row.content, tools });
    } else if (row.role === "tool") {
      const last = out[out.length - 1];
      if (last?.role === "assistant" && last.tools) {
        const block = last.tools.find((t) => t.name === row.tool_name && t.result === undefined);
        if (block) block.result = row.content;
      }
    }
  }
  return out;
}

export interface UploadedFile {
  fileId: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  path: string;
}

export async function fetchConfig(): Promise<{ ollamaHost: string; model: string }> {
  const r = await fetch(api("/api/config"));
  return r.json();
}

export async function updateConfig(ollamaHost: string): Promise<{ ok: boolean; ollamaHost: string }> {
  const r = await fetch(api("/api/config"), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ollamaHost }),
  });
  return r.json();
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(api("/api/upload"), { method: "POST", body: form });
  if (!r.ok) throw new Error(`Upload failed: ${r.statusText}`);
  return r.json();
}

export function wsUrl(): string {
  const base = getServerBase();
  if (base) {
    const u = new URL(base);
    const proto = u.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${u.host}/ws`;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}
