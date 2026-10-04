import { spawn } from "node:child_process";
import type { ToolDef } from "../types.js";

const MAX_OUTPUT = 30_000;

export const bashTool: ToolDef = {
  name: "bash",
  description:
    "Run a shell command on the user's machine and return combined stdout+stderr and the exit code. This is your most powerful tool — use it to run programs, git, package managers, build tools, move/rename/delete files, inspect the system, etc. The command runs via `bash -lc` in the workspace directory.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute." },
      timeout_ms: {
        type: "number",
        description: "Optional timeout in milliseconds. Default 120000 (2 minutes).",
      },
    },
    required: ["command"],
  },
  run(args, ctx) {
    const command = String(args.command ?? "");
    const timeout = Number(args.timeout_ms ?? 120_000);
    return new Promise((resolve) => {
      const child = spawn("bash", ["-lc", command], { cwd: ctx.workspace });
      let out = "";
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, timeout);

      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (out += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ content: `Failed to start command: ${String(e)}`, isError: true });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const body =
          out.length > MAX_OUTPUT ? out.slice(0, MAX_OUTPUT) + "\n...[output truncated]" : out;
        const header = killed ? `[timed out after ${timeout}ms] ` : "";
        resolve({
          content: `${header}exit code: ${code}\n${body || "(no output)"}`,
          isError: killed || code !== 0,
        });
      });
    });
  },
};
