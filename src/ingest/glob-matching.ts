import { minimatch } from "minimatch";

const GLOB_MATCHER_CACHE = new Map<string, (value: string) => boolean>();
const MATCHER_OPTIONS = {
  dot: true,
} as const;

export function matchesGlobPattern(pattern: string, value: string): boolean {
  const normalizedValue = value.replaceAll("\\", "/");
  return getGlobMatcher(pattern)(normalizedValue);
}

function getGlobMatcher(pattern: string): (value: string) => boolean {
  const cached = GLOB_MATCHER_CACHE.get(pattern);

  if (cached) {
    return cached;
  }

  const matcher = createGlobMatcher(pattern);
  GLOB_MATCHER_CACHE.set(pattern, matcher);
  return matcher;
}

function createGlobMatcher(pattern: string): (value: string) => boolean {
  try {
    const normalizedPattern = normalizeSingleItemBraceGroups(pattern);
    return (value: string) => minimatch(value, normalizedPattern, MATCHER_OPTIONS);
  } catch {
    return () => false;
  }
}

function normalizeSingleItemBraceGroups(pattern: string): string {
  let normalized = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (!character) {
      continue;
    }

    if (character === "\\") {
      normalized += character;
      const nextCharacter = pattern[index + 1];

      if (nextCharacter) {
        normalized += nextCharacter;
        index += 1;
      }

      continue;
    }

    if (character === "[") {
      const characterClass = readCharacterClass(pattern, index);

      if (characterClass) {
        normalized += characterClass.segment;
        index = characterClass.endIndex;
        continue;
      }
    }

    if (character === "{") {
      const braceExpression = readSingleItemBraceGroup(pattern, index);

      if (braceExpression) {
        normalized += normalizeSingleItemBraceGroups(braceExpression.body);
        index = braceExpression.endIndex;
        continue;
      }
    }

    normalized += character;
  }

  return normalized;
}

function readCharacterClass(
  pattern: string,
  startIndex: number,
): { endIndex: number; segment: string } | null {
  for (let index = startIndex + 1; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (!character) {
      continue;
    }

    if (character === "\\") {
      index += 1;
      continue;
    }

    if (character === "]") {
      return {
        endIndex: index,
        segment: pattern.slice(startIndex, index + 1),
      };
    }
  }

  return null;
}

function readSingleItemBraceGroup(
  pattern: string,
  startIndex: number,
): { body: string; endIndex: number } | null {
  let body = "";
  let depth = 0;
  let hasTopLevelComma = false;

  for (let index = startIndex + 1; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (!character) {
      continue;
    }

    if (character === "\\") {
      body += character;
      const nextCharacter = pattern[index + 1];

      if (nextCharacter) {
        body += nextCharacter;
        index += 1;
      }

      continue;
    }

    if (character === "[") {
      const characterClass = readCharacterClass(pattern, index);

      if (!characterClass) {
        return null;
      }

      body += characterClass.segment;
      index = characterClass.endIndex;
      continue;
    }

    if (character === "{") {
      depth += 1;
      body += character;
      continue;
    }

    if (character === "}") {
      if (depth === 0) {
        return hasTopLevelComma || body.length === 0
          ? null
          : {
              body,
              endIndex: index,
            };
      }

      depth -= 1;
      body += character;
      continue;
    }

    if (character === "," && depth === 0) {
      hasTopLevelComma = true;
    }

    body += character;
  }

  return null;
}
