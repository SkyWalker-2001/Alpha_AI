import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ChatMessage } from "../types";
import { ToolCard } from "./ToolCard";

export function Message({ msg, streaming }: { msg: ChatMessage; streaming?: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-[#1f6feb] px-4 py-2.5 text-white">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-xs font-bold">
        α
      </div>
      <div className="min-w-0 flex-1">
        {msg.tools?.map((t) => (
          <ToolCard key={t.id} tool={t} />
        ))}
        {(msg.content || streaming) && (
          <div className="md leading-relaxed text-[#e6edf3]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {msg.content}
            </ReactMarkdown>
            {streaming && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-[#8b949e]" />}
          </div>
        )}
      </div>
    </div>
  );
}
