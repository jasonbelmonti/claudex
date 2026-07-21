import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

import { AgentError } from "./errors.js";
import type { JsonSchema } from "./input.js";
import type { ProviderId } from "./provider.js";
import {
  classifyStructuredOutputText,
  createSafeStructuredOutputDiagnostics,
  type StructuredOutputResponseClassification,
} from "./structured-output-diagnostics.js";

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const validatorCache = new WeakMap<JsonSchema, ValidateFunction>();

export function parseStructuredOutputText(params: {
  provider: ProviderId;
  providerLabel: string;
  schema: JsonSchema;
  text: string;
}): {
  value?: unknown;
  error?: AgentError;
} {
  let parsed: unknown;

  try {
    parsed = JSON.parse(params.text);
  } catch (error) {
    const responseClassification = classifyStructuredOutputText(params.text);
    const diagnostics = createSafeStructuredOutputDiagnostics({
      classification: responseClassification,
      schema: params.schema,
      text: params.text,
    });

    return {
      error: new AgentError({
        code: "structured_output_invalid",
        provider: params.provider,
        message: structuredOutputParseFailureMessage(
          params.providerLabel,
          responseClassification,
        ),
        cause: error,
        details: diagnostics,
        raw: {
          text: params.text,
          schema: params.schema,
          responseClassification,
        },
        extensions: {
          diagnostics,
        },
      }),
    };
  }

  let validate: ValidateFunction;

  try {
    validate = getOrCreateValidator(params.schema);
  } catch (error) {
    return {
      error: new AgentError({
        code: "unsupported_feature",
        provider: params.provider,
        message:
          "The requested structured output schema is invalid or unsupported by the local validator.",
        cause: error,
        raw: params.schema,
      }),
    };
  }

  if (validate(parsed)) {
    return {
      value: parsed,
    };
  }

  const validationErrors = formatValidationErrors(validate.errors ?? []);
  const diagnostics = createSafeStructuredOutputDiagnostics({
    classification: "schema_invalid_json",
    schema: params.schema,
    text: params.text,
  });

  return {
    error: new AgentError({
      code: "structured_output_invalid",
      provider: params.provider,
      message: `${params.providerLabel} returned JSON that did not match the requested output schema.`,
      details: {
        ...diagnostics,
        validationErrors,
      },
      raw: {
        text: params.text,
        schema: params.schema,
        validationErrors,
      },
      extensions: {
        diagnostics: {
          ...diagnostics,
          validationErrors,
        },
      },
    }),
  };
}

export function validateStructuredOutputValue(params: {
  provider: ProviderId;
  providerLabel: string;
  schema: JsonSchema;
  value: unknown;
}): {
  value?: unknown;
  error?: AgentError;
} {
  let validate: ValidateFunction;

  try {
    validate = getOrCreateValidator(params.schema);
  } catch (error) {
    return {
      error: new AgentError({
        code: "unsupported_feature",
        provider: params.provider,
        message:
          "The requested structured output schema is invalid or unsupported by the local validator.",
        cause: error,
        raw: params.schema,
      }),
    };
  }

  if (validate(params.value)) {
    return {
      value: params.value,
    };
  }

  const validationErrors = formatValidationErrors(validate.errors ?? []);
  const serializedValue = JSON.stringify(params.value);
  const diagnostics = createSafeStructuredOutputDiagnostics({
    classification: "schema_invalid_json",
    schema: params.schema,
    text: serializedValue === undefined ? "undefined" : serializedValue,
  });

  return {
    error: new AgentError({
      code: "structured_output_invalid",
      provider: params.provider,
      message: `${params.providerLabel} returned JSON that did not match the requested output schema.`,
      details: {
        ...diagnostics,
        validationErrors,
      },
      raw: {
        value: params.value,
        schema: params.schema,
        validationErrors,
      },
      extensions: {
        diagnostics: {
          ...diagnostics,
          validationErrors,
        },
      },
    }),
  };
}

function getOrCreateValidator(schema: JsonSchema): ValidateFunction {
  const cachedValidator = validatorCache.get(schema);

  if (cachedValidator) {
    return cachedValidator;
  }

  const validator = ajv.compile(schema);
  validatorCache.set(schema, validator);
  return validator;
}

function formatValidationErrors(errors: ErrorObject[]): Array<Record<string, string>> {
  return errors.map((error) => ({
    instancePath: error.instancePath || "/",
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed.",
    schemaPath: error.schemaPath,
  }));
}

function structuredOutputParseFailureMessage(
  providerLabel: string,
  classification: StructuredOutputResponseClassification,
): string {
  switch (classification) {
    case "fenced_json":
      return `${providerLabel} returned JSON inside a Markdown fence; structured output requires exactly one unfenced JSON value.`;
    case "prose_wrapped_json":
      return `${providerLabel} returned prose-wrapped JSON; structured output requires exactly one JSON value with no surrounding text.`;
    case "multiple_json_values":
      return `${providerLabel} returned multiple JSON values; structured output requires exactly one JSON value.`;
    case "truncated_json":
      return `${providerLabel} returned a truncated JSON response for a structured-output turn.`;
    default:
      return `${providerLabel} returned a non-JSON final response for a structured-output turn.`;
  }
}
