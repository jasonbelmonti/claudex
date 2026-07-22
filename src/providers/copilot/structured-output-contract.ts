import { AgentError } from "../../core/errors.js";
import type { JsonSchema } from "../../core/input.js";

export type CopilotStructuredOutputPrompt = {
  displayPrompt?: string;
  prompt: string;
};

export function buildCopilotStructuredOutputPrompt(
  prompt: string,
  outputSchema?: JsonSchema,
): CopilotStructuredOutputPrompt {
  if (!outputSchema) {
    return { prompt };
  }

  let serializedSchema: string;

  try {
    serializedSchema = JSON.stringify(outputSchema);
  } catch (cause) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "copilot",
      message: "Copilot could not serialize the requested output schema.",
      cause,
      details: {
        stage: "structured_output_contract",
      },
      raw: outputSchema,
    });
  }

  return {
    displayPrompt: prompt,
    prompt: [
      prompt,
      "<claudex_structured_output_contract>",
      "Return exactly one JSON value that validates against the JSON Schema below.",
      "Do not use Markdown fences, prose, comments, or multiple JSON values.",
      "Claudex will reject malformed or schema-invalid output without repair or retry.",
      serializedSchema,
      "</claudex_structured_output_contract>",
    ].join("\n\n"),
  };
}
