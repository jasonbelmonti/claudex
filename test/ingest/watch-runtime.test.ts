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

test("start resets lifecycle state after initial scan failures and can be retried", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/start-failure.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    watch: true,
  };
  let failStartup = true;
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
              sessionId: "session-start-failure",
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
    onObservedEvent(record) {
      if (failStartup && record.source.discoveryPhase === "initial_scan") {
        throw new Error("startup failed");
      }
    },
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await expect(service.start()).rejects.toThrow("startup failed");
  expect(discoveryEvents.some((event) => event.type === "watch.started")).toBe(false);

  failStartup = false;

  await service.start();
  await waitForCondition(() =>
    discoveryEvents.some((event) => event.type === "watch.started"),
  );

  await service.stop();

  expect(discoveryEvents.filter((event) => event.type === "watch.started")).toHaveLength(1);
  expect(discoveryEvents.filter((event) => event.type === "watch.stopped")).toHaveLength(1);
});

test("start stops the created watcher when watch.started delivery fails", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/watch-started-failure.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    watch: true,
  };
  const filePath = join(root.path, "watch-started-failure.jsonl");
  const parsePhases: string[] = [];
  let failWatchStarted = true;

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
              sessionId: "session-watch-started-failure",
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
      if (failWatchStarted && event.type === "watch.started") {
        throw new Error("watch.started failed");
      }
    },
  });

  await expect(service.start()).rejects.toThrow("watch.started failed");

  await Bun.write(filePath, "one\ntwo\n");
  await Bun.sleep(120);

  expect(parsePhases).toEqual(["initial_scan"]);

  failWatchStarted = false;
  await service.start();
  await Bun.write(filePath, "one\ntwo\nthree\n");
  await waitForCondition(() => parsePhases.includes("watch"));
  await service.stop();
});

test("stop waits for in-flight startup scans without leaving a watcher behind", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/start-stop-race.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    watch: true,
  };
  const filePath = join(root.path, "start-stop-race.jsonl");
  const parsePhases: string[] = [];
  const discoveryEvents: DiscoveryEvent[] = [];
  const initialScanEntered = createDeferredPromise<void>();
  const initialScanGate = createDeferredPromise<void>();

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        async beforeParse(context) {
          if (context.discoveryPhase !== "initial_scan") {
            return;
          }

          initialScanEntered.resolve();
          await initialScanGate.promise;
        },
        recordFactory(context) {
          parsePhases.push(context.discoveryPhase);

          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-start-stop-race",
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

  const startPromise = service.start();
  await initialScanEntered.promise;

  const stopPromise = service.stop();
  initialScanGate.resolve();

  await Promise.all([startPromise, stopPromise]);

  await Bun.write(filePath, "one\ntwo\n");
  await Bun.sleep(120);

  expect(parsePhases).toEqual(["initial_scan"]);
  expect(discoveryEvents.some((event) => event.type === "watch.started")).toBe(false);
  expect(discoveryEvents.some((event) => event.type === "watch.stopped")).toBe(false);
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

test("watch tick failures stop the watcher instead of retrying forever", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/watch-failure.jsonl": "one\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    watch: true,
  };
  const filePath = join(root.path, "watch-failure.jsonl");
  const discoveryEvents: DiscoveryEvent[] = [];
  const warnings: IngestWarning[] = [];
  let watchFailureCount = 0;

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
              sessionId: "session-watch-failure",
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
    onObservedEvent(record) {
      if (record.source.discoveryPhase === "watch") {
        watchFailureCount += 1;
        throw new Error("watch consumer failed");
      }
    },
    onWarning(warning) {
      warnings.push(warning);
    },
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.start();
  await waitForCondition(() =>
    discoveryEvents.some((event) => event.type === "watch.started"),
  );

  await Bun.write(filePath, "one\ntwo\n");

  await waitForCondition(() =>
    warnings.some((warning) => warning.code === "watch-failed"),
  );

  const failuresAfterStop = watchFailureCount;

  await Bun.sleep(120);

  expect(failuresAfterStop).toBe(1);
  expect(watchFailureCount).toBe(failuresAfterStop);
  expect(discoveryEvents.filter((event) => event.type === "watch.stopped")).toHaveLength(1);

  await Bun.write(filePath, "one\ntwo\nthree\n");
  await Bun.sleep(120);

  expect(watchFailureCount).toBe(failuresAfterStop);
  expect(warnings.filter((warning) => warning.code === "watch-failed")).toHaveLength(1);
});

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

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
