import { expect, test } from "#test-support";

import { classifyStructuredOutputText } from "../src/core/structured-output-classification.js";

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
