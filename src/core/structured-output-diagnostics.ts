import { createHash } from "node:crypto";

export type StructuredOutputResponseClassification =
  | "valid_json"
  | "non_json"
  | "fenced_json"
  | "prose_wrapped_json"
  | "multiple_json_values"
  | "truncated_json"
  | "schema_invalid_json";

export type SafeStructuredOutputDiagnostics = {
  stage: "structured_output_validation";
  schemaHash: string;
  responseClassification: StructuredOutputResponseClassification;
  responseHash: string;
  responseExcerpt: string;
  responseExcerptRedacted: true;
  responseExcerptTruncated: boolean;
};

type JsonCandidate = {
  end: number;
  start: number;
  value: unknown;
};

const DEFAULT_EXCERPT_LIMIT = 1_024;
const SECRET_KEY_PATTERN = /authorization|cookie|credential|password|secret|token/i;

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashJsonValue(value: unknown): string {
  return sha256Text(canonicalizeJson(value));
}

export function classifyStructuredOutputText(
  text: string,
): StructuredOutputResponseClassification {
  const trimmed = text.trim();

  try {
    JSON.parse(trimmed);
    return "valid_json";
  } catch {
    // Classification continues without accepting or repairing the response.
  }

  const fencedPayload = extractFencedPayload(trimmed);
  if (fencedPayload !== undefined && parsesAsJson(fencedPayload)) {
    return "fenced_json";
  }

  const candidates = findJsonCandidates(trimmed);
  if (candidates.length > 1) {
    return "multiple_json_values";
  }

  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  if (candidate) {
    const prefix = trimmed.slice(0, candidate.start).trim();
    const suffix = trimmed.slice(candidate.end).trim();

    if (prefix.length > 0 || suffix.length > 0) {
      return "prose_wrapped_json";
    }
  }

  if (hasUnclosedJsonStructure(trimmed)) {
    return "truncated_json";
  }

  return "non_json";
}

export function createSafeStructuredOutputDiagnostics(params: {
  classification: StructuredOutputResponseClassification;
  excerptLimit?: number;
  schema: unknown;
  text: string;
}): SafeStructuredOutputDiagnostics {
  const excerpt = createRedactedResponseExcerpt(
    params.text,
    params.classification,
    params.schema,
  );
  const excerptLimit = params.excerptLimit ?? DEFAULT_EXCERPT_LIMIT;
  const responseExcerptTruncated = excerpt.length > excerptLimit;

  return {
    stage: "structured_output_validation",
    schemaHash: hashJsonValue(params.schema),
    responseClassification: params.classification,
    responseHash: sha256Text(params.text),
    responseExcerpt: responseExcerptTruncated
      ? `${excerpt.slice(0, Math.max(0, excerptLimit - 14))}…[truncated]`
      : excerpt,
    responseExcerptRedacted: true,
    responseExcerptTruncated,
  };
}

function createRedactedResponseExcerpt(
  text: string,
  classification: StructuredOutputResponseClassification,
  schema: unknown,
): string {
  const trimmed = text.trim();
  const schemaPropertyNames = collectSchemaPropertyNames(schema);
  const candidates = findJsonCandidates(trimmed);
  const redactedCandidates = candidates.map((candidate) =>
    JSON.stringify(redactJsonValue(candidate.value, schemaPropertyNames)),
  );

  if (classification === "schema_invalid_json" || classification === "valid_json") {
    try {
      return JSON.stringify(
        redactJsonValue(JSON.parse(trimmed), schemaPropertyNames),
      );
    } catch {
      return redactedResponsePlaceholder(classification, text.length);
    }
  }

  if (classification === "fenced_json") {
    const payload = extractFencedPayload(trimmed);
    if (payload !== undefined) {
      try {
        return `\`\`\`json\n${JSON.stringify(redactJsonValue(JSON.parse(payload), schemaPropertyNames))}\n\`\`\``;
      } catch {
        return redactedResponsePlaceholder(classification, text.length);
      }
    }
  }

  if (classification === "prose_wrapped_json" && redactedCandidates[0]) {
    return `[redacted prose]\n${redactedCandidates[0]}\n[redacted prose]`;
  }

  if (
    classification === "multiple_json_values" &&
    redactedCandidates.length > 0
  ) {
    return redactedCandidates.join("\n");
  }

  return redactedResponsePlaceholder(classification, text.length);
}

function redactedResponsePlaceholder(
  classification: StructuredOutputResponseClassification,
  length: number,
): string {
  return `[redacted ${classification} response; ${length} characters]`;
}

function redactJsonValue(
  value: unknown,
  schemaPropertyNames: ReadonlySet<string>,
): unknown {
  if (typeof value === "string") {
    return `<redacted:string:${value.length}>`;
  }

  if (typeof value === "number") {
    return "<redacted:number>";
  }

  if (typeof value === "boolean") {
    return "<redacted:boolean>";
  }

  if (value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((member) => redactJsonValue(member, schemaPropertyNames));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, member], index) => [
          schemaPropertyNames.has(key) && !SECRET_KEY_PATTERN.test(key)
            ? key
            : `<redacted-key-${index + 1}>`,
          redactJsonValue(member, schemaPropertyNames),
        ]),
    );
  }

  return `<redacted:${typeof value}>`;
}

function collectSchemaPropertyNames(schema: unknown): Set<string> {
  const names = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const member of value) visit(member);
      return;
    }

    if (typeof value !== "object" || value === null) return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.properties === "object" &&
      record.properties !== null &&
      !Array.isArray(record.properties)
    ) {
      for (const propertyName of Object.keys(record.properties)) {
        names.add(propertyName);
      }
    }

    for (const member of Object.values(record)) visit(member);
  };

  visit(schema);
  return names;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, member]) => [key, sortJsonValue(member)]),
    );
  }

  return value;
}

function extractFencedPayload(text: string): string | undefined {
  const match = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return match?.[1];
}

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function findJsonCandidates(text: string): JsonCandidate[] {
  const candidates: JsonCandidate[] = [];
  let index = 0;

  while (index < text.length) {
    const character = text[index];
    if (character !== "{" && character !== "[") {
      index += 1;
      continue;
    }

    const end = findCompositeJsonEnd(text, index);
    if (end === undefined) {
      index += 1;
      continue;
    }

    const source = text.slice(index, end);
    try {
      candidates.push({
        start: index,
        end,
        value: JSON.parse(source),
      });
      index = end;
    } catch {
      index += 1;
    }
  }

  return candidates;
}

function findCompositeJsonEnd(text: string, start: number): number | undefined {
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
      return undefined;
    }

    if (stack.length === 0) {
      return index + 1;
    }
  }

  return undefined;
}

function hasUnclosedJsonStructure(text: string): boolean {
  const start = text.search(/[[{]/);
  if (start === -1) {
    return false;
  }

  return findCompositeJsonEnd(text, start) === undefined;
}
