const adapterModule =
  typeof Bun !== "undefined"
    ? await import("./adapter.ts")
    : await import(
        new URL("../../../dist/providers/claude/adapter.js", import.meta.url),
      );

export const ClaudeAdapter = adapterModule.ClaudeAdapter;
