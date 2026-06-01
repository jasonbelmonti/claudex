import type {
  ProviderReadiness,
  ProviderReadinessStatus,
  ReadinessCheck,
} from "../../core/readiness.js";
import { createCopilotCapabilities } from "./capabilities.js";
import { createCopilotClient } from "./sdk.js";
import type {
  CopilotAdapterOptions,
  CopilotAuthStatus,
  CopilotClientLike,
  CopilotStatus,
} from "./types.js";

type CopilotReadinessRaw = {
  status?: CopilotStatus;
  auth?: CopilotAuthStatus;
  startupError?: unknown;
  statusError?: unknown;
  authError?: unknown;
  cleanupErrors?: unknown[];
};

type CopilotReadinessProbe = {
  client: CopilotClientLike;
  lifecycleTimeoutMs: number;
  ownsClient: boolean;
};

const DEFAULT_COPILOT_READINESS_TIMEOUT_MS = 5_000;

export async function checkCopilotReadiness(
  options: CopilotAdapterOptions = {},
): Promise<ProviderReadiness> {
  let probe: CopilotReadinessProbe;

  try {
    probe = createCopilotReadinessProbe(options);
  } catch (error) {
    return createCopilotReadinessResult({
      status: "error",
      checks: [
        {
          kind: "runtime",
          status: "fail",
          summary: "Copilot SDK client creation failed",
          detail: toErrorDetail(error),
        },
      ],
      raw: {
        startupError: error,
      },
    });
  }

  const checks: ReadinessCheck[] = [];
  const raw: CopilotReadinessRaw = {};
  let readinessStatus: ProviderReadinessStatus = "ready";

  try {
    await runWithTimeout(
      () => probe.client.start(),
      probe.lifecycleTimeoutMs,
      "runtime startup",
    );
  } catch (error) {
    raw.startupError = error;
    checks.push({
      kind: "runtime",
      status: "fail",
      summary: "Copilot SDK runtime failed to start",
      detail: toErrorDetail(error),
    });

    const cleanupCheck = await cleanupOwnedClient(probe, raw);
    if (cleanupCheck) {
      checks.push(cleanupCheck);
    }

    return createCopilotReadinessResult({
      status: "error",
      checks,
      raw,
    });
  }

  try {
    const status = await runWithTimeout(
      () => probe.client.getStatus(),
      probe.lifecycleTimeoutMs,
      "runtime status probe",
    );
    raw.status = status;
    checks.push({
      kind: "runtime",
      status: "pass",
      summary: "Copilot SDK runtime is available",
      detail: formatCopilotStatus(status),
    });
  } catch (error) {
    raw.statusError = error;
    checks.push({
      kind: "runtime",
      status: "fail",
      summary: "Copilot SDK status probe failed",
      detail: toErrorDetail(error),
    });

    const cleanupCheck = await cleanupOwnedClient(probe, raw);
    if (cleanupCheck) {
      checks.push(cleanupCheck);
    }

    return createCopilotReadinessResult({
      status: "error",
      checks,
      raw,
    });
  }

  try {
    const auth = await runWithTimeout(
      () => probe.client.getAuthStatus(),
      probe.lifecycleTimeoutMs,
      "auth probe",
    );
    raw.auth = auth;

    if (auth.isAuthenticated) {
      checks.push({
        kind: "auth",
        status: "pass",
        summary: "Copilot authentication is available",
        detail: formatCopilotAuthStatus(auth),
      });
    } else {
      readinessStatus = "needs_auth";
      checks.push({
        kind: "auth",
        status: "fail",
        summary: "Copilot needs authentication",
        detail: formatCopilotAuthStatus(auth),
      });
    }
  } catch (error) {
    raw.authError = error;
    checks.push({
      kind: "auth",
      status: "fail",
      summary: "Copilot auth probe failed",
      detail: toErrorDetail(error),
    });

    const cleanupCheck = await cleanupOwnedClient(probe, raw);
    if (cleanupCheck) {
      checks.push(cleanupCheck);
    }

    return createCopilotReadinessResult({
      status: "error",
      checks,
      raw,
    });
  }

  const cleanupCheck = await cleanupOwnedClient(probe, raw);
  if (cleanupCheck) {
    checks.push(cleanupCheck);

    if (cleanupCheck.status === "warn" && readinessStatus === "ready") {
      readinessStatus = "degraded";
    }
  }

  return createCopilotReadinessResult({
    status: readinessStatus,
    checks,
    raw,
  });
}

function createCopilotReadinessProbe(
  options: CopilotAdapterOptions,
): CopilotReadinessProbe {
  if (options.client) {
    return {
      client: options.client,
      lifecycleTimeoutMs: resolveReadinessTimeoutMs(options.readinessTimeoutMs),
      ownsClient: options.ownsClient === true,
    };
  }

  const clientFactory = options.clientFactory ?? createCopilotClient;

  return {
    client: clientFactory(options.sdkOptions ?? {}),
    lifecycleTimeoutMs: resolveReadinessTimeoutMs(options.readinessTimeoutMs),
    ownsClient: true,
  };
}

