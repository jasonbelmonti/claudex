export function mergeClaudeProviderOptions(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const baseClaude = asRecord(base?.claude);
  const overrideClaude = asRecord(override?.claude);
  const mergedClaude = mergeClaudeNamespace(baseClaude, overrideClaude);

  return {
    ...(base ?? {}),
    ...(override ?? {}),
    ...(mergedClaude ? { claude: mergedClaude } : {}),
  };
}

function mergeClaudeNamespace(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const baseOptions = asRecord(base?.options);
  const overrideOptions = asRecord(override?.options);
  const mergedOptions =
    baseOptions || overrideOptions
      ? {
          ...(baseOptions ?? {}),
          ...(overrideOptions ?? {}),
        }
      : undefined;

  return {
    ...(base ?? {}),
    ...(override ?? {}),
    ...(mergedOptions ? { options: mergedOptions } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
