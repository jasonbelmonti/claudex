import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { writeJson } from "./command-runner.js";

const CONSUMER_PACKAGE_NAME = "claudex-package-check-consumer";
const CONSUMER_TSCONFIG = {
  compilerOptions: {
    target: "ESNext",
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    skipLibCheck: false,
    noEmit: true,
  },
};

export function writeConsumerProject(consumerDir, packageName) {
  writeJson(join(consumerDir, "package.json"), {
    name: CONSUMER_PACKAGE_NAME,
    private: true,
    type: "module",
  });

  writeJson(join(consumerDir, "tsconfig.json"), CONSUMER_TSCONFIG);

  writeFileSync(join(consumerDir, "index.ts"), createConsumerEntrypoint(packageName));
}

function createConsumerEntrypoint(packageName) {
  const ingestPackageName = `${packageName}/ingest`;

  return [
    `import { ClaudexAdapter, type ClaudexAdapterOptions } from ${JSON.stringify(packageName)};`,
    `import { createSessionIngestService, type DiscoveryRootConfig, type IngestProviderRegistry } from ${JSON.stringify(ingestPackageName)};`,
    "",
    "const options: ClaudexAdapterOptions = {",
    '  preferredProviders: ["codex", "claude"],',
    "  claude: {},",
    "  codex: {},",
    "};",
    "",
    "const roots: DiscoveryRootConfig[] = [];",
    "const registries: IngestProviderRegistry[] = [];",
    "const adapter = new ClaudexAdapter(options);",
    "const ingestService = createSessionIngestService({ roots, registries });",
    "void adapter;",
    "void ingestService;",
    "void roots;",
    "void registries;",
    "",
  ].join("\n");
}
