import { AgentError } from "../../core/errors.js";
import type { CopilotClientLike } from "./types.js";

export const DEFAULT_COPILOT_CLEANUP_TIMEOUT_MS = 5_000;

export async function cleanupCopilotClient(params: {
  client: CopilotClientLike;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = resolveCleanupTimeoutMs(params.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const gracefulStopTimeoutMs = Math.floor(timeoutMs * 0.8);
  let stopErrors: Error[] = [];
  let stopFailure: unknown;
  let stopTimedOut = false;

  try {
    stopErrors = await runCleanupWithTimeout(
      () => params.client.stop(),
      gracefulStopTimeoutMs,
      "runtime_stop",
    );
  } catch (error) {
    stopFailure = error;
    stopTimedOut = isCopilotCleanupTimeoutError(error);
  }

  if (stopFailure === undefined && stopErrors.length === 0) return;

  const primaryCleanupFailure =
    stopFailure ??
    new AggregateError(
        stopErrors,
        "Copilot runtime cleanup returned errors.",
      );
  let forceStopFailure: unknown;
  try {
    await runCleanupWithTimeout(
      () => params.client.forceStop(),
      Math.max(0, deadline - Date.now()),
      "runtime_force_stop",
    );
  } catch (error) {
    forceStopFailure = error;
  }

  const forceStopFailed = forceStopFailure !== undefined;
  const timedOut =
    stopTimedOut ||
    (forceStopFailed && isCopilotCleanupTimeoutError(forceStopFailure));
  const failureDescription = stopTimedOut
    ? `timed out after ${timeoutMs}ms`
    : stopErrors.length > 0
      ? `returned ${stopErrors.length} error(s)`
      : "failed during stop()";

  throw createCleanupError({
    cause: forceStopFailed
      ? new AggregateError(
          [primaryCleanupFailure, forceStopFailure],
          "Copilot cleanup and force-stop both failed.",
        )
      : primaryCleanupFailure,
    errorCount: stopErrors.length + (stopFailure === undefined ? 0 : 1),
    forceStopFailed,
    message: forceStopFailed
      ? `Copilot runtime cleanup ${failureDescription} and forceStop() failed.`
      : `Copilot runtime cleanup ${failureDescription}; forceStop() completed.`,
    stage: forceStopFailed ? "runtime_force_stop" : "runtime_stop",
    timedOut,
    timeoutMs,
  });
}

async function runCleanupWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  stage: "runtime_stop" | "runtime_force_stop",
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(
            `Copilot ${stage} timed out after ${timeoutMs}ms.`,
          );
          error.name = "CopilotCleanupTimeoutError";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function createCleanupError(params: {
  cause: unknown;
  errorCount?: number;
  forceStopFailed?: boolean;
  message: string;
  stage: "runtime_stop" | "runtime_force_stop";
  timedOut?: boolean;
  timeoutMs: number;
}): AgentError {
  return new AgentError({
    code: "provider_failure",
    provider: "copilot",
    message: params.message,
    cause: params.cause,
    details: {
      stage: "cleanup",
      lifecycleStage: params.stage,
      timeoutMs: params.timeoutMs,
      cleanupTimedOut: params.timedOut === true,
      forceStopFailed: params.forceStopFailed === true,
      cleanupErrorCount: params.errorCount ?? 1,
    },
    raw: params.cause,
    extensions: {
      diagnostics: {
        stage: "cleanup",
        lifecycleStage: params.stage,
        timeoutMs: params.timeoutMs,
        cleanupTimedOut: params.timedOut === true,
        forceStopFailed: params.forceStopFailed === true,
        cleanupErrorCount: params.errorCount ?? 1,
      },
    },
  });
}

function isCopilotCleanupTimeoutError(error: unknown): error is Error {
  return error instanceof Error && error.name === "CopilotCleanupTimeoutError";
}

function resolveCleanupTimeoutMs(timeoutMs: number | undefined): number {
  if (
    timeoutMs === undefined ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 0
  ) {
    return DEFAULT_COPILOT_CLEANUP_TIMEOUT_MS;
  }

  return timeoutMs;
}
