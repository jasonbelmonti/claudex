import { getString, isRecord } from "./normalize-values";

export function extractResponseMessageText(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  const texts = content.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }

    const text = getString(part.text);
    return text ? [text] : [];
  });

  return texts.length > 0 ? texts.join("\n\n") : null;
}

export function extractReasoningSummary(summary: unknown): string | null {
  if (!Array.isArray(summary)) {
    return null;
  }

  const texts = summary.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }

    const text = getString(part.text);
    return text ? [text] : [];
  });

  return texts.length > 0 ? texts.join("\n\n") : null;
}
