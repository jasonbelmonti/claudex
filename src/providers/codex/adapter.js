const adapterModule =
  typeof Bun !== "undefined"
    ? await import("./adapter.ts")
    : await import(
        new URL("../../../dist/providers/codex/adapter.js", import.meta.url),
      );

export const CodexAdapter = adapterModule.CodexAdapter;
