export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface ToolBlock {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: string;
  isError?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: ToolBlock[];
}

/** Events streamed from the server over WebSocket (mirror of core AgentEvent). */
export type WsEvent =
  | { type: "conversation"; conversationId: string }
  | { type: "step"; step: number }
  | { type: "token"; text: string }
  | { type: "message"; message: { role: string; content: string } }
  | { type: "tool_call"; id: string; name: string; args: Record<string, any> }
  | { type: "tool_result"; id: string; name: string; result: string; isError: boolean }
  | { type: "done"; message: unknown }
  | { type: "error"; error: string }
  | { type: "turn_end" };
