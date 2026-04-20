import type { ProviderId } from "../core/provider.js";
import type {
  DiscoveryPhase,
  ObservedEventLocation,
  ObservedEventSource,
  ObservedEventSourceKind,
} from "./source.js";

type SourceMetadata = Record<string, unknown>;

export type BuildObservedEventSourceOptions = {
  provider: ProviderId;
  kind: ObservedEventSourceKind;
  discoveryPhase: DiscoveryPhase;
  rootPath: string;
  filePath: string;
  location?: ObservedEventLocation;
  rootMetadata?: SourceMetadata;
  matchMetadata?: SourceMetadata;
};

export function buildObservedEventSource(
  options: BuildObservedEventSourceOptions,
): ObservedEventSource {
  const source: ObservedEventSource = {
    provider: options.provider,
    kind: options.kind,
    discoveryPhase: options.discoveryPhase,
    rootPath: options.rootPath,
    filePath: options.filePath,
  };
  const metadata = mergeObservedSourceMetadata(
    options.rootMetadata,
    options.matchMetadata,
  );

  if (metadata !== undefined) {
    source.metadata = metadata;
  }

  if (
    options.location?.line !== undefined
    || options.location?.byteOffset !== undefined
  ) {
    source.location = {
      line: options.location.line,
      byteOffset: options.location.byteOffset,
    };
  }

  return source;
}

function mergeObservedSourceMetadata(
  rootMetadata?: SourceMetadata,
  matchMetadata?: SourceMetadata,
): SourceMetadata | undefined {
  if (!rootMetadata) {
    return matchMetadata;
  }

  if (!matchMetadata) {
    return rootMetadata;
  }

  return {
    ...rootMetadata,
    ...matchMetadata,
  };
}
