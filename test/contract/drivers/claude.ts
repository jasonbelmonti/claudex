import { ClaudeAdapter } from "../../../src/providers/claude/adapter";
import type { ContractProviderDriver } from "../types";
import { FakeClaudeQuery, FakeClaudeQueryFactory } from "../../providers/claude/fakes";
import {
  createAssistantMessage,
  createAuthStatusMessage,
  createInitMessage,
  createSuccessResultMessage,
  createTextDeltaMessage,
} from "../../providers/claude/messages";

const NEW_SESSION_REFERENCE = {
  provider: "claude" as const,
  sessionId: "claude-contract-create-1",
};

const RESUME_REFERENCE = {
  provider: "claude" as const,
  sessionId: "claude-contract-resume-1",
};

const STRUCTURED_FAILURE_REFERENCE = {
  provider: "claude" as const,
  sessionId: "claude-contract-structured-fail",
};

const PROVIDER_FAILURE_REFERENCE = {
  provider: "claude" as const,
  sessionId: "claude-contract-provider-fail",
};

const FORK_SOURCE_REFERENCE = {
  provider: "claude" as const,
  sessionId: "claude-contract-fork-source",
};

const FORK_CHILD_REFERENCE = {
  provider: "claude" as const,
  sessionId: "claude-contract-fork-child",
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

export const CLAUDE_CONTRACT_DRIVER: ContractProviderDriver = {
  provider: "claude",
  capabilityExpectations: {
    supportsFork: true,
    supportsMessageDelta: true,
  },
  readiness: {
    ready: {
      createAdapter: () =>
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([new FakeClaudeQuery()]).create,
        }),
      expectedStatus: "ready",
    },
    missing_cli: {
      createAdapter: () =>
        new ClaudeAdapter({
          queryFactory: () => {
            throw new Error("spawn claude ENOENT");
          },
        }),
      expectedStatus: "missing_cli",
    },
    needs_auth: {
      createAdapter: () =>
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([
            new FakeClaudeQuery(
              [],
              undefined,
              undefined,
              undefined,
              new Error("Authentication required. Run /login."),
            ),
          ]).create,
        }),
      expectedStatus: "needs_auth",
    },
    error: {
      createAdapter: () =>
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([
            new FakeClaudeQuery(
              [],
              undefined,
              undefined,
              new Error("Unexpected runtime failure"),
            ),
          ]).create,
        }),
      expectedStatus: "error",
    },
  },
  sessions: {
    create: () => ({
      createAdapter: () =>
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([
            new FakeClaudeQuery([
              createInitMessage(NEW_SESSION_REFERENCE.sessionId),
              createAuthStatusMessage(NEW_SESSION_REFERENCE.sessionId),
              createTextDeltaMessage(NEW_SESSION_REFERENCE.sessionId, "created "),
              createTextDeltaMessage(NEW_SESSION_REFERENCE.sessionId, "ok"),
              createAssistantMessage(NEW_SESSION_REFERENCE.sessionId, "created ok"),
              createSuccessResultMessage(NEW_SESSION_REFERENCE.sessionId, "created ok"),
            ]),
          ]).create,
        }),
      input: {
        prompt: "Reply with created ok",
      },
      expectedSession: NEW_SESSION_REFERENCE,
      expectedResult: {
        text: "created ok",
        usage: {
          tokens: {
            input: 3,
            cachedInput: 4,
            output: 5,
          },
          costUsd: 0.05,
          providerUsage: {
            cacheCreationInputTokens: 0,
            serviceTier: "standard",
            modelUsage: {},
          },
        },
      },
    }),
    structuredOutputFailure: () => ({
      createAdapter: () =>
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([
            new FakeClaudeQuery([
              createInitMessage("claude-contract-structured-fail"),
              createAssistantMessage("claude-contract-structured-fail", "{\"status\":1}"),
              createSuccessResultMessage(
                "claude-contract-structured-fail",
                "{\"status\":1}",
                {
                  structuredOutput: {
                    status: 1,
                  },
                },
              ),
            ]),
          ]).create,
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
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([
            new FakeClaudeQuery([
              createInitMessage(RESUME_REFERENCE.sessionId),
              createAssistantMessage(RESUME_REFERENCE.sessionId, "resume ok"),
              createSuccessResultMessage(RESUME_REFERENCE.sessionId, "resume ok"),
            ]),
          ]).create,
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
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([
            new FakeClaudeQuery(
              [createInitMessage(PROVIDER_FAILURE_REFERENCE.sessionId)],
              undefined,
              undefined,
              undefined,
              undefined,
              new Error("Claude runtime exploded"),
            ),
          ]).create,
        }),
      input: {
        prompt: "Fail this turn",
      },
      expectedSession: PROVIDER_FAILURE_REFERENCE,
      expectedError: {
        code: "provider_failure",
        messageIncludes: "Claude runtime exploded",
        rawRequired: true,
      },
    }),
    fork: () => ({
      createAdapter: () =>
        new ClaudeAdapter({
          queryFactory: new FakeClaudeQueryFactory([
            new FakeClaudeQuery([
              createInitMessage(FORK_SOURCE_REFERENCE.sessionId),
              createAssistantMessage(FORK_SOURCE_REFERENCE.sessionId, "source"),
              createSuccessResultMessage(FORK_SOURCE_REFERENCE.sessionId, "source"),
            ]),
            new FakeClaudeQuery([
              createInitMessage(FORK_CHILD_REFERENCE.sessionId),
              createAssistantMessage(FORK_CHILD_REFERENCE.sessionId, "forked"),
              createSuccessResultMessage(FORK_CHILD_REFERENCE.sessionId, "forked"),
            ]),
          ]).create,
        }),
      initialInput: {
        prompt: "Create source session",
      },
      forkInput: {
        prompt: "Create fork session",
      },
      expectedSourceSession: FORK_SOURCE_REFERENCE,
      expectedForkSession: FORK_CHILD_REFERENCE,
      expectedForkText: "forked",
    }),
  },
  createSmokeAdapter: () => new ClaudeAdapter(),
  smokeSessionOptions: {
    executionMode: "plan",
    approvalMode: "deny",
  },
};
