import type { IngestCursor, IngestCursorKey } from "./cursor";
import { resolveCursorRecovery } from "./cursor-recovery";
import type { DiscoveryEventType, DiscoveryRootConfig } from "./discovery";
import type { ObservedIngestRecord } from "./events";
import { readSourceFileState, type SourceFileState } from "./file-state";
import { consumeParsedRecords } from "./record-consumption";
import { dispatchObservedRecord } from "./record-dispatch";
import type { RegistrySelection } from "./registry-selection";
import type { DiscoveryPhase, ObservedEventSource } from "./source";
import type { SessionIngestServiceOptions } from "./service";

type ContinuityCheckpoint = {
  byteOffset: number;
  continuityToken: string;
};

export async function processMatchedFile(options: {
  root: DiscoveryRootConfig;
  filePath: string;
  selection: RegistrySelection;
  discoveryPhase: DiscoveryPhase;
  discoveryEventType: Extract<DiscoveryEventType, "file.changed" | "file.discovered">;
  serviceOptions: SessionIngestServiceOptions;
}): Promise<void> {
  const { root, filePath, selection, discoveryPhase, discoveryEventType, serviceOptions } = options;
  const source: ObservedEventSource = {
    provider: root.provider,
    kind: selection.match.kind,
    discoveryPhase,
    rootPath: root.path,
    filePath,
    metadata: selection.match.metadata,
  };

  await serviceOptions.onDiscoveryEvent?.({
    type: discoveryEventType,
    provider: root.provider,
    rootPath: root.path,
    filePath,
    discoveryPhase,
  });

  const cursorKey: IngestCursorKey = {
    provider: root.provider,
    rootPath: root.path,
    filePath,
  };
  const storedCursor = (await serviceOptions.cursorStore?.get(cursorKey)) ?? null;
  const fileState = await readSourceFileState(filePath, storedCursor);

  if (!fileState) {
    await serviceOptions.onWarning?.({
      code: "file-open-failed",
      message: "File disappeared or is no longer readable",
      provider: root.provider,
      filePath,
      source,
    });
    return;
  }

  const recovery = resolveCursorRecovery({
    storedCursor,
    fileState,
    source,
  });

  for (const warning of recovery.warnings) {
    await serviceOptions.onWarning?.(warning);
  }

  if (recovery.skip) {
    return;
  }

  const preParseContinuity = await capturePreParseContinuity({
    cursor: recovery.cursor,
    filePath,
    fileState,
    source,
    serviceOptions,
  });

  let latestCursor = recovery.cursor;
  let shouldClearStoredCursor = storedCursor !== null && recovery.cursor === null;
  let parseError: unknown = null;
  let consumerError: unknown = null;
  let records: AsyncIterable<ObservedIngestRecord> | null = null;

  try {
    records = await selection.registry.parseFile({
      root,
      filePath,
      discoveryPhase,
      cursor: recovery.cursor,
      match: selection.match,
    });
  } catch (error) {
    parseError = error;
  }

  if (records) {
    const consumption = await consumeParsedRecords({
      initialCursor: recovery.cursor,
      records,
      onRecord: async (record) => {
        await dispatchObservedRecord(serviceOptions, record);
      },
    });

    latestCursor = consumption.latestCursor;
    parseError = consumption.parseError;
    consumerError = consumption.consumerError;
    shouldClearStoredCursor = shouldClearStoredCursor && latestCursor === null;
  }

  if (parseError) {
    await serviceOptions.onWarning?.({
      code: "parse-failed",
      message: "Registry parser failed while processing the file",
      provider: root.provider,
      filePath,
      source,
      cause: parseError,
    });
  }

  const persistedCursor = latestCursor
    ? await buildPersistedCursor({
        cursor: latestCursor,
        filePath,
        preParseContinuity,
        preParseState: fileState,
        source,
        serviceOptions,
      })
    : null;

  if (persistedCursor) {
    await serviceOptions.cursorStore?.set(persistedCursor);
  } else if (shouldClearStoredCursor) {
    await serviceOptions.cursorStore?.delete(cursorKey);
  }

  if (parseError) {
    return;
  }

  if (consumerError) {
    throw consumerError;
  }
}

