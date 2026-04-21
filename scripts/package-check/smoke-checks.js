import { runNodeModule } from "./command-runner.js";

export function verifyPackageImports(consumerDir, packageName) {
  runNodeModule(
    [
      `await import(${JSON.stringify(packageName)});`,
      `await import(${JSON.stringify(`${packageName}/ingest`)});`,
    ].join("\n"),
    consumerDir,
  );
}

export function verifyCodexReadinessFallback(consumerDir, packageName) {
  runNodeModule(
    [
      "globalThis.Bun ??= {",
      "  which: () => null,",
      "  file: () => ({ exists: async () => false }),",
      "};",
      `const { ClaudexAdapter } = await import(${JSON.stringify(packageName)});`,
      `await import(${JSON.stringify(`${packageName}/ingest`)});`,
      "const readiness = await new ClaudexAdapter({ preferredProviders: ['codex'] }).checkReadiness();",
      "if (readiness.provider !== 'codex' || readiness.status !== 'missing_cli') {",
      "  throw new Error('Unexpected readiness result: ' + JSON.stringify(readiness));",
      "}",
    ].join("\n"),
    consumerDir,
  );
}

export function verifyUnsupportedFeatureContract(consumerDir, packageName) {
  runNodeModule(
    [
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
    ].join("\n"),
    consumerDir,
  );
}