async function cleanupOwnedClient(
  probe: CopilotReadinessProbe,
  raw: CopilotReadinessRaw,
): Promise<ReadinessCheck | null> {
  if (!probe.ownsClient) {
    return null;
  }

  try {
    const stopResult = await stopWithTimeout(probe);

    if (stopResult.status === "timed_out") {
      raw.cleanupErrors = [stopResult.error];
      return forceStopAfterTimeout(probe, raw, stopResult.error);
    }

    const cleanupErrors = stopResult.errors;
    if (cleanupErrors.length === 0) {
      return {
        kind: "runtime",
        status: "pass",
        summary: "Copilot SDK runtime stopped cleanly",
      };
    }

    raw.cleanupErrors = cleanupErrors;

    return {
      kind: "runtime",
      status: "warn",
      summary: "Copilot SDK runtime cleanup reported errors",
      detail: cleanupErrors.map(toErrorDetail).join("\n"),
    };
  } catch (error) {
    raw.cleanupErrors = [error];

    return {
      kind: "runtime",
      status: "warn",
      summary: "Copilot SDK runtime cleanup failed",
      detail: toErrorDetail(error),
    };
  }
}

async function stopWithTimeout(
  probe: CopilotReadinessProbe,
): Promise<
  | { status: "stopped"; errors: Error[] }
  | { status: "timed_out"; error: Error }
> {
  try {
    const errors = await runWithTimeout(
      () => probe.client.stop(),
      probe.lifecycleTimeoutMs,
      "runtime cleanup",
    );

    return {
      status: "stopped",
      errors,
    };
  } catch (error) {
    if (isCopilotReadinessTimeoutError(error)) {
      return {
        status: "timed_out",
        error,
      };
    }

    throw error;
  }
}

async function forceStopAfterTimeout(
  probe: CopilotReadinessProbe,
  raw: CopilotReadinessRaw,
  timeoutError: Error,
): Promise<ReadinessCheck> {
  try {
    await runWithTimeout(
      () => probe.client.forceStop(),
      probe.lifecycleTimeoutMs,
      "runtime force stop",
    );

    return {
      kind: "runtime",
      status: "warn",
      summary: "Copilot SDK runtime cleanup timed out",
      detail: `${timeoutError.message} forceStop() completed.`,
    };
  } catch (error) {
    raw.cleanupErrors = [timeoutError, error];

    return {
      kind: "runtime",
      status: "warn",
      summary: "Copilot SDK runtime cleanup timed out and force stop failed",
      detail: raw.cleanupErrors.map(toErrorDetail).join("\n"),
    };
  }
}

async function runWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(createReadinessTimeoutError(operationName, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createReadinessTimeoutError(
  operationName: string,
  timeoutMs: number,
): Error {
  const error = new Error(
    `Copilot SDK ${operationName} timed out after ${timeoutMs}ms.`,
  );
  error.name = "CopilotReadinessTimeoutError";

  return error;
}

function isCopilotReadinessTimeoutError(error: unknown): error is Error {
  return error instanceof Error && error.name === "CopilotReadinessTimeoutError";
}

function resolveReadinessTimeoutMs(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) {
    return DEFAULT_COPILOT_READINESS_TIMEOUT_MS;
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    return DEFAULT_COPILOT_READINESS_TIMEOUT_MS;
  }

  return timeoutMs;
}

function createCopilotReadinessResult(params: {
  status: ProviderReadinessStatus;
  checks: ReadinessCheck[];
  raw: CopilotReadinessRaw;
}): ProviderReadiness {
  const runtimeStatus = params.raw.status;

  return {
    provider: "copilot",
    status: params.status,
    checks: params.checks,
    capabilities: createCopilotCapabilities({
      providerVersion: runtimeStatus?.version,
      raw: runtimeStatus,
      extensions:
        runtimeStatus?.protocolVersion === undefined
          ? undefined
          : {
              protocolVersion: runtimeStatus.protocolVersion,
            },
    }),
    raw: params.raw,
  };
}

function formatCopilotStatus(status: CopilotStatus): string {
  const parts = [`runtime ${status.version}`];

  if (status.protocolVersion !== undefined) {
    parts.push(`protocol ${status.protocolVersion}`);
  }

  return parts.join(", ");
}

function formatCopilotAuthStatus(auth: CopilotAuthStatus): string {
  return [
    auth.statusMessage,
    auth.login ? `login: ${auth.login}` : undefined,
    auth.authType ? `authType: ${auth.authType}` : undefined,
  ]
    .filter(Boolean)
    .join("; ");
}

function toErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
