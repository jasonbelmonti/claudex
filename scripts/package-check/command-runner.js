import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

export function run(command, cwd) {
  execute(command, cwd);
}

export function runAndCapture(command, cwd) {
  const result = execute(command, cwd);

  return result.stdout;
}

function execute(command, cwd) {
  const [executable, ...args] = command;

  if (!executable) {
    throw new Error("Expected a command to execute.");
  }

  const result = spawnSync(executable, args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const output = [stdout, stderr].filter(Boolean).join("\n");

    throw new Error(`Command failed (${command.join(" ")}):\n${output || "No output"}`);
  }

  return result;
}

export function runNodeModule(source, cwd) {
  run(["node", "--input-type=module", "-e", source], cwd);
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
