import { expect, test } from "#test-support";

import {
  createClaudeSnapshotTaskIngestRegistry,
  createClaudeTranscriptIngestRegistry,
} from "../../src/ingest/claude/index.js";
import {
  assertLiveParityReplay,
  replayLiveParityFixture,
} from "./live-parity-helpers.js";

const liveClaudeParityTest = process.env.CLAUDEX_AUDIT_LIVE === "1"
  ? test
  : test.skip;

const CLAUDE_LIVE_PARITY_CASES = [
  {
    title:
      "sanitized live Claude transcript excerpt replays against declared parity expectations",
    fixtureName: "live-transcript-excerpt.jsonl",
    metadataName: "live-transcript-excerpt.fixture.json",
    workspacePath: "claude/live-transcript.jsonl",
    registries: [createClaudeTranscriptIngestRegistry()],
    lane: "live-transcript-parity",
  },
  {
    title:
      "sanitized live Claude snapshot excerpt replays against declared parity expectations",
    fixtureName: "live-snapshot-task-excerpt.json",
    metadataName: "live-snapshot-task-excerpt.fixture.json",
    workspacePath: "claude/live-snapshot-task-excerpt.json",
    registries: [createClaudeSnapshotTaskIngestRegistry()],
    lane: "live-snapshot-parity",
  },
] as const;

for (const parityCase of CLAUDE_LIVE_PARITY_CASES) {
  liveClaudeParityTest(parityCase.title, async () => {
    const result = await replayLiveParityFixture({
      provider: "claude",
      ...parityCase,
    });

    assertLiveParityReplay({
      result,
      scenarioId: "live-claude-replay-parity",
    });

    expect(result.observedEvents[0]?.source.metadata).toEqual({
      lane: parityCase.lane,
    });

    if (parityCase.fixtureName === "live-transcript-excerpt.jsonl") {
      expect(result.observedEvents[0]).toMatchObject({
        event: {
          type: "turn.started",
          input: {
            prompt: "<sanitized user request>",
          },
          extensions: {
            cwd: "/sanitized/worktree",
          },
        },
      });
    }
  });
}
