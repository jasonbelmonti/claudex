import { createHash } from "node:crypto";
import {
  extractFencedJsonPayload,
  scanJsonCandidates,
  type StructuredOutputResponseClassification,
} from "./structured-output-classification.js";

export {
  classifyStructuredOutputText,
  type StructuredOutputResponseClassification,
} from "./structured-output-classification.js";

export type SafeStructuredOutputDiagnostics = {
  stage: "structured_output_validation";
  schemaHash: string;
  responseClassification: StructuredOutputResponseClassification;
  responseHash: string;
  responseExcerpt: string;
  responseExcerptRedacted: true;
  responseExcerptTruncated: boolean;
};

const DEFAULT_EXCERPT_LIMIT = 1_024;
const SECRET_KEY_PATTERN =
  /api[-_]?key|access[-_]?key|authorization|cookie|credential|password|private[-_]?key|secret|token/i;
const CREDENTIAL_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/gi,
  /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,255}\b/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashJsonValue(value: unknown): string {
  return sha256Text(canonicalizeJson(value));
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

export function createSafeValidationErrors(
  validationErrors: ReadonlyArray<Record<string, string>>,
  schema: unknown,
): Array<Record<string, string>> {
  const sensitivePropertyNames = new Set(
    [...collectSchemaPropertyNames(schema)].filter(isSensitiveDiagnosticText),
  );

  return validationErrors.map((validationError) =>
    Object.fromEntries(
      Object.entries(validationError).map(([key, value]) => [
        key,
        key === "instancePath" || key === "schemaPath"
          ? redactJsonPointer(value, sensitivePropertyNames)
          : redactSensitiveDiagnosticText(value, sensitivePropertyNames),
      ]),
    ),
  );
}

function createRedactedResponseExcerpt(
  text: string,
  classification: StructuredOutputResponseClassification,
  schema: unknown,
): string {
  const trimmed = text.trim();
  const schemaPropertyNames = collectSchemaPropertyNames(schema);
  const candidates = scanJsonCandidates(trimmed).candidates;
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
    const payload = extractFencedJsonPayload(trimmed);
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
          schemaPropertyNames.has(key) && !isSensitiveDiagnosticText(key)
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
        .sort(([left], [right]) => compareJsonKeys(left, right))
        .map(([key, member]) => [key, sortJsonValue(member)]),
    );
  }

  return value;
}

function compareJsonKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSensitiveDiagnosticText(value: string): boolean {
  return (
    SECRET_KEY_PATTERN.test(value) ||
    CREDENTIAL_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(value);
    })
  );
}

function redactJsonPointer(
  pointer: string,
  sensitivePropertyNames: ReadonlySet<string>,
): string {
  return pointer
    .split("/")
    .map((segment) => {
      const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
      return sensitivePropertyNames.has(decoded) || isSensitiveDiagnosticText(decoded)
        ? "<redacted-sensitive>"
        : redactSensitiveDiagnosticText(segment, sensitivePropertyNames);
    })
    .join("/");
}

function redactSensitiveDiagnosticText(
  value: string,
  sensitivePropertyNames: ReadonlySet<string>,
): string {
  let redacted = value;
  for (const propertyName of sensitivePropertyNames) {
    redacted = redacted.split(propertyName).join("<redacted-sensitive>");
  }

  for (const pattern of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, "<redacted-sensitive>");
  }

  return redacted;
}
