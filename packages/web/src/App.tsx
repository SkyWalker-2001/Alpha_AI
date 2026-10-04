import { useEffect, useRef, useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { Message } from "./components/Message";
import { Settings } from "./components/Settings";
import {
  fetchHealth,
  fetchConversations,
  createConversation,
  deleteConversation,
  fetchConversation,
  toChatMessages,
  wsUrl,
  uploadFile,
} from "./api";
import type { UploadedFile } from "./api";
import type { ChatMessage, Conversation, WsEvent } from "./types";

type ServerStatus = "checking" | "ok" | "ollama_down" | "server_down";

export function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [health, setHealth] = useState<{ model: string; workspace: string; autonomy: string; ok: boolean } | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkHealth = useCallback(async () => {
    setServerStatus("checking");
    try {
      const h = await fetchHealth();
      setHealth(h);
      setServerStatus(h.ok ? "ok" : "ollama_down");
    } catch {
      setHealth(null);
      setServerStatus("server_down");
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
    } catch {
      // server may be down; silently skip
    }
  }, []);

  useEffect(() => {
    checkHealth();
    refreshConversations();
  }, [checkHealth, refreshConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(uploadFile));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  }, []);

  const removeAttachment = useCallback((fileId: string) => {
    setAttachments((prev) => prev.filter((a) => a.fileId !== fileId));
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    const conv = await fetchConversation(id);
    setMessages(toChatMessages(conv.messages || []));
  }, []);

  const newChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
  }, []);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      if (id === activeId) newChat();
      refreshConversations();
    },
    [activeId, newChat, refreshConversations],
  );

  const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = fn(copy[i]);
          break;
        }
      }
      return copy;
    });

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !attachments.length) || busy) return;
    setInput("");
    const pendingAttachments = attachments;
    setAttachments([]);
    setBusy(true);

    let convId = activeId;
    if (!convId) {
      const conv = await createConversation();
      convId = conv.id;
      setActiveId(conv.id);
    }

    const userContent = pendingAttachments.length
      ? pendingAttachments
          .map((a) => (a.mimetype.startsWith("image/") ? `![${a.originalName}](${a.url})` : `📎 ${a.originalName}`))
          .join("  \n") + (text ? "\n\n" + text : "")
      : text;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userContent },
      { role: "assistant", content: "", tools: [] },
    ]);

    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;

    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          conversationId: convId,
          message: text,
          attachments: pendingAttachments.map(({ originalName, mimetype, path, url }) => ({
            originalName,
            mimetype,
            path,
            url,
          })),
        }),
      );

    ws.onmessage = (e) => {
      const ev = JSON.parse(e.data) as WsEvent;
      switch (ev.type) {
        case "conversation":
          if (!activeId) setActiveId(ev.conversationId);
          break;
        case "token":
          setStreaming(true);
          patchAssistant((m) => ({ ...m, content: m.content + ev.text }));
          break;
        case "tool_call":
          patchAssistant((m) => ({
            ...m,
            tools: [...(m.tools || []), { id: ev.id, name: ev.name, args: ev.args }],
          }));
          break;
        case "tool_result":
          patchAssistant((m) => ({
            ...m,
            tools: (m.tools || []).map((t) =>
              t.id === ev.id ? { ...t, result: ev.result, isError: ev.isError } : t,
            ),
          }));
          break;
        case "message":
          setStreaming(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && (last.content || (last.tools && last.tools.length))) {
              return [...prev, { role: "assistant", content: "", tools: [] }];
            }
            return prev;
          });
          break;
        case "error":
          patchAssistant((m) => ({ ...m, content: m.content + `\n\n⚠ ${ev.error}` }));
          break;
        case "turn_end":
          setStreaming(false);
          setBusy(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.content && !(last.tools && last.tools.length)) {
              return prev.slice(0, -1);
            }
            return prev;
          });
          ws.close();
          refreshConversations();
          break;
      }
    };

    ws.onerror = () => {
      patchAssistant((m) => ({
        ...m,
        content:
          m.content +
          "\n\n**Connection lost.** The backend server stopped responding. " +
          "Make sure `npm run server` is running, then refresh.",
      }));
      setBusy(false);
      setStreaming(false);
      setServerStatus("server_down");
    };
  }, [input, busy, activeId, attachments, refreshConversations]);

  const stop = () => {
    wsRef.current?.send(JSON.stringify({ type: "stop" }));
    wsRef.current?.close();
    setBusy(false);
    setStreaming(false);
  };

  // Derived state for UI
  const isDown = serverStatus === "server_down";
  const isOllamaDown = serverStatus === "ollama_down";
  const canSend = !busy && !isDown && !isOllamaDown && (!!input.trim() || attachments.length > 0);

  return (
    <div className="flex h-full">
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onSave={() => { checkHealth(); refreshConversations(); }}
        />
      )}

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={removeConversation}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-[#21262d] px-6 py-3 text-sm">
          <span className="font-medium">{health?.model ?? "AlphaAI"}</span>
          {health && (
            <>
              <span className="text-[#8b949e]">·</span>
              <span className="text-[#8b949e]">autonomy: {health.autonomy}</span>
              <span className="text-[#8b949e]">·</span>
              <span className="truncate text-[#8b949e]">{health.workspace}</span>
            </>
          )}

          <div className="ml-auto flex items-center gap-3">
            {/* Status chip */}
            {serverStatus === "checking" && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#21262d] px-2.5 py-1 text-xs text-[#8b949e]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8b949e]" />
                Connecting…
              </span>
            )}
            {serverStatus === "ok" && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#0f2a1a] px-2.5 py-1 text-xs text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Ready
              </span>
            )}
            {serverStatus === "ollama_down" && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#2d1a00] px-2.5 py-1 text-xs text-orange-400">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                Ollama offline
              </span>
            )}
            {serverStatus === "server_down" && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#2d0000] px-2.5 py-1 text-xs text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Server offline
              </span>
            )}

            {/* Settings gear */}
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="rounded-lg p-1.5 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Error banners */}
        {serverStatus === "server_down" && (
          <div className="border-b border-red-900/50 bg-red-950/40 px-6 py-3 text-sm">
            <p className="font-medium text-red-400">Backend server is not running</p>
            <p className="mt-0.5 text-xs text-red-400/70">
              Start it with <code className="rounded bg-red-900/40 px-1">npm run server</code> (or{" "}
              <code className="rounded bg-red-900/40 px-1">./run.sh server</code>), then{" "}
              <button onClick={checkHealth} className="underline hover:text-red-300">
                retry
              </button>
              . If using a remote server, update the URL in{" "}
              <button onClick={() => setShowSettings(true)} className="underline hover:text-red-300">
                Settings
              </button>
              .
            </p>
          </div>
        )}
        {serverStatus === "ollama_down" && (
          <div className="border-b border-orange-900/50 bg-orange-950/40 px-6 py-3 text-sm">
            <p className="font-medium text-orange-400">Ollama / Qwen is not reachable</p>
            <p className="mt-0.5 text-xs text-orange-400/70">
              Run <code className="rounded bg-orange-900/40 px-1">ollama serve</code> and make sure{" "}
              <code className="rounded bg-orange-900/40 px-1">qwen3-coder:30b</code> is pulled (
              <code className="rounded bg-orange-900/40 px-1">ollama pull qwen3-coder:30b</code>), then{" "}
              <button onClick={checkHealth} className="underline hover:text-orange-300">
                retry
              </button>
              .
            </p>
          </div>
        )}

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
            {messages.length === 0 && (
              <div className="mt-24 text-center text-[#8b949e]">
                <div className="mb-2 text-4xl">α</div>
                {serverStatus === "server_down" ? (
                  <>
                    <p className="text-lg text-red-400">Backend server offline</p>
                    <p className="mt-1 text-sm">
                      Start the server with{" "}
                      <code className="rounded bg-[#21262d] px-1.5 py-0.5">npm run server</code> to begin.
                    </p>
                  </>
                ) : serverStatus === "ollama_down" ? (
                  <>
                    <p className="text-lg text-orange-400">Ollama is not running</p>
                    <p className="mt-1 text-sm">
                      Run <code className="rounded bg-[#21262d] px-1.5 py-0.5">ollama serve</code> and pull{" "}
                      <code className="rounded bg-[#21262d] px-1.5 py-0.5">qwen3-coder:30b</code> to get started.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg text-[#c9d1d9]">What should AlphaAI do?</p>
                    <p className="mt-1 text-sm">
                      It can run shell commands, edit files, browse the web, and remember things.
                    </p>
                  </>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <Message key={i} msg={m} streaming={streaming && i === messages.length - 1 && m.role === "assistant"} />
            ))}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-[#21262d] px-6 py-4">
          <div className="mx-auto max-w-3xl">
            {/* Attachment badges */}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div
                    key={a.fileId}
                    className="flex items-center gap-1.5 rounded-lg border border-[#30363d] bg-[#161b22] px-3 py-1.5 text-xs text-[#c9d1d9]"
                  >
                    <span>
                      {a.mimetype.startsWith("image/") ? "🖼" : a.mimetype === "application/pdf" ? "📄" : "📎"}
                    </span>
                    <span className="max-w-[160px] truncate">{a.originalName}</span>
                    <button onClick={() => removeAttachment(a.fileId)} className="ml-1 text-[#8b949e] hover:text-[#e6edf3]">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css"
                className="hidden"
                onChange={handleFileSelect}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || uploading || isDown}
                title="Attach file"
                className="flex-shrink-0 rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-3 text-[#8b949e] hover:border-[#58a6ff] hover:text-[#58a6ff] disabled:opacity-40"
              >
                {uploading ? (
                  <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                )}
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={isDown || isOllamaDown}
                rows={1}
                placeholder={
                  isDown
                    ? "Backend server offline — start the server to chat"
                    : isOllamaDown
                    ? "Ollama is not running — run `ollama serve` to chat"
                    : "Message AlphaAI…  (Enter to send, Shift+Enter for newline)"
                }
                className="max-h-40 flex-1 resize-none rounded-xl border border-[#30363d] bg-[#0d1117] px-4 py-3 text-[#e6edf3] outline-none placeholder-[#484f58] focus:border-[#58a6ff] disabled:cursor-not-allowed disabled:opacity-50"
              />

              {busy ? (
                <button
                  onClick={stop}
                  className="rounded-xl bg-[#21262d] px-4 py-3 text-sm font-medium text-[#c9d1d9] hover:bg-[#30363d]"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={!canSend}
                  className="rounded-xl bg-[#1f6feb] px-4 py-3 text-sm font-medium text-white disabled:opacity-40"
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
