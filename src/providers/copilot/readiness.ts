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
  ownsClient: boolean;
};

export async function checkCopilotReadiness(
  options: CopilotAdapterOptions = {},
): Promise<ProviderReadiness> {
  const probe = createCopilotReadinessProbe(options);
  const checks: ReadinessCheck[] = [];
  const raw: CopilotReadinessRaw = {};
  let readinessStatus: ProviderReadinessStatus = "ready";

  try {
    await probe.client.start();
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
    const status = await probe.client.getStatus();
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
    const auth = await probe.client.getAuthStatus();
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
      ownsClient: options.ownsClient === true,
    };
  }

  const clientFactory = options.clientFactory ?? createCopilotClient;

  return {
    client: clientFactory(options.sdkOptions ?? {}),
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
    const cleanupErrors = await probe.client.stop();
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
