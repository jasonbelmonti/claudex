import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  DiscoveryEvent,
  IngestCursorKey,
  IngestWarning,
} from "claudex/ingest";
import {
  createInMemoryCursorStore,
  createSessionIngestService,
} from "claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createRegistry,
  deleteFile,
  removeFixtureWorkspace,
  waitForCondition,
} from "./helpers";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)));
});

test("start watches file changes and stop prevents further watch processing", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/live.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    watch: true,
  };
  const filePath = join(root.path, "live.jsonl");
  const parsePhases: string[] = [];
  const discoveryEvents: DiscoveryEvent[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        recordFactory(context) {
          parsePhases.push(context.discoveryPhase);

          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-live",
              discoveryPhase: context.discoveryPhase,
              cursor: {
                provider: "claude",
                rootPath: context.root.path,
                filePath: context.filePath,
                byteOffset: Number(Bun.file(context.filePath).size),
                line: 1,
              },
            }),
          ];
        },
      }),
    ],
    watchIntervalMs: 25,
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.start();

  await waitForCondition(() =>
    parsePhases.includes("initial_scan")
    && discoveryEvents.some((event) => event.type === "watch.started"),
  );

  await Bun.write(filePath, "one\ntwo\n");

  await waitForCondition(() =>
    parsePhases.includes("watch")
    && discoveryEvents.some(
      (event) => event.type === "file.changed" && event.discoveryPhase === "watch",
    ),
  );

  await service.stop();

  const changedEventsBeforeStop = discoveryEvents.filter((event) => event.type === "file.changed").length;

  await Bun.write(filePath, "one\ntwo\nthree\n");
  await Bun.sleep(120);

  expect(discoveryEvents.some((event) => event.type === "watch.stopped")).toBe(true);
  expect(discoveryEvents.filter((event) => event.type === "file.changed")).toHaveLength(
    changedEventsBeforeStop,
  );
});

test("watch-driven deletions emit file.deleted and clear persisted cursors", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/delete.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    watch: true,
  };
  const filePath = join(root.path, "delete.jsonl");
  const cursorKey: IngestCursorKey = {
    provider: "claude",
    rootPath: root.path,
    filePath,
  };
  const cursorStore = createInMemoryCursorStore();
  const discoveryEvents: DiscoveryEvent[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        recordFactory(context) {
          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-delete",
              discoveryPhase: context.discoveryPhase,
              cursor: {
                provider: "claude",
                rootPath: context.root.path,
                filePath: context.filePath,
                byteOffset: Number(Bun.file(context.filePath).size),
                line: 1,
              },
            }),
          ];
        },
      }),
    ],
    cursorStore,
    watchIntervalMs: 25,
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.start();

  await waitForCondition(async () => (await cursorStore.get(cursorKey)) !== null);

  await deleteFile(filePath);

  await waitForCondition(async () => {
    const cursor = await cursorStore.get(cursorKey);

    return cursor === null
      && discoveryEvents.some(
        (event) => event.type === "file.deleted" && event.discoveryPhase === "watch",
      );
  });

  await service.stop();
});

test("reconcileNow detects drift and emits reconcile lifecycle events", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/reconcile.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(root.path, "reconcile.jsonl");
  const parsePhases: string[] = [];
  const discoveryEvents: DiscoveryEvent[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        recordFactory(context) {
          parsePhases.push(context.discoveryPhase);

          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-reconcile",
              discoveryPhase: context.discoveryPhase,
              cursor: {
                provider: "claude",
                rootPath: context.root.path,
                filePath: context.filePath,
                byteOffset: Number(Bun.file(context.filePath).size),
                line: 1,
              },
            }),
          ];
        },
      }),
    ],
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.scanNow();
  await Bun.write(filePath, "one\ntwo\n");
  await service.reconcileNow();

  expect(parsePhases).toEqual(["initial_scan", "reconcile"]);
  expect(discoveryEvents.map((event) => event.type)).toEqual([
    "scan.started",
    "file.discovered",
    "scan.completed",
    "reconcile.started",
    "file.changed",
    "reconcile.completed",
  ]);
  expect(discoveryEvents[4]?.discoveryPhase).toBe("reconcile");
});

test("duplicate and overlapping roots are skipped without double-emitting files", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/nested/live.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const parentRoot = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    recursive: true,
  };
  const childRoot = {
    provider: "claude" as const,
    path: join(workspace, "claude", "nested"),
    recursive: true,
  };
  const parseCalls: string[] = [];
  const warnings: IngestWarning[] = [];
  const discoveryEvents: DiscoveryEvent[] = [];

  const service = createSessionIngestService({
    roots: [childRoot, parentRoot],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        parseCalls,
        recordFactory(context) {
          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-duplicate-root",
              discoveryPhase: context.discoveryPhase,
            }),
          ];
        },
      }),
    ],
    onWarning(warning) {
      warnings.push(warning);
    },
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.scanNow();

  expect(parseCalls).toEqual([join(workspace, "claude", "nested", "live.jsonl")]);
  expect(warnings.map((warning) => warning.code)).toEqual(["duplicate-root"]);
  expect(
    discoveryEvents.some(
      (event) => event.type === "root.skipped" && event.rootPath === childRoot.path,
    ),
  ).toBe(true);
});
