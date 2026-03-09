export type JsonSchema = Readonly<Record<string, unknown>>;

export type AttachmentSource =
  | {
      type: "path";
      path: string;
    }
  | {
      type: "inline";
      mediaType: string;
      data: Uint8Array;
    }
  | {
      type: "url";
      url: string;
    };

export type TurnAttachment = {
  kind: "image";
  name?: string;
  source: AttachmentSource;
  metadata?: Record<string, unknown>;
};

export type TurnInput = {
  prompt: string;
  attachments?: TurnAttachment[];
  metadata?: Record<string, unknown>;
};

export type TurnOptions = {
  outputSchema?: JsonSchema;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
};
