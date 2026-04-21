const GLOB_REGEX_CACHE = new Map<string, RegExp>();
const NEVER_MATCH_REGEX = /$./;
const REGEX_SPECIAL_CHARACTERS = /[|\\{}()[\]^$+?.]/g;

export function matchesGlobPattern(pattern: string, value: string): boolean {
  const normalizedValue = value.replaceAll("\\", "/");
  return getGlobRegex(pattern).test(normalizedValue);
}

function getGlobRegex(pattern: string): RegExp {
  const cached = GLOB_REGEX_CACHE.get(pattern);

  if (cached) {
    return cached;
  }

  const regex = compileGlobRegex(pattern);
  GLOB_REGEX_CACHE.set(pattern, regex);
  return regex;
}

function compileGlobRegex(pattern: string): RegExp {
  try {
    return new RegExp(`^${compilePattern(pattern)}$`);
  } catch {
    return NEVER_MATCH_REGEX;
  }
}

function compilePattern(pattern: string): string {
  const normalizedPattern = pattern.replaceAll("\\", "/");
  let compiled = "";

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    if (normalizedPattern.startsWith("**/", index)) {
      compiled += "(?:.*/)?";
      index += 2;
      continue;
    }

    if (normalizedPattern.startsWith("**", index)) {
      compiled += ".*";
      index += 1;
      continue;
    }

    if (normalizedPattern[index] === "{") {
      const braceExpression = readBraceExpression(normalizedPattern, index);

      if (!braceExpression) {
        compiled += escapeRegexCharacter("{");
        continue;
      }

      compiled += braceExpression.compiled;
      index = braceExpression.endIndex;
      continue;
    }

    if (normalizedPattern[index] === "[") {
      const characterClass = readCharacterClass(normalizedPattern, index);

      if (!characterClass) {
        compiled += escapeRegexCharacter("[");
        continue;
      }

      compiled += characterClass.compiled;
      index = characterClass.endIndex;
      continue;
    }

    const character = normalizedPattern[index];

    if (!character) {
      continue;
    }

    if (character === "*") {
      compiled += "[^/]*";
      continue;
    }

    if (character === "?") {
      compiled += "[^/]";
      continue;
    }

    compiled += escapeRegexCharacter(character);
  }

  return compiled;
}

function readBraceExpression(
  pattern: string,
  startIndex: number,
): { compiled: string; endIndex: number } | null {
  let depth = 0;
  let body = "";

  for (let index = startIndex + 1; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (!character) {
      continue;
    }

    if (character === "{") {
      depth += 1;
      body += character;
      continue;
    }

    if (character === "}") {
      if (depth === 0) {
        const parts = splitBraceAlternatives(body);

        return parts.length > 1
          ? {
              compiled: `(?:${parts.map((part) => compilePattern(part)).join("|")})`,
              endIndex: index,
            }
          : null;
      }

      depth -= 1;
      body += character;
      continue;
    }

    body += character;
  }

  return null;
}

function splitBraceAlternatives(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];

    if (!character) {
      continue;
    }

    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    }

    current += character;
  }

  parts.push(current);
  return parts;
}

function readCharacterClass(
  pattern: string,
  startIndex: number,
): { compiled: string; endIndex: number } | null {
  let body = "";

  for (let index = startIndex + 1; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (!character) {
      continue;
    }

    if (character === "]") {
      if (body.length === 0) {
        return null;
      }

      return {
        compiled: compileCharacterClass(body),
        endIndex: index,
      };
    }

    body += character;
  }

  return null;
}

function compileCharacterClass(body: string): string {
  const prefix =
    body[0] === "!"
      ? "^"
      : body[0] === "^"
        ? "^"
        : "";
  const rawBody = prefix.length > 0 ? body.slice(1) : body;
  const escapedBody = rawBody
    .replaceAll("\\", "\\\\")
    .replaceAll("]", "\\]")
    .replaceAll("/", "\\/");

  return `[${prefix}${escapedBody}]`;
}

function escapeRegexCharacter(character: string): string {
  return character.replace(REGEX_SPECIAL_CHARACTERS, "\\$&");
}
