import type { Options as ClaudeSdkOptions } from "@anthropic-ai/claude-agent-sdk";

import type { ProviderReadiness } from "../../core/readiness";
import { createClaudeCapabilities } from "./capabilities";
import {
  classifyClaudeErrorCode,
  looksLikeClaudeNeedsAuth,
  looksLikeMissingClaudeCli,
} from "./errors";
import type { ClaudeQueryFactory, ClaudeQueryLike } from "./types";

export async function checkClaudeReadiness(params: {
  queryFactory: ClaudeQueryFactory;
  sdkOptions?: Partial<ClaudeSdkOptions>;
}): Promise<ProviderReadiness> {
  const capabilities = createClaudeCapabilities();
  let query: ClaudeQueryLike;

  try {
    query = params.queryFactory({
      prompt: "Readiness check",
      options: buildClaudeReadinessOptions(params.sdkOptions),
    });
  } catch (error) {
    return createClaudeReadinessError(error, capabilities);
  }

  try {
    const initialization = await query.initializationResult();
    const account = await query.accountInfo();

    return {
      provider: "claude",
      status: "ready",
      checks: [
        {
          kind: "runtime",
          status: "pass",
          summary: "Claude SDK initialized successfully",
        },
        {
          kind: "auth",
          status: "pass",
          summary: "Claude CLI authentication is available",
          detail: account.email ?? initialization.account.email,
        },
      ],
      capabilities: createClaudeCapabilities({
        raw: initialization,
      }),
      raw: {
        initialization,
        account,
      },
    };
  } catch (error) {
    return createClaudeReadinessError(error, capabilities);
  } finally {
    query.close();
  }
}

function createClaudeReadinessError(
  error: unknown,
  capabilities: ProviderReadiness["capabilities"],
): ProviderReadiness {
  const detail = error instanceof Error ? error.message : String(error);
  const code = classifyClaudeErrorCode(detail);

  if (code === "missing_cli" || looksLikeMissingClaudeCli(detail)) {
    return {
      provider: "claude",
      status: "missing_cli",
      checks: [
        {
          kind: "cli",
          status: "fail",
          summary: "Claude CLI is not available",
          detail,
        },
      ],
      capabilities,
      raw: error,
    };
  }

  if (code === "needs_auth" || looksLikeClaudeNeedsAuth(detail)) {
    return {
      provider: "claude",
      status: "needs_auth",
      checks: [
        {
          kind: "auth",
          status: "fail",
          summary: "Claude CLI needs login",
          detail,
        },
      ],
      capabilities,
      raw: error,
    };
  }

  return {
    provider: "claude",
    status: "error",
    checks: [
      {
        kind: "runtime",
        status: "fail",
        summary: "Claude readiness probe failed",
        detail,
      },
    ],
    capabilities,
    raw: error,
  };
}

const READINESS_OMITTED_OPTION_KEYS = new Set<keyof ClaudeSdkOptions>([
  "continue",
  "forkSession",
  "resume",
  "resumeSessionAt",
  "sessionId",
]);

function buildClaudeReadinessOptions(
  sdkOptions?: Partial<ClaudeSdkOptions>,
): ClaudeSdkOptions {
  return {
    ...omitReadinessOptions(sdkOptions),
    permissionMode: "plan",
    persistSession: false,
    settingSources: [],
  };
}

function omitReadinessOptions(
  sdkOptions?: Partial<ClaudeSdkOptions>,
): Partial<ClaudeSdkOptions> {
  if (!sdkOptions) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(sdkOptions).filter(
      ([key]) => !READINESS_OMITTED_OPTION_KEYS.has(key as keyof ClaudeSdkOptions),
    ),
  ) as Partial<ClaudeSdkOptions>;
}
