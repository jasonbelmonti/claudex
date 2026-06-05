import type { AgentProviderAdapter } from "../../../src/core/provider.js";
import type { ProviderReadinessStatus } from "../../../src/core/readiness.js";
import { createCopilotCapabilities } from "../../../src/providers/copilot/capabilities.js";
import { CopilotAdapter } from "../../../src/providers/copilot/adapter.js";
import type { ContractProviderDriver } from "../types.js";
import {
  createCopilotAssistantMessageDeltaEvent,
  createCopilotAssistantMessageEvent,
  createCopilotIdleEvent,
  createCopilotSessionErrorEvent,
  createCopilotSessionStartEvent,
  createCopilotUsageEvent,
  FakeCopilotClient,
  FakeCopilotSession,
} from "../../providers/copilot/fakes.js";

const NEW_SESSION_REFERENCE = {
  provider: "copilot" as const,
  sessionId: "copilot-contract-create-1",
};

const RESUME_REFERENCE = {
  provider: "copilot" as const,
  sessionId: "copilot-contract-resume-1",
};

const STRUCTURED_FAILURE_REFERENCE = {
  provider: "copilot" as const,
  sessionId: "copilot-contract-structured-fail",
};

const PROVIDER_FAILURE_REFERENCE = {
  provider: "copilot" as const,
  sessionId: "copilot-contract-provider-fail",
};

const STRUCTURED_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
    },
  },
  required: ["status"],
  additionalProperties: false,
} as const;

