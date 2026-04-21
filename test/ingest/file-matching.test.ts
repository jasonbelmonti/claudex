import { expect, test } from "#test-support";

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

test("matchesDiscoveryRootFilters preserves escaped literal metacharacters", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["report\\[2026\\].jsonl"],
      },
      "/tmp/root/nested/report[2026].jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["report\\[2026\\].jsonl"],
      },
      "/tmp/root/nested/reportx2026x.jsonl",
    ),
  ).toBe(false);
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

test("matchesDiscoveryRootFilters preserves literal closing brackets in character classes", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[]].jsonl"],
      },
      "/tmp/root/nested/file-].jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[]].jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(false);
});

test("matchesDiscoveryRootFilters supports bang-negated character classes", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[!ab].jsonl"],
      },
      "/tmp/root/nested/file-c.jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[!ab].jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(false);
});

test("matchesDiscoveryRootFilters supports caret-negated character classes", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[^ab].jsonl"],
      },
      "/tmp/root/nested/file-c.jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[^ab].jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(false);
});

test("matchesDiscoveryRootFilters treats malformed character class ranges as non-matches", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[z-a].jsonl"],
      },
      "/tmp/root/nested/file-c.jsonl",
    ),
  ).toBe(false);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["**/*.jsonl"],
        exclude: ["file-[z-a].jsonl"],
      },
      "/tmp/root/nested/file-c.jsonl",
    ),
  ).toBe(true);
});

test("matchesDiscoveryRootFilters keeps embedded double-stars within one segment", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["foo/**.jsonl"],
      },
      "/tmp/root/foo/bar.jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["foo/**.jsonl"],
      },
      "/tmp/root/foo/x/bar.jsonl",
    ),
  ).toBe(false);
});

test("matchesDiscoveryRootFilters does not treat character-class patterns as literal bracket filenames", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["[ab].jsonl"],
      },
      "/tmp/root/nested/a.jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["[ab].jsonl"],
      },
      "/tmp/root/nested/[ab].jsonl",
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

test("matchesDiscoveryRootFilters supports single-item brace groups", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["*.{jsonl}"],
      },
      "/tmp/root/nested/transcript.jsonl",
    ),
  ).toBe(true);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["*.{jsonl}"],
      },
      "/tmp/root/nested/transcript.txt",
    ),
  ).toBe(false);
});

test("matchesDiscoveryRootFilters treats empty negated character classes as non-matches", () => {
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[!].jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(false);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["file-[^].jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(false);
  expect(
    matchesDiscoveryRootFilters(
      {
        ...root,
        include: ["**/*.jsonl"],
        exclude: ["file-[!].jsonl"],
      },
      "/tmp/root/nested/file-a.jsonl",
    ),
  ).toBe(true);
});
