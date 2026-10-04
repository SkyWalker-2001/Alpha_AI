export type Role = "system" | "user" | "assistant" | "tool";

export interface OllamaToolCall {
  id?: string;
  function: {
    name: string;
    /** Ollama returns this already parsed as an object, but may be a JSON string. */
    arguments: Record<string, any> | string;
  };
}

export interface Message {
  role: Role;
  content: string;
  /** Present on assistant messages that request tool execution. */
  tool_calls?: OllamaToolCall[];
  /** Present on tool-result messages, for display + Ollama routing. */
  tool_name?: string;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface ToolContext {
  /** Root directory the agent operates in. Relative paths resolve against this. */
  workspace: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the parameters, passed verbatim to Ollama. */
  parameters: Record<string, any>;
  run: (args: Record<string, any>, ctx: ToolContext) => Promise<ToolResult>;
}

/** Events emitted by the agentic loop; rendered identically by CLI and web. */
export type AgentEvent =
  | { type: "step"; step: number }
  | { type: "token"; text: string }
  | { type: "message"; message: Message }
  | { type: "tool_call"; id: string; name: string; args: Record<string, any> }
  | { type: "tool_result"; id: string; name: string; result: string; isError: boolean }
  | { type: "done"; message: Message }
  | { type: "error"; error: string };
