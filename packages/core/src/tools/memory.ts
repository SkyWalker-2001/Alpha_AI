import type { ToolDef } from "../types.js";
import { remember, recall } from "../memory/vector.js";

export const rememberTool: ToolDef = {
  name: "remember",
  description:
    "Save a durable fact to your persistent long-term memory so you can recall it in future sessions. Use for user preferences, personal details, project facts, decisions, or anything worth retaining. Store one clear, self-contained fact per call.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "The fact to remember, phrased as a standalone statement." },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional tags to categorize the memory.",
      },
    },
    required: ["text"],
  },
  async run(args) {
    try {
      const tags = Array.isArray(args.tags) ? args.tags.map(String) : [];
      await remember(String(args.text), tags);
      return { content: `Remembered: "${String(args.text)}"` };
    } catch (e) {
      return { content: `remember error: ${String(e)}`, isError: true };
    }
  },
};

export const recallTool: ToolDef = {
  name: "recall",
  description:
    "Search your persistent long-term memory for facts relevant to a query, ranked by semantic similarity. Use when a task may depend on something you were told in a past session.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look for in memory." },
      k: { type: "number", description: "Max number of memories to return (default 5)." },
    },
    required: ["query"],
  },
  async run(args) {
    try {
      const hits = await recall(String(args.query), Number(args.k ?? 5));
      if (hits.length === 0) return { content: "No relevant memories found." };
      return {
        content: hits.map((h) => `(${h.score.toFixed(2)}) ${h.text}`).join("\n"),
      };
    } catch (e) {
      return { content: `recall error: ${String(e)}`, isError: true };
    }
  },
};
