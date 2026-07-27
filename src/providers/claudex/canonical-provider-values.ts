import type { ProviderCapabilities } from "../../core/capabilities.js";
import type { ProviderId } from "../../core/provider.js";
import type { ProviderReadiness } from "../../core/readiness.js";
import type { SessionReference } from "../../core/session.js";
import {
  assertProviderIdentity,
  type ProviderIdentitySource,
} from "./provider-identity.js";

type CapabilityIdentitySource = Extract<
  ProviderIdentitySource,
  | "adapter_capabilities"
  | "readiness_capabilities"
  | "session_capabilities"
>;

type ReferenceIdentitySource = Extract<
  ProviderIdentitySource,
  | "session_reference"
  | "result_session"
  | "event_session"
  | "event_reference"
  | "terminal_result_session"
>;

export function snapshotProviderReadiness(
  readiness: ProviderReadiness,
  provider: ProviderId,
): ProviderReadiness {
  assertProviderIdentity(provider, readiness.provider, "readiness");
  const capabilities = snapshotProviderCapabilities(
    readiness.capabilities,
    provider,
    "readiness_capabilities",
  );
  const checks = readiness.checks.map((check) =>
    Object.freeze({ ...check }),
  );

  return Object.freeze({
    ...readiness,
    provider,
    checks: Object.freeze(checks) as ProviderReadiness["checks"],
    capabilities,
  });
}

export function snapshotProviderCapabilities(
  capabilities: ProviderCapabilities,
  provider: ProviderId,
  source: CapabilityIdentitySource,
): ProviderCapabilities {
  assertProviderIdentity(provider, capabilities.provider, source);
  const features = Object.fromEntries(
    Object.entries(capabilities.features).map(
      ([capability, availability]) => [
        capability,
        availability
          ? Object.freeze({ ...availability })
          : availability,
      ],
    ),
  ) as ProviderCapabilities["features"];

  return Object.freeze({
    ...capabilities,
    provider,
    features: Object.freeze(features),
  });
}

export function snapshotSessionReference(
  reference: SessionReference | null,
  provider: ProviderId,
  source: ReferenceIdentitySource,
): SessionReference | null {
  if (!reference) {
    return null;
  }

  assertProviderIdentity(provider, reference.provider, source);
  return Object.freeze({
    provider,
    sessionId: reference.sessionId,
  });
}
