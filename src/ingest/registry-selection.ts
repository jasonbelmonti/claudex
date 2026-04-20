import type { DiscoveryRootConfig } from "./discovery.js";
import type { IngestFileMatch, IngestProviderRegistry } from "./registry.js";

export type RegistrySelection = {
  registry: IngestProviderRegistry;
  match: IngestFileMatch;
};

export function selectRegistryForFile(
  registries: IngestProviderRegistry[],
  root: DiscoveryRootConfig,
  filePath: string,
): RegistrySelection | null {
  for (const registry of registries) {
    if (registry.provider !== root.provider) {
      continue;
    }

    const match = registry.matchFile(filePath, root);

    if (match) {
      return { registry, match };
    }
  }

  return null;
}
