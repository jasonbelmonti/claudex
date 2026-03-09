import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";

import { AgentError } from "./errors";
import type { JsonSchema } from "./input";
import type { ProviderId } from "./provider";

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
    return {
      error: new AgentError({
        code: "structured_output_invalid",
        provider: params.provider,
        message: `${params.providerLabel} returned a non-JSON final response for a structured-output turn.`,
        cause: error,
        raw: params.text,
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

  return {
    error: new AgentError({
      code: "structured_output_invalid",
      provider: params.provider,
      message: `${params.providerLabel} returned JSON that did not match the requested output schema.`,
      details: {
        validationErrors,
      },
      raw: {
        text: params.text,
        schema: params.schema,
        validationErrors,
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
  }));
}
