import {
  type LiveFixtureSidecar,
  normalizeLiveFixtureMetadata,
} from "./live-fixture-types";

export function createLiveFixtureSidecar<
  TExtra extends Record<string, unknown> = Record<string, unknown>,
>(
  sidecar: LiveFixtureSidecar<TExtra>,
): LiveFixtureSidecar<TExtra> {
  const normalized = normalizeLiveFixtureSidecar(sidecar);

  if (normalized === null) {
    throw new Error("Live fixture sidecar is malformed.");
  }

  return normalized as LiveFixtureSidecar<TExtra>;
}

export function normalizeLiveFixtureSidecar(
  value: unknown,
): LiveFixtureSidecar<Record<string, unknown>> | null {
  const normalized = normalizeLiveFixtureMetadata(value);

  if (normalized === null) {
    return null;
  }

  return normalized as LiveFixtureSidecar<Record<string, unknown>>;
}
