import { CodexAdapter } from "../../../src/providers/codex/adapter";
import type { ContractProviderDriver } from "../types";
import type { CodexCommandRunner } from "../../../src/providers/codex/types";
import { FakeCodexClient, FakeCodexThread } from "../../providers/codex/fakes";

const NEW_SESSION_REFERENCE = {
  provider: "codex" as const,
  sessionId: "thread-contract-create-1",
};

const RESUME_REFERENCE = {
  provider: "codex" as const,
  sessionId: "thread-contract-resume-1",
};

const STRUCTURED_FAILURE_REFERENCE = {
  provider: "codex" as const,
  sessionId: "thread-contract-structured-fail",
};

const PROVIDER_FAILURE_REFERENCE = {
  provider: "codex" as const,
  sessionId: "thread-contract-provider-fail",
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

export const CODEX_CONTRACT_DRIVER: ContractProviderDriver = {
  provider: "codex",
  capabilityExpectations: {
    supportsFork: false,
    supportsMessageDelta: false,
  },
  readiness: {
    ready: {
      createAdapter: () => {
        const runner: CodexCommandRunner = async (_command, args) => {
          if (args[0] === "--version") {
            return {
              exitCode: 0,
              stdout: "codex-cli 0.103.0",
              stderr: "",
            };
          }

          return {
            exitCode: 0,
            stdout: "Logged in using ChatGPT",
            stderr: "",
          };
        };

        return new CodexAdapter({
          commandRunner: runner,
          binaryResolver: async () => "/mock/bin/codex",
        });
      },
      expectedStatus: "ready",
    },
    missing_cli: {
      createAdapter: () =>
        new CodexAdapter({
          binaryResolver: async () => null,
        }),
      expectedStatus: "missing_cli",
    },
    needs_auth: {
      createAdapter: () => {
        const runner: CodexCommandRunner = async (_command, args) => {
          if (args[0] === "--version") {
            return {
              exitCode: 0,
              stdout: "codex-cli 0.103.0",
              stderr: "",
            };
          }

          return {
            exitCode: 1,
            stdout: "",
            stderr: "Not logged in",
          };
        };

        return new CodexAdapter({
          commandRunner: runner,
          binaryResolver: async () => "/mock/bin/codex",
        });
      },
      expectedStatus: "needs_auth",
    },
    degraded: {
      createAdapter: () => {
        const runner: CodexCommandRunner = async (_command, args) => {
          if (args[0] === "--version") {
            return {
              exitCode: 0,
              stdout: "codex-cli 0.103.0",
              stderr: "",
            };
          }

          return {
            exitCode: 0,
            stdout: "Authentication status unavailable",
            stderr: "",
          };
        };

        return new CodexAdapter({
          commandRunner: runner,
          binaryResolver: async () => "/mock/bin/codex",
        });
      },
      expectedStatus: "degraded",
    },
    error: {
      createAdapter: () =>
        new CodexAdapter({
          binaryResolver: async () => {
            throw new Error("spawn EACCES");
          },
        }),
      expectedStatus: "error",
    },
  },
  sessions: {
    create: () => ({
      createAdapter: () =>
        new CodexAdapter({
          client: new FakeCodexClient([
            new FakeCodexThread([
              [
                {
                  type: "thread.started",
                  thread_id: NEW_SESSION_REFERENCE.sessionId,
                },
                {
                  type: "turn.started",
                },
                {
                  type: "item.completed",
                  item: {
                    id: "message-1",
                    type: "agent_message",
                    text: "created ok",
                  },
                },
                {
                  type: "turn.completed",
                  usage: {
                    input_tokens: 4,
                    cached_input_tokens: 0,
                    output_tokens: 2,
                  },
                },
              ],
            ]),
          ], {
            [NEW_SESSION_REFERENCE.sessionId]: new FakeCodexThread(
              [
                [
                  {
                    type: "turn.started",
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: "message-2",
                      type: "agent_message",
                      text: "created resume ok",
                    },
                  },
                  {
                    type: "turn.completed",
                    usage: {
                      input_tokens: 2,
                      cached_input_tokens: 0,
                      output_tokens: 2,
                    },
                  },
                ],
              ],
              NEW_SESSION_REFERENCE.sessionId,
            ),
          }),
        }),
      input: {
        prompt: "Reply with created ok",
        attachments: [
          {
            kind: "image",
            source: {
              type: "path",
              path: "/tmp/contract-image.png",
            },
          },
        ],
      },
      expectedSession: NEW_SESSION_REFERENCE,
      expectedResult: {
        text: "created ok",
        usage: {
          tokens: {
            input: 4,
            cachedInput: 0,
            output: 2,
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
        new CodexAdapter({
          client: new FakeCodexClient([
            new FakeCodexThread([
              [
                {
                  type: "thread.started",
                  thread_id: "thread-contract-structured-fail",
                },
                {
                  type: "turn.started",
                },
                {
                  type: "item.completed",
                  item: {
                    id: "message-1",
                    type: "agent_message",
                    text: "{\"status\":1}",
                  },
                },
                {
                  type: "turn.completed",
                  usage: {
                    input_tokens: 2,
                    cached_input_tokens: 0,
                    output_tokens: 1,
                  },
                },
              ],
            ]),
          ]),
        }),
      input: {
        prompt: "Return JSON",
      },
      expectedSession: STRUCTURED_FAILURE_REFERENCE,
      turnOptions: {
        outputSchema: STRUCTURED_SCHEMA,
      },
      expectedError: {
        code: "structured_output_invalid",
        messageIncludes: "did not match the requested output schema",
        rawRequired: true,
      },
    }),
    resume: () => ({
      createAdapter: () =>
        new CodexAdapter({
          client: new FakeCodexClient([], {
            [RESUME_REFERENCE.sessionId]: new FakeCodexThread(
              [
                [
                  {
                    type: "turn.started",
                  },
                  {
                    type: "item.completed",
                    item: {
                      id: "message-1",
                      type: "agent_message",
                      text: "resume ok",
                    },
                  },
                  {
                    type: "turn.completed",
                    usage: {
                      input_tokens: 1,
                      cached_input_tokens: 0,
                      output_tokens: 1,
                    },
                  },
                ],
              ],
              RESUME_REFERENCE.sessionId,
            ),
          }),
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
        new CodexAdapter({
          client: new FakeCodexClient([
            new FakeCodexThread([
              [
                {
                  type: "thread.started",
                  thread_id: PROVIDER_FAILURE_REFERENCE.sessionId,
                },
                {
                  type: "turn.started",
                },
                {
                  type: "error",
                  message: "CLI exited unexpectedly",
                },
              ],
            ]),
          ]),
        }),
      input: {
        prompt: "Fail this turn",
      },
      expectedSession: PROVIDER_FAILURE_REFERENCE,
      expectedError: {
        code: "provider_failure",
        messageIncludes: "CLI exited unexpectedly",
        rawRequired: true,
      },
    }),
  },
  createSmokeAdapter: () => new CodexAdapter(),
  smokeSessionOptions: {
    executionMode: "plan",
    approvalMode: "deny",
  },
};
