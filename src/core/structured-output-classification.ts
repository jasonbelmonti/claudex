export type StructuredOutputResponseClassification =
  | "valid_json"
  | "non_json"
  | "fenced_json"
  | "prose_wrapped_json"
  | "multiple_json_values"
  | "truncated_json"
  | "schema_invalid_json";

export type JsonCandidate = {
  end: number;
  start: number;
  value: unknown;
};

export type JsonCandidateScan = {
  candidates: JsonCandidate[];
  truncated: boolean;
};

type CompositeJsonScan =
  | { end: number; status: "complete" | "invalid" }
  | { status: "truncated" };

const JSON_NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const JSON_LITERALS = ["true", "false", "null"] as const;

export function classifyStructuredOutputText(
  text: string,
): StructuredOutputResponseClassification {
  try {
    JSON.parse(text);
    return "valid_json";
  } catch {
    // Classification continues without accepting or repairing the response.
  }

  const trimmed = trimJsonWhitespace(text);

  const fencedPayload = extractFencedJsonPayload(trimmed);
  if (fencedPayload !== undefined && parsesAsJson(fencedPayload)) {
    return "fenced_json";
  }

  const scan = scanJsonCandidates(trimmed);
  if (scan.candidates.length > 1) {
    return "multiple_json_values";
  }

  const candidate = scan.candidates[0];
  if (candidate) {
    const prefix = trimmed.slice(0, candidate.start).trim();
    const suffix = trimmed.slice(candidate.end).trim();

    if (hasVisibleWrapper(prefix) || hasVisibleWrapper(suffix)) {
      return "prose_wrapped_json";
    }
  }

  if (scan.truncated || looksLikeTruncatedPrimitive(trimmed)) {
    return "truncated_json";
  }

  return "non_json";
}

export function extractFencedJsonPayload(text: string): string | undefined {
  const match = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return match?.[1];
}

export function scanJsonCandidates(text: string): JsonCandidateScan {
  const candidates: JsonCandidate[] = [];
  let index = 0;
  let truncated = false;

  while (index < text.length) {
    const character = text[index];

    if (character === "{" || character === "[") {
      const composite = scanCompositeJson(text, index);
      if (composite.status === "truncated") {
        truncated = true;
        break;
      }

      if (composite.status === "complete") {
        pushCandidate(candidates, text, index, composite.end);
      }
      index = composite.end;
      continue;
    }

    if (character === '"') {
      const end = findJsonStringEnd(text, index);
      if (end === undefined) {
        truncated = true;
        break;
      }

      pushCandidate(candidates, text, index, end);
      index = end;
      continue;
    }

    const literalEnd = findJsonLiteralEnd(text, index);
    if (literalEnd !== undefined) {
      pushCandidate(candidates, text, index, literalEnd);
      index = literalEnd;
      continue;
    }

    const number = findJsonNumber(text, index);
    if (number) {
      if (number.truncated) {
        truncated = true;
        break;
      }

      pushCandidate(candidates, text, index, number.end);
      index = number.end;
      continue;
    }

    index += 1;
  }

  return { candidates, truncated };
}

function pushCandidate(
  candidates: JsonCandidate[],
  text: string,
  start: number,
  end: number,
): void {
  try {
    candidates.push({
      start,
      end,
      value: JSON.parse(text.slice(start, end)),
    });
  } catch {
    // Balanced but invalid JSON is not a candidate and is never repaired.
  }
}

function findJsonLiteralEnd(text: string, start: number): number | undefined {
  if (!isValueBoundaryBefore(text, start)) {
    return undefined;
  }

  for (const literal of JSON_LITERALS) {
    if (!text.startsWith(literal, start)) {
      continue;
    }

    const end = start + literal.length;
    if (isValueBoundaryAfter(text, end)) {
      return end;
    }
  }

  return undefined;
}

function findJsonNumber(
  text: string,
  start: number,
): { end: number; truncated: boolean } | undefined {
  const character = text[start];
  if (
    character === undefined ||
    (character !== "-" && (character < "0" || character > "9")) ||
    !isValueBoundaryBefore(text, start)
  ) {
    return undefined;
  }

  JSON_NUMBER_PATTERN.lastIndex = start;
  const match = JSON_NUMBER_PATTERN.exec(text);
  if (!match) {
    return character === "-" ? { end: start + 1, truncated: true } : undefined;
  }

  const end = JSON_NUMBER_PATTERN.lastIndex;
  const next = text[end];
  if (next === "." || next === "e" || next === "E") {
    return { end, truncated: true };
  }

  if (!isValueBoundaryAfter(text, end)) {
    return undefined;
  }

  return { end, truncated: false };
}

function isValueBoundaryBefore(text: string, index: number): boolean {
  if (index === 0) {
    return true;
  }

  return !/[\p{L}\p{N}_$]/u.test(text[index - 1] ?? "");
}

function isValueBoundaryAfter(text: string, index: number): boolean {
  if (index >= text.length) {
    return true;
  }

  return !/[\p{L}\p{N}_$]/u.test(text[index] ?? "");
}

function findJsonStringEnd(text: string, start: number): number | undefined {
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      return index + 1;
    }
  }

  return undefined;
}

function scanCompositeJson(text: string, start: number): CompositeJsonScan {
  const stack: string[] = [];
  let escaped = false;
  let inString = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{" || character === "[") {
      stack.push(character);
      continue;
    }

    if (character !== "}" && character !== "]") {
      continue;
    }

    const opener = stack.pop();
    if (
      opener === undefined ||
      (character === "}" && opener !== "{") ||
      (character === "]" && opener !== "[")
    ) {
      return { end: index + 1, status: "invalid" };
    }

    if (stack.length === 0) {
      return { end: index + 1, status: "complete" };
    }
  }

  return { status: "truncated" };
}

function trimJsonWhitespace(text: string): string {
  let start = 0;
  let end = text.length;

  while (start < end && isJsonWhitespace(text[start])) {
    start += 1;
  }
  while (end > start && isJsonWhitespace(text[end - 1])) {
    end -= 1;
  }

  return text.slice(start, end);
}

function isJsonWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r"
  );
}

function hasVisibleWrapper(text: string): boolean {
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(text);
}

function looksLikeTruncatedPrimitive(text: string): boolean {
  if (["t", "tr", "tru", "f", "fa", "fal", "fals", "n", "nu", "nul"].includes(text)) {
    return true;
  }

  return (
    text === "-" ||
    /^-?(?:0|[1-9]\d*)\.$/.test(text) ||
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?[eE][+-]?$/.test(text)
  );
}

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
