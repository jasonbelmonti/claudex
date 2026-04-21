import { loadAdapterEntry } from "../adapter-entry-loader.js";

const distAdapterUrl = new URL(
  "../../../dist/providers/codex/adapter.js",
  import.meta.url,
);

const adapterModule = await loadAdapterEntry({
  distAdapterUrl,
  sourceAdapterPath: "./adapter.ts",
});

export const CodexAdapter = adapterModule.CodexAdapter;
