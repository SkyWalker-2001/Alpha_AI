import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import type { Message } from "../types.js";

export interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export function createConversation(title = "New chat"): string {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(`INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run(id, title, now, now);
  return id;
}

export function listConversations(): ConversationRow[] {
  return getDb()
    .prepare(`SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC`)
    .all() as ConversationRow[];
}

export function getConversation(id: string): ConversationRow | undefined {
  return getDb().prepare(`SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?`).get(id) as
    | ConversationRow
    | undefined;
}

export function setTitle(id: string, title: string): void {
  getDb().prepare(`UPDATE conversations SET title = ? WHERE id = ?`).run(title, id);
}

export function deleteConversation(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM messages WHERE conversation_id = ?`).run(id);
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

export function getMessages(conversationId: string): Message[] {
  const rows = getDb()
    .prepare(
      `SELECT role, content, tool_calls, tool_name FROM messages WHERE conversation_id = ? ORDER BY id ASC`,
    )
    .all(conversationId) as any[];
  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    tool_calls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
    tool_name: r.tool_name || undefined,
  }));
}

export function addMessage(conversationId: string, m: Message): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, tool_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    conversationId,
    m.role,
    m.content,
    m.tool_calls ? JSON.stringify(m.tool_calls) : null,
    m.tool_name || null,
    Date.now(),
  );
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(Date.now(), conversationId);
}
