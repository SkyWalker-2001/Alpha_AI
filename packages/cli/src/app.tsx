import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import {
  runAgent,
  createConversation,
  listConversations,
  getConfig,
  type AgentEvent,
} from "@alphaai/core";

type Block =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; args: string; result?: string; isError?: boolean };

const cfg = getConfig();

export function App() {
  const { exit } = useApp();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [convId, setConvId] = useState<string>(() => createConversation());

  useInput((_, key) => {
    if (key.escape && !busy) exit();
  });

  const push = (b: Block) => setBlocks((prev) => [...prev, b]);
  const patchLast = (fn: (b: Block) => Block) =>
    setBlocks((prev) => prev.map((b, i) => (i === prev.length - 1 ? fn(b) : b)));

  const handleCommand = useCallback(
    (cmd: string): boolean => {
      const [name, ...rest] = cmd.slice(1).trim().split(/\s+/);
      switch (name) {
        case "exit":
        case "quit":
          exit();
          return true;
        case "new":
          setConvId(createConversation());
          setBlocks([]);
          setStatus("Started a new conversation.");
          return true;
        case "history": {
          const rows = listConversations().slice(0, 10);
          setBlocks([]);
          push({
            kind: "assistant",
            text:
              "Recent conversations:\n" +
              rows.map((r) => `  • ${r.title} (${r.id.slice(0, 8)})`).join("\n"),
          });
          return true;
        }
        case "help":
          push({
            kind: "assistant",
            text: "Commands: /new  /history  /help  /exit  — or just type to chat. Esc to quit.",
          });
          return true;
        default:
          setStatus(`Unknown command: /${name}`);
          return true;
      }
    },
    [exit],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setInput("");
      if (trimmed.startsWith("/")) {
        handleCommand(trimmed);
        return;
      }

      push({ kind: "user", text: trimmed });
      setBusy(true);
      setStatus("thinking");

      let streaming = false;
      try {
        for await (const ev of runAgent({ conversationId: convId, userMessage: trimmed })) {
          const e = ev as AgentEvent;
          switch (e.type) {
            case "token":
              if (!streaming) {
                streaming = true;
                push({ kind: "assistant", text: "" });
              }
              patchLast((b) => (b.kind === "assistant" ? { ...b, text: b.text + e.text } : b));
              break;
            case "message":
              streaming = false;
              break;
            case "tool_call":
              setStatus(`running ${e.name}`);
              push({
                kind: "tool",
                name: e.name,
                args: JSON.stringify(e.args),
              });
              break;
            case "tool_result":
              patchLast((b) =>
                b.kind === "tool"
                  ? { ...b, result: e.result.slice(0, 600), isError: e.isError }
                  : b,
              );
              setStatus("thinking");
              break;
            case "error":
              push({ kind: "assistant", text: `⚠ Error: ${e.error}` });
              break;
          }
        }
      } catch (err) {
        push({ kind: "assistant", text: `⚠ ${String(err)}` });
      } finally {
        setBusy(false);
        setStatus("");
      }
    },
    [convId, handleCommand],
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="magenta" bold>
          ◆ AlphaAI
        </Text>
        <Text dimColor> — {cfg.model} · autonomy: {cfg.autonomy} · {cfg.workspace}</Text>
      </Box>

      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}

      <Box marginTop={1}>
        {busy ? (
          <Text color="yellow">
            <Spinner type="dots" /> {status}
          </Text>
        ) : (
          <Box>
            <Text color="cyan">› </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={send}
              placeholder="Ask AlphaAI to do something…  (/help, Esc to quit)"
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.kind === "user") {
    return (
      <Box marginTop={1}>
        <Text color="cyan" bold>
          You:{" "}
        </Text>
        <Text>{block.text}</Text>
      </Box>
    );
  }
  if (block.kind === "assistant") {
    return (
      <Box marginTop={1} flexDirection="column">
        <Text color="magenta" bold>
          AlphaAI:
        </Text>
        <Text>{block.text}</Text>
      </Box>
    );
  }
  // tool
  return (
    <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="yellow">
        ⚙ {block.name} <Text dimColor>{block.args}</Text>
      </Text>
      {block.result !== undefined && (
        <Text color={block.isError ? "red" : "green"} dimColor>
          {block.result}
          {block.result.length >= 600 ? " …" : ""}
        </Text>
      )}
    </Box>
  );
}
