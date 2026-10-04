import type { ToolDef } from "../types.js";
import { bashTool } from "./bash.js";
import { readFileTool, writeFileTool, editFileTool, listDirTool, globTool } from "./files.js";
import { webFetchTool, webSearchTool } from "./web.js";
import { rememberTool, recallTool } from "./memory.js";

export const tools: ToolDef[] = [
  bashTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirTool,
  globTool,
  webFetchTool,
  webSearchTool,
  rememberTool,
  recallTool,
];

export const toolMap = new Map<string, ToolDef>(tools.map((t) => [t.name, t]));

/** The tool schema array in the shape Ollama's /api/chat expects. */
export function toolSchemas() {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
