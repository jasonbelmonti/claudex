import { expect, test } from "#test-support";

import {
  classifyStructuredOutputText,
  createSafeStructuredOutputDiagnostics,
  hashJsonValue,
} from "../src/core/structured-output-diagnostics.js";

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
  ["truncated JSON", "{\"status\":\"ok\"", "truncated_json"],
  ["valid JSON", "{\"status\":\"ok\"}", "valid_json"],
])("classifies %s without repairing it", (_name, response, classification) => {
  expect(classifyStructuredOutputText(response)).toBe(classification);
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
