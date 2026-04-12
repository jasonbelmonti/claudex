export function mergeClaudeProviderOptions(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const baseClaude = asPlainRecord(base?.claude);
  const overrideClaude = asPlainRecord(override?.claude);
  const mergedClaude = mergePlainRecords(
    baseClaude,
    overrideClaude,
    new WeakMap<object, WeakMap<object, Record<string, unknown>>>(),
  );

  return {
    ...(base ?? {}),
    ...(override ?? {}),
    ...(mergedClaude ? { claude: mergedClaude } : {}),
  };
}

function mergePlainRecords(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
  seenPairs?: WeakMap<object, WeakMap<object, Record<string, unknown>>>,
): Record<string, unknown> | undefined {
  if (!base) {
    return override ? { ...override } : undefined;
  }

  if (!override) {
    return { ...base };
  }

  const seenOverrides = seenPairs?.get(base);
  const seenMerged = seenOverrides?.get(override);

  if (seenMerged) {
    return seenMerged;
  }

  const merged: Record<string, unknown> = { ...base };
  const pairs = seenPairs ?? new WeakMap<object, WeakMap<object, Record<string, unknown>>>();

  if (seenOverrides) {
    seenOverrides.set(override, merged);
  } else {
    pairs.set(base, new WeakMap([[override, merged]]));
  }

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseRecord = asPlainRecord(base[key]);
    const overrideRecord = asPlainRecord(overrideValue);

    if (baseRecord && overrideRecord) {
      merged[key] = mergePlainRecords(baseRecord, overrideRecord, pairs);
    } else {
      merged[key] = overrideValue;
    }
  }

  return merged;
}

function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : undefined;
}
