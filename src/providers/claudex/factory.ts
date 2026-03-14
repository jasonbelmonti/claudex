import type { AgentProviderAdapter, ProviderId } from "../../core/provider";
import { ClaudeAdapter } from "../claude/adapter";
import { CodexAdapter } from "../codex/adapter";
import type { ClaudexAdapterOptions } from "./types";

export function createProviderAdapters(
  options: ClaudexAdapterOptions,
): Record<ProviderId, AgentProviderAdapter> {
  return {
    claude: options.providers?.claude ?? new ClaudeAdapter(options.claude),
    codex: options.providers?.codex ?? new CodexAdapter(options.codex),
  };
}
