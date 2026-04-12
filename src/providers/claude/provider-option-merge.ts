export function mergeClaudeProviderOptions(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }

  const baseClaude = asPlainRecord(base?.claude);
  const overrideClaude = asPlainRecord(override?.claude);
  const mergedClaude = mergePlainRecords(baseClaude, overrideClaude, createMergeState());

  return {
    ...(base ?? {}),
    ...(override ?? {}),
    ...(mergedClaude ? { claude: mergedClaude } : {}),
  };
}

function mergePlainRecords(
  base?: Record<string, unknown>,
  override?: Record<string, unknown>,
  state: MergeState,
): Record<string, unknown> | undefined {
  if (!base) {
    return override ? cloneOverrideRecord(override, state) : undefined;
  }

  if (!override) {
    return cloneBaseRecord(base, state);
  }

  const seenOverrides = state.seenPairs.get(base);
  const seenMerged = seenOverrides?.get(override);

  if (seenMerged) {
    return seenMerged;
  }

  const merged = createPlainRecord(base);

  if (seenOverrides) {
    seenOverrides.set(override, merged);
  } else {
    state.seenPairs.set(base, new WeakMap([[override, merged]]));
  }

  const previousBase = state.activeBase.get(base);
  const previousOverride = state.activeOverride.get(override);

  state.activeBase.set(base, merged);
  state.activeOverride.set(override, merged);

  try {
    for (const key of new Set([...Object.keys(base), ...Object.keys(override)])) {
      const hasBase = Object.prototype.hasOwnProperty.call(base, key);
      const hasOverride = Object.prototype.hasOwnProperty.call(override, key);

      if (hasBase && hasOverride) {
        const baseValue = base[key];
        const overrideValue = override[key];
        const baseRecord = asPlainRecord(baseValue);
        const overrideRecord = asPlainRecord(overrideValue);

        if (baseRecord && overrideRecord) {
          setRecordValue(merged, key, mergePlainRecords(baseRecord, overrideRecord, state));
        } else {
          setRecordValue(merged, key, overrideValue);
        }

        continue;
      }

      if (hasBase) {
        setRecordValue(merged, key, cloneBaseValue(base[key], state));
        continue;
      }

      setRecordValue(merged, key, cloneOverrideValue(override[key], state));
    }
  } finally {
    restoreActiveRecord(state.activeBase, base, previousBase);
    restoreActiveRecord(state.activeOverride, override, previousOverride);
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

function createPlainRecord(source: Record<string, unknown>): Record<string, unknown> {
  return Object.create(
    Object.getPrototypeOf(source) === null ? null : Object.prototype,
  ) as Record<string, unknown>;
}

function cloneBaseRecord(
  source: Record<string, unknown>,
  state: MergeState,
  seen: WeakMap<object, Record<string, unknown>> = new WeakMap(),
): Record<string, unknown> {
  const active = state.activeBase.get(source);

  if (active) {
    return active;
  }

  const existing = seen.get(source);

  if (existing) {
    return existing;
  }

  const copy = createPlainRecord(source);
  seen.set(source, copy);

  for (const [key, value] of Object.entries(source)) {
    setRecordValue(copy, key, cloneBaseValue(value, state, seen));
  }

  return copy;
}

function cloneOverrideRecord(
  source: Record<string, unknown>,
  state: MergeState,
  seen: WeakMap<object, Record<string, unknown>> = new WeakMap(),
): Record<string, unknown> {
  const active = state.activeOverride.get(source);

  if (active) {
    return active;
  }

  const existing = seen.get(source);

  if (existing) {
    return existing;
  }

  const copy = createPlainRecord(source);
  seen.set(source, copy);

  for (const [key, value] of Object.entries(source)) {
    setRecordValue(copy, key, cloneOverrideValue(value, state, seen));
  }

  return copy;
}

function cloneBaseValue(
  value: unknown,
  state: MergeState,
  seen?: WeakMap<object, Record<string, unknown>>,
): unknown {
  const record = asPlainRecord(value);
  return record ? cloneBaseRecord(record, state, seen) : value;
}

function cloneOverrideValue(
  value: unknown,
  state: MergeState,
  seen?: WeakMap<object, Record<string, unknown>>,
): unknown {
  const record = asPlainRecord(value);
  return record ? cloneOverrideRecord(record, state, seen) : value;
}

function setRecordValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function createMergeState(): MergeState {
  return {
    seenPairs: new WeakMap<object, WeakMap<object, Record<string, unknown>>>(),
    activeBase: new WeakMap<object, Record<string, unknown>>(),
    activeOverride: new WeakMap<object, Record<string, unknown>>(),
  };
}

function restoreActiveRecord(
  map: WeakMap<object, Record<string, unknown>>,
  source: object,
  previous: Record<string, unknown> | undefined,
): void {
  if (previous) {
    map.set(source, previous);
  } else {
    map.delete(source);
  }
}

type MergeState = {
  seenPairs: WeakMap<object, WeakMap<object, Record<string, unknown>>>;
  activeBase: WeakMap<object, Record<string, unknown>>;
  activeOverride: WeakMap<object, Record<string, unknown>>;
};
