import { AgentError } from "../../core/errors.js";
import type { CopilotClientLike } from "./types.js";

export const DEFAULT_COPILOT_CLEANUP_TIMEOUT_MS = 5_000;

type CleanupAttempt<T> =
  | { status: "completed"; value: T }
  | { status: "failed"; error: unknown }
  | { status: "timed_out"; error: Error };

export async function cleanupCopilotClient(params: {
  client: CopilotClientLike;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = resolveCleanupTimeoutMs(params.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const stopAttempt = await attemptCleanup(
    () => params.client.stop(),
    Math.floor(timeoutMs * 0.8),
    "runtime_stop",
  );

  if (stopAttempt.status === "completed" && stopAttempt.value.length === 0) {
    return;
  }

  const stopErrors =
    stopAttempt.status === "completed" ? stopAttempt.value : [stopAttempt.error];
  const forceStopAttempt = await attemptCleanup(
    () => params.client.forceStop(),
    Math.max(0, deadline - Date.now()),
    "runtime_force_stop",
  );
  const forceStopFailed = forceStopAttempt.status !== "completed";
  const cleanupTimedOut =
    stopAttempt.status === "timed_out" ||
    forceStopAttempt.status === "timed_out";
  const causes = forceStopFailed
    ? [...stopErrors, forceStopAttempt.error]
    : stopErrors;

  throw new AgentError({
    code: "provider_failure",
    provider: "copilot",
    message: forceStopFailed
      ? "Copilot runtime cleanup failed and force-stop did not complete."
      : "Copilot runtime cleanup failed; force-stop completed.",
    cause: new AggregateError(causes, "Copilot runtime cleanup failed."),
    details: {
      stage: "cleanup",
      lifecycleStage: forceStopFailed ? "runtime_force_stop" : "runtime_stop",
      timeoutMs,
      cleanupTimedOut,
      forceStopFailed,
      cleanupErrorCount: causes.length,
    },
    raw: causes,
  });
}

async function attemptCleanup<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  stage: "runtime_stop" | "runtime_force_stop",
): Promise<CleanupAttempt<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation().then(
        (value): CleanupAttempt<T> => ({ status: "completed", value }),
        (error): CleanupAttempt<T> => ({ status: "failed", error }),
      ),
      new Promise<CleanupAttempt<T>>((resolve) => {
        timeout = setTimeout(() => {
          const error = new Error(
            `Copilot ${stage} timed out after ${timeoutMs}ms.`,
          );
          error.name = "CopilotCleanupTimeoutError";
          resolve({ status: "timed_out", error });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
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
