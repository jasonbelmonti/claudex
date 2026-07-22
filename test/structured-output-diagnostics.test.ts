import { execFileSync } from "node:child_process";
import { expect, test } from "#test-support";
import { Ajv } from "ajv";

import {
  canonicalizeJson,
  classifyStructuredOutputText,
  createSafeStructuredOutputDiagnostics,
  hashJsonValue,
} from "../src/core/structured-output-diagnostics.js";
import { parseStructuredOutputText } from "../src/core/schema-validation.js";

test.each([
  ["plain non-JSON", "not json", "non_json"],
  ["fenced JSON", "```json\n{\"status\":\"ok\"}\n```", "fenced_json"],
  [
    "prose-wrapped JSON",
    "Here is the result: {\"status\":\"ok\"}",
    "prose_wrapped_json",
  ],
  [
    "multiple JSON values",
    "{\"status\":\"first\"}\n{\"status\":\"second\"}",
    "multiple_json_values",
  ],
  ["multiple primitive JSON values", "1 2", "multiple_json_values"],
  ["prose-wrapped primitive JSON", "Result: 42", "prose_wrapped_json"],
  ["truncated JSON", "{\"status\":\"ok\"", "truncated_json"],
  ["truncated JSON string", '"unfinished', "truncated_json"],
  ["truncated JSON number", "1e", "truncated_json"],
  ["mismatched object delimiters", "{]", "non_json"],
  ["mismatched array delimiters", "[}", "non_json"],
  ["BOM-prefixed JSON", '\uFEFF{"status":"ok"}', "non_json"],
  ["NBSP-prefixed JSON", '\u00A0{"status":"ok"}', "non_json"],
  ["valid JSON", "{\"status\":\"ok\"}", "valid_json"],
  ["valid JSON array", "[1,2]", "valid_json"],
  ["valid JSON string", '"ok"', "valid_json"],
  ["valid JSON number", "42", "valid_json"],
  ["valid JSON boolean", "true", "valid_json"],
  ["valid JSON null", "null", "valid_json"],
])("classifies %s without repairing it", (_name, response, classification) => {
  expect(classifyStructuredOutputText(response)).toBe(classification);
});

test("canonical schema text and hashes are locale-independent", () => {
  const script = `
    import { canonicalizeJson, hashJsonValue } from "./src/core/structured-output-diagnostics.ts";
    const schema = { properties: { z: { type: "string" }, "ä": { type: "number" } }, type: "object" };
    process.stdout.write(JSON.stringify({ canonical: canonicalizeJson(schema), hash: hashJsonValue(schema) }));
  `;
  const results = ["en_US.UTF-8", "sv_SE.UTF-8"].map((locale) =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          LANG: locale,
          LC_ALL: locale,
        },
      },
    ),
  );

  expect(results[0]).toBe(results[1]);
  expect(canonicalizeJson({ z: 1, "ä": 2 })).toBe('{"z":1,"ä":2}');
});

test("schema validation preserves an empty root instance path", () => {
  const schema = { type: "object" } as const;
  const directValidator = new Ajv({ allErrors: true, strict: false }).compile(
    schema,
  );
  expect(directValidator([])).toBe(false);

  const result = parseStructuredOutputText({
    provider: "copilot",
    providerLabel: "Copilot",
    schema,
    text: "[]",
  });
  const directError = directValidator.errors?.[0];

  expect(result.error).toMatchObject({
    details: {
      validationErrors: [
        {
          instancePath: directError?.instancePath,
          keyword: directError?.keyword,
          schemaPath: directError?.schemaPath,
        },
      ],
    },
  });
});

test.each([
  "ghp_abcdefghijklmnopqrstuvwxyz123456",
  "sk-proj-abcdefghijklmnopqrstuvwxyz123456",
  "glpat-abcdefghijklmnopqrstuvwxyz123456",
  "npm_abcdefghijklmnopqrstuvwxyz123456",
])(
  "safe validation diagnostics redact credential-shaped schema path %s while raw retains exact evidence",
  (credentialKey) => {
    const result = parseStructuredOutputText({
      provider: "copilot",
      providerLabel: "Copilot",
      schema: {
        properties: {
          [credentialKey]: { type: "string" },
        },
        required: [credentialKey],
        type: "object",
      },
      text: JSON.stringify({ [credentialKey]: 42 }),
    });
    const error = result.error;

    expect(error).toMatchObject({
      details: {
        validationErrors: [
          {
            instancePath: "/<redacted-sensitive>",
            schemaPath: "#/properties/<redacted-sensitive>/type",
          },
        ],
      },
      extensions: {
        diagnostics: {
          validationErrors: [
            {
              instancePath: "/<redacted-sensitive>",
              schemaPath: "#/properties/<redacted-sensitive>/type",
            },
          ],
        },
      },
    });

    const serializedSafeDiagnostics = JSON.stringify({
      details: error?.details,
      extensions: error?.extensions,
    });
    expect(serializedSafeDiagnostics).not.toContain(credentialKey);
    expect(JSON.stringify(error?.raw)).toContain(credentialKey);
    expect(JSON.stringify(error?.raw)).toContain(`/${credentialKey}`);
  },
);

test("deep structured responses cannot replace the primary validation failure", () => {
  const text = `${"[".repeat(20_000)}${"]".repeat(20_000)}`;
  const result = parseStructuredOutputText({
    provider: "copilot",
    providerLabel: "Copilot",
    schema: { type: "object" },
    text,
  });

  expect(result.error).toMatchObject({
    code: "structured_output_invalid",
    details: {
      responseClassification: "schema_invalid_json",
    },
    raw: { text },
  });
});

test("safe diagnostics hash exact input while redacting and truncating excerpts", () => {
  const schema = {
    required: ["status"],
    properties: { status: { type: "string" } },
    type: "object",
  };
  const response = JSON.stringify({
    SECRET_PROPERTY_NAME: "SECRET_PROPERTY_VALUE",
    status: "SECRET_MEMBER_CONTENT",
    token: "SECRET_TOKEN",
  });
  const diagnostics = createSafeStructuredOutputDiagnostics({
    classification: "schema_invalid_json",
    excerptLimit: 30,
    schema,
    text: response,
  });

  expect(diagnostics).toMatchObject({
    responseClassification: "schema_invalid_json",
    responseExcerptRedacted: true,
    responseExcerptTruncated: true,
    schemaHash: hashJsonValue({
      properties: { status: { type: "string" } },
      required: ["status"],
      type: "object",
    }),
    stage: "structured_output_validation",
  });
  expect(diagnostics.responseExcerpt).not.toContain("SECRET_MEMBER_CONTENT");
  expect(diagnostics.responseExcerpt).not.toContain("SECRET_PROPERTY_NAME");
  expect(diagnostics.responseExcerpt).not.toContain("SECRET_PROPERTY_VALUE");
  expect(diagnostics.responseExcerpt).not.toContain("SECRET_TOKEN");
  expect(diagnostics.responseExcerpt).toContain("[truncated]");
});
