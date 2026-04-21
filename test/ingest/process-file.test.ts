import { expect, test } from "bun:test";
import { join } from "node:path";

import type {
  DiscoveryRootConfig,
  IngestCursor,
  IngestWarning,
  ObservedEventSource,
  SessionIngestServiceOptions,
} from "@jasonbelmonti/claudex/ingest";

import { __internal, processMatchedFile } from "../../src/ingest/process-file.js";
import type { RegistrySelection } from "../../src/ingest/registry-selection.js";
import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createRegistry,
  deleteFile,
  removeFixtureWorkspace,
} from "./helpers.js";

function createSelection(
  root: DiscoveryRootConfig,
  matchMetadata?: Record<string, unknown>,
): RegistrySelection {
  const registry = createRegistry({
    provider: root.provider,
    matchExtension: ".jsonl",
    recordFactory(context) {
      return [
        createObservedEventRecord({
          provider: root.provider,
          filePath: context.filePath,
          root: context.root,
          sessionId: "session-process-file",
          cursor: {
            provider: root.provider,
            rootPath: context.root.path,
            filePath: context.filePath,
            byteOffset: Number(Bun.file(context.filePath).size),
            line: 1,
          },
        }),
      ];
    },
  });

  return {
    registry,
    match: matchMetadata
      ? {
          kind: "transcript",
          metadata: matchMetadata,
        }
      : {
          kind: "transcript",
        },
  };
}

function createSource(root: DiscoveryRootConfig, filePath: string): ObservedEventSource {
  return {
    provider: root.provider,
    kind: "transcript",
    discoveryPhase: "initial_scan",
    rootPath: root.path,
    filePath,
  };
}

