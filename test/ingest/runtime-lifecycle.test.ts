import { expect, test } from "bun:test";
import { join } from "node:path";

import { createSessionIngestService } from "claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createRegistry,
  removeFixtureWorkspace,
} from "./helpers";

test("start performs an initial scan once until stop is called", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/lifecycle.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
      watch: true,
    };
    const parseCalls: string[] = [];

    const service = createSessionIngestService({
      roots: [root],
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
                sessionId: "session-lifecycle",
              }),
            ];
          },
        }),
      ],
    });

    await service.start();
    await service.start();

    expect(parseCalls).toEqual([join(workspace, "claude", "lifecycle.jsonl")]);

    await service.stop();
    await service.start();

    expect(parseCalls).toEqual([
      join(workspace, "claude", "lifecycle.jsonl"),
      join(workspace, "claude", "lifecycle.jsonl"),
    ]);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});
