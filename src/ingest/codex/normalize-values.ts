export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function asRecordOfRecords(
  value: unknown,
): Record<string, Record<string, unknown>> {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value).flatMap(([key, nestedValue]) =>
    isRecord(nestedValue)
      ? [[key, nestedValue] as const]
      : [],
  );

  return Object.fromEntries(entries);
}

export function parseMaybeJson(value: unknown): unknown {
  if (!isString(value)) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
