import { loadAdapterEntry } from "../adapter-entry-loader.js";

const distAdapterUrl = new URL(
  "../../../dist/providers/claude/adapter.js",
  import.meta.url,
);
const sourceAdapterUrl = new URL("./adapter.ts", import.meta.url);

const adapterModule = await loadAdapterEntry({
  distAdapterUrl,
  sourceAdapterUrl,
});

export const ClaudeAdapter = adapterModule.ClaudeAdapter;
