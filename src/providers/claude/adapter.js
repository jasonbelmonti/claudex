import { loadAdapterEntry } from "../adapter-entry-loader.js";

const distAdapterUrl = new URL(
  "../../../dist/providers/claude/adapter.js",
  import.meta.url,
);

const adapterModule = await loadAdapterEntry({
  distAdapterUrl,
  sourceAdapterPath: "./adapter.ts",
});

export const ClaudeAdapter = adapterModule.ClaudeAdapter;
