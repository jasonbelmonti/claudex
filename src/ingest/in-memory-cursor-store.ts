import type { CursorStore, IngestCursor, IngestCursorKey } from "./cursor";

export function createInMemoryCursorStore(
  initialCursors: IngestCursor[] = [],
): CursorStore {
  const store = new Map(initialCursors.map((cursor) => [toCursorStoreKey(cursor), cursor]));

  return {
    async get(key) {
      return store.get(toCursorStoreKey(key)) ?? null;
    },
    async set(cursor) {
      store.set(toCursorStoreKey(cursor), cursor);
    },
    async delete(key) {
      store.delete(toCursorStoreKey(key));
    },
  };
}

function toCursorStoreKey(key: IngestCursorKey): string {
  return `${key.provider}:${key.rootPath}:${key.filePath}`;
}