async function buildPersistedCursor(options: {
  cursor: IngestCursor;
  preParseContinuity: ContinuityCheckpoint | null | undefined;
  filePath: string;
  preParseState: SourceFileState;
  source: ObservedEventSource;
  serviceOptions: SessionIngestServiceOptions;
}): Promise<IngestCursor | null> {
  if (options.preParseContinuity === undefined) {
    return null;
  }

  const postParseState = await readSourceFileState(options.filePath, options.cursor);

  if (!postParseState) {
    await options.serviceOptions.onWarning?.({
      code: "file-open-failed",
      message: "File disappeared or is no longer readable while updating the cursor",
      provider: options.source.provider,
      filePath: options.source.filePath,
      source: options.source,
    });
    return null;
  }

  const preParseContinuityMatches = await doesPreParseContinuityMatch({
    filePath: options.filePath,
    preParseContinuity: options.preParseContinuity,
    preParseState: options.preParseState,
    source: options.source,
    serviceOptions: options.serviceOptions,
  });

  if (preParseContinuityMatches === null) {
    return null;
  }

  if (
    postParseState.fingerprint !== options.preParseState.fingerprint
    || postParseState.revision !== options.preParseState.revision
    || options.cursor.byteOffset > postParseState.size
    || (options.cursor.byteOffset > 0 && !postParseState.continuityToken)
    || !preParseContinuityMatches
  ) {
    await options.serviceOptions.onWarning?.({
      code: "cursor-reset",
      message: "File changed while parsing; not persisting the cursor",
      provider: options.source.provider,
      filePath: options.source.filePath,
      source: options.source,
    });
    return null;
  }

  return {
    ...options.cursor,
    fingerprint: postParseState.fingerprint,
    continuityToken: postParseState.continuityToken ?? undefined,
    updatedAt: new Date().toISOString(),
    metadata: {
      ...options.cursor.metadata,
      modifiedAtMs: postParseState.modifiedAtMs,
    },
  };
}

async function doesPreParseContinuityMatch(options: {
  filePath: string;
  preParseContinuity: ContinuityCheckpoint | null;
  preParseState: SourceFileState;
  source: ObservedEventSource;
  serviceOptions: SessionIngestServiceOptions;
}): Promise<boolean | null> {
  if (!options.preParseContinuity || options.preParseContinuity.byteOffset <= 0) {
    return true;
  }

  if (!options.preParseContinuity.continuityToken) {
    return false;
  }

  const postParseCheckpointState = await readSourceFileState(options.filePath, {
    byteOffset: options.preParseContinuity.byteOffset,
  });

  if (!postParseCheckpointState) {
    await options.serviceOptions.onWarning?.({
      code: "file-open-failed",
      message: "File disappeared or is no longer readable while updating the cursor",
      provider: options.source.provider,
      filePath: options.source.filePath,
      source: options.source,
    });
    return null;
  }

  return (
    postParseCheckpointState.fingerprint === options.preParseState.fingerprint
    && postParseCheckpointState.continuityToken === options.preParseContinuity.continuityToken
  );
}

async function capturePreParseContinuity(options: {
  cursor: IngestCursor | null;
  filePath: string;
  fileState: SourceFileState;
  source: ObservedEventSource;
  serviceOptions: SessionIngestServiceOptions;
}): Promise<ContinuityCheckpoint | null | undefined> {
  if (options.cursor && options.cursor.byteOffset > 0) {
    if (!options.fileState.continuityToken) {
      return undefined;
    }

    return {
      byteOffset: options.cursor.byteOffset,
      continuityToken: options.fileState.continuityToken,
    };
  }

  if (options.fileState.size <= 0) {
    return null;
  }

  const endOfFileState = await readSourceFileState(options.filePath, {
    byteOffset: options.fileState.size,
  });

  if (!endOfFileState?.continuityToken) {
    await options.serviceOptions.onWarning?.({
      code: "file-open-failed",
      message: "File disappeared or is no longer readable while capturing the pre-parse continuity checkpoint",
      provider: options.source.provider,
      filePath: options.source.filePath,
      source: options.source,
    });
    return undefined;
  }

  return {
    byteOffset: options.fileState.size,
    continuityToken: endOfFileState.continuityToken,
  };
}
