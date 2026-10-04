import { randomUUID } from "node:crypto";
import { getConfig } from "./config.js";
import { chatStream } from "./ollama.js";
import { systemPrompt, titleFrom } from "./prompt.js";
import { toolSchemas, toolMap } from "./tools/index.js";
import { addMessage, getMessages, getConversation, setTitle } from "./memory/history.js";
import { recall } from "./memory/vector.js";
import type { AgentEvent, Message, ToolContext } from "./types.js";

/** Convert a stored Message into the shape Ollama's /api/chat expects. */
function toOllama(m: Message): any {
  if (m.role === "assistant" && m.tool_calls?.length) {
    return { role: "assistant", content: m.content, tool_calls: m.tool_calls };
  }
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_name: m.tool_name };
  }
  return { role: m.role, content: m.content };
}

function parseArgs(raw: Record<string, any> | string): Record<string, any> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw || {};
}

export interface RunAgentOptions {
  conversationId: string;
  userMessage: string;
  signal?: AbortSignal;
}

/**
 * The agentic loop. Persists the user message, auto-recalls relevant memories,
 * then repeatedly: streams the model, executes any tool calls, feeds results
 * back — until the model answers with no tool calls or maxSteps is reached.
 *
 * Yields a unified event stream consumed identically by the CLI and the server.
 */
export async function* runAgent(opts: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const cfg = getConfig();
  const { conversationId, userMessage, signal } = opts;

  // Auto-title the conversation from its first user message.
  const existing = getMessages(conversationId);
  if (existing.length === 0) {
    const conv = getConversation(conversationId);
    if (conv && (conv.title === "New chat" || !conv.title)) {
      setTitle(conversationId, titleFrom(userMessage));
    }
  }

  addMessage(conversationId, { role: "user", content: userMessage });

  const ctx: ToolContext = { workspace: cfg.workspace };

  let recalled: Awaited<ReturnType<typeof recall>> = [];
  try {
    recalled = await recall(userMessage, 5);
  } catch {
    // Memory recall is best-effort; embedding model may be unavailable.
  }

  const history = getMessages(conversationId);
  const messages: any[] = [
    { role: "system", content: systemPrompt(cfg, recalled) },
    ...history.map(toOllama),
  ];

  try {
    for (let step = 0; step < cfg.maxSteps; step++) {
      if (signal?.aborted) return;
      yield { type: "step", step };

      // Stream the assistant turn.
      const stream = chatStream({ messages, tools: toolSchemas(), signal });
      let sr = await stream.next();
      while (!sr.done) {
        yield { type: "token", text: sr.value };
        sr = await stream.next();
      }
      const result = sr.value;

      const assistantMsg: Message = {
        role: "assistant",
        content: result.content,
        tool_calls: result.tool_calls as Message["tool_calls"],
      };
      addMessage(conversationId, assistantMsg);
      messages.push(toOllama(assistantMsg));
      yield { type: "message", message: assistantMsg };

      // No tool calls -> the model has answered. Done.
      if (!result.tool_calls || result.tool_calls.length === 0) {
        yield { type: "done", message: assistantMsg };
        return;
      }

      // Execute each requested tool call and append the results.
      for (const call of result.tool_calls) {
        const name = call.function.name;
        const args = parseArgs(call.function.arguments);
        const id = randomUUID();
        yield { type: "tool_call", id, name, args };

        const tool = toolMap.get(name);
        let output: string;
        let isError = false;
        if (!tool) {
          output = `Unknown tool: ${name}`;
          isError = true;
        } else {
          try {
            const r = await tool.run(args, ctx);
            output = r.content;
            isError = !!r.isError;
          } catch (e) {
            output = `Tool threw: ${String(e)}`;
            isError = true;
          }
        }

        const toolMsg: Message = { role: "tool", content: output, tool_name: name };
        addMessage(conversationId, toolMsg);
        messages.push(toOllama(toolMsg));
        yield { type: "tool_result", id, name, result: output, isError };
      }
      // Loop: feed tool results back to the model for the next step.
    }

    // Hit the step ceiling without a final answer.
    const capped: Message = {
      role: "assistant",
      content: `[Reached the ${cfg.maxSteps}-step limit for this turn. Ask me to continue if the task isn't finished.]`,
    };
    addMessage(conversationId, capped);
    yield { type: "message", message: capped };
    yield { type: "done", message: capped };
  } catch (e) {
    yield { type: "error", error: String(e) };
  }
}
