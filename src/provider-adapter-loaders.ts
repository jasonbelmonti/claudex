import type { AgentProviderAdapter, ProviderId } from "./core/provider.js";
import type { ClaudexAdapterOptions } from "./providers/claudex/types.js";

export type ProviderAdapterLoader = () => Promise<AgentProviderAdapter>;

export function createProviderAdapterLoaders(
  options: ClaudexAdapterOptions,
): Record<ProviderId, ProviderAdapterLoader> {
  return {
    claude: createProviderAdapterLoader({
      providedAdapter: options.providers?.claude,
      importPath: "./providers/claude/adapter.js",
      exportName: "ClaudeAdapter",
      options: options.claude,
    }),
    codex: createProviderAdapterLoader({
      providedAdapter: options.providers?.codex,
      importPath: "./providers/codex/adapter.js",
      exportName: "CodexAdapter",
      options: options.codex,
    }),
  };
}

function createProviderAdapterLoader(params: {
  providedAdapter?: AgentProviderAdapter;
  importPath: string;
  exportName: string;
  options?: unknown;
}): ProviderAdapterLoader {
  const providedAdapter = params.providedAdapter;

  if (providedAdapter) {
    return async () => providedAdapter;
  }

  return async () => {
    const module = (await import(
      params.importPath
    )) as Record<string, new (options?: unknown) => AgentProviderAdapter>;
    const Adapter = module[params.exportName];

    if (!Adapter) {
      throw new Error(
        `Missing ${params.exportName} export while loading ${params.importPath}.`,
      );
    }

    return new Adapter(params.options);
  };
}
