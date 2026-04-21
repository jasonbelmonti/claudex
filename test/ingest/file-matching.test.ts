import { expect, test } from "bun:test";

import { matchesDiscoveryRootFilters } from "../../src/ingest/file-matching.js";

const root = {
  provider: "claude" as const,
  path: "/tmp/root",
};

test("matchesDiscoveryRootFilters matches basename includes against nested files", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["alpha.jsonl"],
      },
      "/tmp/root/nested/alpha.jsonl",
    ),
  ).toBe(true);
});

test("matchesDiscoveryRootFilters supports recursive glob includes", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["**/*.jsonl"],
      },
      "/tmp/root/nested/path/transcript.jsonl",
    ),
  ).toBe(true);
});

test("matchesDiscoveryRootFilters supports recursive glob excludes", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["**/*.jsonl"],
        exclude: ["special/**/*.jsonl"],
      },
      "/tmp/root/special/nested/transcript.jsonl",
    ),
  ).toBe(false);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["**/*.jsonl"],
        exclude: ["special/**/*.jsonl"],
      },
      "/tmp/root/ordinary/transcript.jsonl",
    ),
  ).toBe(true);
});

test("matchesDiscoveryRootFilters supports single-character wildcards", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-?.jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(true);
});

test("matchesDiscoveryRootFilters supports character classes", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[ab].jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[ab].jsonl"],
      },
      "/tmp/root/nested/file-c.jsonl",
    ),
  ).toBe(false);
});

test("matchesDiscoveryRootFilters supports brace alternation", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["*.{jsonl,json}"],
      },
      "/tmp/root/nested/transcript.jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["*.{jsonl,json}"],
      },
      "/tmp/root/nested/transcript.txt",
    ),
  ).toBe(false);
});