export const COPILOT_CONTRACT_DRIVER: ContractProviderDriver = {
  provider: "copilot",
  capabilityExpectations: {
    supportsFork: false,
    supportsMessageDelta: true,
  },
  readiness: {
    ready: {
      createAdapter: () => new CopilotAdapter({ client: new FakeCopilotClient() }),
      expectedStatus: "ready",
    },
    missing_cli: {
      createAdapter: () => createStaticReadinessAdapter("missing_cli"),
      expectedStatus: "missing_cli",
    },
    needs_auth: {
      createAdapter: () =>
        new CopilotAdapter({
          client: new FakeCopilotClient({
            authStatus: {
              isAuthenticated: false,
              statusMessage: "Not authenticated",
            },
          }),
        }),
      expectedStatus: "needs_auth",
    },
    error: {
      createAdapter: () =>
        new CopilotAdapter({
          client: new FakeCopilotClient({
            statusError: new Error("Copilot runtime unavailable"),
          }),
        }),
      expectedStatus: "error",
    },
  },
  sessions: {
    create: () => ({
      createAdapter: () =>
        createCopilotContractAdapter({
          createSessionEvents: [
            createCopilotSessionStartEvent({
              sessionId: NEW_SESSION_REFERENCE.sessionId,
            }),
          ],
          createSessions: [
            new FakeCopilotSession(NEW_SESSION_REFERENCE.sessionId, [
              [
                createCopilotAssistantMessageDeltaEvent({
                  deltaContent: "created ",
                  messageId: "message-1",
                }),
                createCopilotAssistantMessageEvent({
                  content: "created ok",
                  messageId: "message-1",
                }),
                createCopilotUsageEvent({
                  inputTokens: 5,
                  outputTokens: 2,
                  cacheReadTokens: 0,
                }),
                createCopilotIdleEvent(),
              ],
            ]),
          ],
          resumeSessions: {
            [NEW_SESSION_REFERENCE.sessionId]: new FakeCopilotSession(
              NEW_SESSION_REFERENCE.sessionId,
              [
                [
                  createCopilotAssistantMessageEvent({
                    content: "created resume ok",
                    messageId: "message-2",
                  }),
                  createCopilotIdleEvent(),
                ],
              ],
            ),
          },
        }),
      input: {
        prompt: "Reply with created ok",
      },
      expectedSession: NEW_SESSION_REFERENCE,
      expectedResult: {
        text: "created ok",
        usage: {
          tokens: {
            input: 5,
            cachedInput: 0,
            output: 2,
          },
          providerUsage: {
            cacheReadTokens: 0,
            inputTokens: 5,
            model: "fake-copilot-model",
            outputTokens: 2,
          },
        },
      },
      resume: {
        input: {
          prompt: "Continue the created session",
        },
        expectedResult: {
          text: "created resume ok",
        },
      },
    }),
    structuredOutputFailure: () => ({
      createAdapter: () =>
        createCopilotContractAdapter({
          createSessionEvents: [
            createCopilotSessionStartEvent({
              sessionId: STRUCTURED_FAILURE_REFERENCE.sessionId,
            }),
          ],
          createSessions: [
            new FakeCopilotSession(STRUCTURED_FAILURE_REFERENCE.sessionId, [
              [
                createCopilotAssistantMessageEvent({
                  content: "{\"status\":1}",
                }),
                createCopilotIdleEvent(),
              ],
            ]),
          ],
        }),
      input: {
        prompt: "Return JSON",
      },
      turnOptions: {
        outputSchema: STRUCTURED_SCHEMA,
      },
      expectedError: {
        code: "structured_output_invalid",
        messageIncludes: "did not match the requested output schema",
        rawRequired: true,
      },
      expectedSession: STRUCTURED_FAILURE_REFERENCE,
    }),
    resume: () => ({
      createAdapter: () =>
        createCopilotContractAdapter({
          resumeSessions: {
            [RESUME_REFERENCE.sessionId]: new FakeCopilotSession(
              RESUME_REFERENCE.sessionId,
              [
                [
                  createCopilotAssistantMessageEvent({
                    content: "resume ok",
                  }),
                  createCopilotIdleEvent(),
                ],
              ],
            ),
          },
        }),
      reference: RESUME_REFERENCE,
      input: {
        prompt: "Continue",
      },
      expectedSession: RESUME_REFERENCE,
      expectedResult: {
        text: "resume ok",
      },
    }),
    providerFailure: () => ({
      createAdapter: () =>
        createCopilotContractAdapter({
          createSessionEvents: [
            createCopilotSessionStartEvent({
              sessionId: PROVIDER_FAILURE_REFERENCE.sessionId,
            }),
          ],
          createSessions: [
            new FakeCopilotSession(PROVIDER_FAILURE_REFERENCE.sessionId, [
              [
                createCopilotSessionErrorEvent({
                  message: "Copilot runtime failed",
                }),
              ],
            ]),
          ],
        }),
      input: {
        prompt: "Fail this turn",
      },
      expectedError: {
        code: "provider_failure",
        messageIncludes: "Copilot runtime failed",
        rawRequired: true,
      },
      expectedSession: PROVIDER_FAILURE_REFERENCE,
    }),
  },
  createSmokeAdapter: () => new CopilotAdapter(),
  smokeSessionOptions: {
    approvalMode: "deny",
  },
};

function createCopilotContractAdapter(
  options: ConstructorParameters<typeof FakeCopilotClient>[0],
): CopilotAdapter {
  return new CopilotAdapter({
    client: new FakeCopilotClient(options),
  });
}

function createStaticReadinessAdapter(
  status: ProviderReadinessStatus,
): AgentProviderAdapter {
  return {
    provider: "copilot",
    capabilities: createCopilotCapabilities(),
    async checkReadiness() {
      return {
        provider: "copilot",
        status,
        capabilities: createCopilotCapabilities(),
        checks: [
          {
            kind: "runtime",
            status: status === "ready" ? "pass" : "fail",
            summary: `Static Copilot readiness fixture: ${status}`,
          },
        ],
      };
    },
    async createSession() {
      throw new Error("Static readiness adapter cannot create sessions.");
    },
    async resumeSession() {
      throw new Error("Static readiness adapter cannot resume sessions.");
    },
  };
}
