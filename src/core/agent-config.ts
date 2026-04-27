export type AgentConfig = {
  mcpServers?: Record<string, McpServerDescriptor>;
};

export type McpServerDescriptor =
  | McpStdioServerDescriptor
  | McpHttpServerDescriptor
  | McpSseServerDescriptor;

export type McpStdioServerDescriptor = {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpHttpServerDescriptor = {
  transport: "http";
  url: string;
  headers?: Record<string, string>;
};

export type McpSseServerDescriptor = {
  transport: "sse";
  url: string;
  headers?: Record<string, string>;
};
