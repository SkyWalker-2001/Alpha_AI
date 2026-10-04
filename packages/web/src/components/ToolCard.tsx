import { useState } from "react";
import type { ToolBlock } from "../types";

const ICONS: Record<string, string> = {
  bash: "▶",
  read_file: "📄",
  write_file: "✎",
  edit_file: "✎",
  list_dir: "📁",
  glob: "🔍",
  web_fetch: "🌐",
  web_search: "🔎",
  remember: "🧠",
  recall: "🧠",
};

export function ToolCard({ tool }: { tool: ToolBlock }) {
  const [open, setOpen] = useState(false);
  const summary =
    tool.args.command ||
    tool.args.path ||
    tool.args.pattern ||
    tool.args.url ||
    tool.args.query ||
    tool.args.text ||
    "";

  return (
    <div className="my-1.5 rounded-lg border border-[#30363d] bg-[#0d1117] text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#161b22]"
      >
        <span>{ICONS[tool.name] ?? "⚙"}</span>
        <span className="font-mono text-[#79c0ff]">{tool.name}</span>
        <span className="truncate font-mono text-xs text-[#8b949e]">{String(summary)}</span>
        <span className="ml-auto text-xs text-[#8b949e]">
          {tool.result === undefined ? (
            <span className="text-yellow-400">running…</span>
          ) : tool.isError ? (
            <span className="text-red-400">error</span>
          ) : (
            <span className="text-green-400">done</span>
          )}
          <span className="ml-2">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-[#30363d] px-3 py-2">
          <pre className="mb-2 overflow-x-auto whitespace-pre-wrap text-xs text-[#8b949e]">
            {JSON.stringify(tool.args, null, 2)}
          </pre>
          {tool.result !== undefined && (
            <pre
              className={`max-h-72 overflow-auto whitespace-pre-wrap text-xs ${
                tool.isError ? "text-red-400" : "text-[#c9d1d9]"
              }`}
            >
              {tool.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
