import type { ProviderId } from "../core/provider";

export type IngestCursorKey = {
  provider: ProviderId;
  rootPath: string;
  filePath: string;
};

export type IngestCursor = IngestCursorKey & {
  byteOffset: number;
  line: number;
  fingerprint?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export interface CursorStore {
  get(key: IngestCursorKey): Promise<IngestCursor | null>;
  set(cursor: IngestCursor): Promise<void>;
  delete(key: IngestCursorKey): Promise<void>;
}
