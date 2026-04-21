import { spawn } from "node:child_process";

import type { CodexCommandResult, CodexCommandRunner } from "./types.js";

export const runCodexCommand: CodexCommandRunner = async (
  command,
  args,
): Promise<CodexCommandResult> => {
  const child = spawn(command, args, {
    shell: requiresShell(command),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
  });

  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve(code);
    });
  });

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
};

export function requiresShell(
  command: string,
  platform = process.platform,
): boolean {
  return platform === "win32" && /\.(cmd|bat)$/i.test(command);
}
