import { runNodeModule } from "./command-runner.js";

export function verifyPackageImports(consumerDir, packageName) {
  runSmokeCheck(consumerDir, createPackageImportLines(packageName));
}

export function verifyCodexReadinessFallback(consumerDir, packageName) {
  runSmokeCheck(
    consumerDir,
    [
      ...createPackageImportLines(packageName, "const { ClaudexAdapter } ="),
      "const readiness = await new ClaudexAdapter({",
      "  preferredProviders: ['codex'],",
      "  codex: {",
      "    sdkOptions: {",
      "      codexPathOverride: '/definitely-missing/claudex-codex',",
      "    },",
      "  },",
      "}).checkReadiness();",
      "if (readiness.provider !== 'codex' || readiness.status !== 'missing_cli') {",
      "  throw new Error('Unexpected readiness result: ' + JSON.stringify(readiness));",
      "}",
    ],
  );
}

export function verifyUnsupportedFeatureContract(consumerDir, packageName) {
  runSmokeCheck(consumerDir, [
    `const { AgentError, ClaudexAdapter, isAgentError } = await import(${JSON.stringify(packageName)});`,
    "const adapter = new ClaudexAdapter({ preferredProviders: ['codex'] });",
    "try {",
    "  await adapter.resumeSession(",
    "    { provider: 'codex', sessionId: 'smoke-session' },",
    "    { instructions: 'unsupported smoke instructions' },",
    "  );",
    "  throw new Error('Expected ClaudexAdapter.resumeSession to throw.');",
    "} catch (error) {",
    "  if (!(error instanceof AgentError)) {",
    "    throw new Error('Expected instanceof AgentError, got ' + String(error));",
    "  }",
    "  if (!isAgentError(error)) {",
    "    throw new Error('Expected isAgentError(error) to return true.');",
    "  }",
    "  if (error.code !== 'unsupported_feature' || error.provider !== 'codex') {",
    "    throw new Error('Unexpected AgentError payload: ' + JSON.stringify({ code: error.code, provider: error.provider }));",
    "  }",
    "}",
  ]);
}

function runSmokeCheck(consumerDir, lines, prefixLines = []) {
  runNodeModule([...prefixLines, ...lines].join("\n"), consumerDir);
}

function createPackageImportLines(packageName, rootBindingPrefix = "") {
  return [
    `${rootBindingPrefix} await import(${JSON.stringify(packageName)});`.trim(),
    `await import(${JSON.stringify(`${packageName}/ingest`)});`,
  ];
}
