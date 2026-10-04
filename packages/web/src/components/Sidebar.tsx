import type { Conversation } from "../types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function Sidebar({ conversations, activeId, onSelect, onNew, onDelete }: Props) {
  return (
    <aside className="flex w-64 flex-none flex-col border-r border-[#21262d] bg-[#0b0f14]">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 text-sm font-bold">
          α
        </div>
        <span className="font-semibold tracking-tight">AlphaAI</span>
      </div>

      <button
        onClick={onNew}
        className="mx-3 mb-2 rounded-lg border border-[#30363d] px-3 py-2 text-sm text-[#c9d1d9] hover:bg-[#161b22]"
      >
        + New chat
      </button>

      <div className="flex-1 overflow-y-auto px-2">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group mb-0.5 flex items-center rounded-lg px-2 ${
              c.id === activeId ? "bg-[#161b22]" : "hover:bg-[#12161c]"
            }`}
          >
            <button
              onClick={() => onSelect(c.id)}
              className="min-w-0 flex-1 truncate py-2 text-left text-sm text-[#c9d1d9]"
              title={c.title}
            >
              {c.title || "New chat"}
            </button>
            <button
              onClick={() => onDelete(c.id)}
              className="ml-1 hidden px-1 text-xs text-[#8b949e] hover:text-red-400 group-hover:block"
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