test("processMatchedFile persists zero-offset cursors for empty files", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/empty.jsonl": "",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(root.path, "empty.jsonl");
    const warnings: IngestWarning[] = [];
    let persistedCursor: IngestCursor | null = null;

    const selection = {
      ...createSelection(root),
      registry: createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        recordFactory(context) {
          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-empty",
              cursor: {
                provider: "claude",
                rootPath: context.root.path,
                filePath: context.filePath,
                byteOffset: 0,
                line: 0,
              },
            }),
          ];
        },
      }),
    } satisfies RegistrySelection;

    const serviceOptions = {
      roots: [root],
      registries: [selection.registry],
      cursorStore: {
        async get() {
          return null;
        },
        async set(cursor) {
          persistedCursor = cursor;
        },
        async delete() {
          persistedCursor = null;
        },
      },
      onWarning(warning) {
        warnings.push(warning);
      },
    } satisfies SessionIngestServiceOptions;

    await processMatchedFile({
      root,
      filePath,
      selection,
      discoveryPhase: "initial_scan",
      discoveryEventType: "file.discovered",
      serviceOptions,
    });

    expect(warnings).toEqual([]);
    if (!persistedCursor) {
      throw new Error("Expected an empty-file cursor to be persisted");
    }

    const confirmedPersistedCursor: IngestCursor = persistedCursor;

    expect(confirmedPersistedCursor).toMatchObject({
      provider: "claude",
      filePath,
      byteOffset: 0,
      line: 0,
    });
    expect(confirmedPersistedCursor.fingerprint).toBeDefined();
    expect(confirmedPersistedCursor.continuityToken).toBeUndefined();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("processMatchedFile preserves root-only, match-only, and merged metadata in warnings", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/disappeared.jsonl": "gone soon\n",
  });

  try {
    const cases = [
      {
        rootMetadata: { lane: "root-only" },
        matchMetadata: undefined,
        expectedMetadata: { lane: "root-only" },
      },
      {
        rootMetadata: undefined,
        matchMetadata: { artifact: "match-only" },
        expectedMetadata: { artifact: "match-only" },
      },
      {
        rootMetadata: { lane: "root", shared: "root" },
        matchMetadata: { artifact: "match", shared: "match" },
        expectedMetadata: {
          lane: "root",
          artifact: "match",
          shared: "match",
        },
      },
    ] as const;

    for (const testCase of cases) {
      const root = {
        provider: "claude" as const,
        path: join(workspace, "claude"),
        metadata: testCase.rootMetadata,
      };
      const filePath = join(root.path, "disappeared.jsonl");
      const warnings: IngestWarning[] = [];
      const selection = createSelection(root, testCase.matchMetadata);

      await Bun.write(filePath, "gone soon\n");
      await deleteFile(filePath);

      await processMatchedFile({
        root,
        filePath,
        selection,
        discoveryPhase: "initial_scan",
        discoveryEventType: "file.discovered",
        serviceOptions: {
          roots: [root],
          registries: [selection.registry],
          onWarning(warning) {
            warnings.push(warning);
          },
        },
      });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        code: "file-open-failed",
        source: {
          provider: "claude",
          kind: "transcript",
          filePath,
          metadata: testCase.expectedMetadata,
        },
      });
    }
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("capturePreParseContinuity returns undefined when an active cursor cannot provide continuity state", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/no-continuity.jsonl": "abcdef",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(root.path, "no-continuity.jsonl");

    const result = await __internal.capturePreParseContinuity({
      cursor: {
        provider: "claude",
        rootPath: root.path,
        filePath,
        byteOffset: 3,
        line: 1,
      },
      filePath,
      fileState: {
        size: 6,
        fingerprint: "1:2",
        continuityToken: null,
        modifiedAtMs: 1,
      },
      source: createSource(root, filePath),
      serviceOptions: {
        roots: [root],
        registries: [],
      },
    });

    expect(result).toBeUndefined();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("capturePreParseContinuity warns when the EOF checkpoint can no longer be read", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/eof-checkpoint.jsonl": "abcdef",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(root.path, "eof-checkpoint.jsonl");
    const warnings: IngestWarning[] = [];

    await deleteFile(filePath);

    const result = await __internal.capturePreParseContinuity({
      cursor: null,
      filePath,
      fileState: {
        size: 6,
        fingerprint: "1:2",
        continuityToken: null,
        modifiedAtMs: 1,
      },
      source: createSource(root, filePath),
      serviceOptions: {
        roots: [root],
        registries: [],
        onWarning(warning) {
          warnings.push(warning);
        },
      },
    });

    expect(result).toBeUndefined();
    expect(warnings.map((warning) => warning.code)).toEqual([
      "file-open-failed",
    ]);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("doesPreParseContinuityMatch rejects checkpoints without continuity tokens", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/checkpoint.jsonl": "abcdef",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(root.path, "checkpoint.jsonl");

    const result = await __internal.doesPreParseContinuityMatch({
      filePath,
      preParseContinuity: {
        byteOffset: 6,
        continuityToken: "",
      },
      preParseState: {
        size: 6,
        fingerprint: "1:2",
        continuityToken: null,
        modifiedAtMs: 1,
      },
      source: createSource(root, filePath),
      serviceOptions: {
        roots: [root],
        registries: [],
      },
    });

    expect(result).toBe(false);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("doesPreParseContinuityMatch warns when the checkpoint file disappears", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/checkpoint-gone.jsonl": "abcdef",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(root.path, "checkpoint-gone.jsonl");
    const warnings: IngestWarning[] = [];

    await deleteFile(filePath);

    const result = await __internal.doesPreParseContinuityMatch({
      filePath,
      preParseContinuity: {
        byteOffset: 6,
        continuityToken: "token-6",
      },
      preParseState: {
        size: 6,
        fingerprint: "1:2",
        continuityToken: null,
        modifiedAtMs: 1,
      },
      source: createSource(root, filePath),
      serviceOptions: {
        roots: [root],
        registries: [],
        onWarning(warning) {
          warnings.push(warning);
        },
      },
    });

    expect(result).toBeNull();
    expect(warnings.map((warning) => warning.code)).toEqual([
      "file-open-failed",
    ]);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("buildPersistedCursor returns null when no pre-parse continuity checkpoint exists", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/no-checkpoint.jsonl": "abcdef",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(root.path, "no-checkpoint.jsonl");

    const result = await __internal.buildPersistedCursor({
      cursor: {
        provider: "claude",
        rootPath: root.path,
        filePath,
        byteOffset: 6,
        line: 1,
      },
      preParseContinuity: undefined,
      filePath,
      preParseState: {
        size: 6,
        fingerprint: "1:2",
        continuityToken: "token-6",
        modifiedAtMs: 1,
      },
      source: createSource(root, filePath),
      serviceOptions: {
        roots: [root],
        registries: [],
      },
    });

    expect(result).toBeNull();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("processMatchedFile warns and skips cursor persistence when the file disappears after parsing", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/disappear.jsonl": "hello\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(root.path, "disappear.jsonl");
    const warnings: IngestWarning[] = [];
    let persistedCursor: IngestCursor | null = null;
    let deleted = false;
    const selection = createSelection(root);

    const serviceOptions = {
      roots: [root],
      registries: [selection.registry],
      cursorStore: {
        async get() {
          return null;
        },
        async set(cursor) {
          persistedCursor = cursor;
        },
        async delete() {
          persistedCursor = null;
        },
      },
      async onObservedEvent() {
        if (deleted) {
          return;
        }

        deleted = true;
        await deleteFile(filePath);
      },
      onWarning(warning) {
        warnings.push(warning);
      },
    } satisfies SessionIngestServiceOptions;

    await processMatchedFile({
      root,
      filePath,
      selection,
      discoveryPhase: "initial_scan",
      discoveryEventType: "file.discovered",
      serviceOptions,
    });

    expect(persistedCursor).toBeNull();
    expect(warnings.map((warning) => warning.code)).toEqual([
      "file-open-failed",
    ]);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});
