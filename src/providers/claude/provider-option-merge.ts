export function mergeClaudeProviderOptions(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const baseClaude = asPlainRecord(base?.claude);
  const overrideClaude = asPlainRecord(override?.claude);
  const mergedClaude = mergePlainRecords(baseClaude, overrideClaude);

  return {
    ...(base ?? {}),
    ...(override ?? {}),
    ...(mergedClaude ? { claude: mergedClaude } : {}),
  };
}

function mergePlainRecords(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base) {
    return override ? { ...override } : undefined;
  }

  if (!override) {
    return { ...base };
  }

  const merged: Record<string, unknown> = { ...base };

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseRecord = asPlainRecord(base[key]);
    const overrideRecord = asPlainRecord(overrideValue);

    if (baseRecord && overrideRecord) {
      merged[key] = mergePlainRecords(baseRecord, overrideRecord);
    } else {
      merged[key] = overrideValue;
    }
  }

  return merged;
}

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
