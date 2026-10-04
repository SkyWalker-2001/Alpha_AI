import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { ToolDef, ToolContext } from "../types.js";

function resolveIn(ctx: ToolContext, p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(ctx.workspace, p);
}

const MAX_READ = 100_000;

export const readFileTool: ToolDef = {
  name: "read_file",
  description: "Read a UTF-8 text file and return its contents. Paths are relative to the workspace unless absolute.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "File path to read." } },
    required: ["path"],
  },
  async run(args, ctx) {
    try {
      const full = resolveIn(ctx, String(args.path));
      const data = await fs.readFile(full, "utf8");
      const body = data.length > MAX_READ ? data.slice(0, MAX_READ) + "\n...[truncated]" : data;
      return { content: body };
    } catch (e) {
      return { content: `read_file error: ${String(e)}`, isError: true };
    }
  },
};

export const writeFileTool: ToolDef = {
  name: "write_file",
  description:
    "Write (create or overwrite) a UTF-8 text file with the given content. Creates parent directories as needed.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to write." },
      content: { type: "string", description: "Full content to write to the file." },
    },
    required: ["path", "content"],
  },
  async run(args, ctx) {
    try {
      const full = resolveIn(ctx, String(args.path));
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, String(args.content ?? ""), "utf8");
      return { content: `Wrote ${Buffer.byteLength(String(args.content ?? ""))} bytes to ${full}` };
    } catch (e) {
      return { content: `write_file error: ${String(e)}`, isError: true };
    }
  },
};

export const editFileTool: ToolDef = {
  name: "edit_file",
  description:
    "Edit a file by replacing an exact string with a new string. The old_string must appear EXACTLY ONCE in the file, or the edit is rejected. Use for surgical changes without rewriting the whole file.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to edit." },
      old_string: { type: "string", description: "Exact text to find (must be unique in the file)." },
      new_string: { type: "string", description: "Text to replace it with." },
    },
    required: ["path", "old_string", "new_string"],
  },
  async run(args, ctx) {
    try {
      const full = resolveIn(ctx, String(args.path));
      const data = await fs.readFile(full, "utf8");
      const oldStr = String(args.old_string);
      const count = data.split(oldStr).length - 1;
      if (count === 0) return { content: `edit_file error: old_string not found in ${full}`, isError: true };
      if (count > 1)
        return {
          content: `edit_file error: old_string appears ${count} times; make it unique.`,
          isError: true,
        };
      const updated = data.replace(oldStr, String(args.new_string));
      await fs.writeFile(full, updated, "utf8");
      return { content: `Edited ${full}` };
    } catch (e) {
      return { content: `edit_file error: ${String(e)}`, isError: true };
    }
  },
};

export const listDirTool: ToolDef = {
  name: "list_dir",
  description: "List the entries of a directory (files and subdirectories). Path defaults to the workspace root.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Directory to list. Defaults to workspace root." } },
  },
  async run(args, ctx) {
    try {
      const full = resolveIn(ctx, String(args.path ?? "."));
      const entries = await fs.readdir(full, { withFileTypes: true });
      const lines = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
      return { content: lines.length ? lines.join("\n") : "(empty directory)" };
    } catch (e) {
      return { content: `list_dir error: ${String(e)}`, isError: true };
    }
  },
};

export const globTool: ToolDef = {
  name: "glob",
  description:
    "Find files matching a glob pattern (e.g. '**/*.ts', 'src/**/*.{js,jsx}'). Returns matching paths relative to the workspace.",
  parameters: {
    type: "object",
    properties: { pattern: { type: "string", description: "Glob pattern to match." } },
    required: ["pattern"],
  },
  async run(args, ctx) {
    try {
      const matches = await fg(String(args.pattern), {
        cwd: ctx.workspace,
        dot: false,
        ignore: ["**/node_modules/**", "**/.git/**"],
        onlyFiles: true,
      });
      return { content: matches.length ? matches.slice(0, 500).join("\n") : "(no matches)" };
    } catch (e) {
      return { content: `glob error: ${String(e)}`, isError: true };
    }
  },
};
