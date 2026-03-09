import type { CodexCommandResult, CodexCommandRunner } from "./types";

export const runCodexCommand: CodexCommandRunner = async (
  command,
  args,
): Promise<CodexCommandResult> => {
  const process = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
};
