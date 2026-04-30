export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type RouterProfile =
  | "balanced"
  | "deep"
  | "fast"
  | "free-first";

export type RouterChatRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  profile?: RouterProfile;
  speed?: number;
  localPreference?: boolean;
  signal?: AbortSignal;
};

export type RouterChatChunk = {
  content: string;
  model?: string;
  usedModel?: string;
  requestedModel?: string;
  raw?: unknown;
};

export type RouterChatResponse = {
  content: string;
  raw?: unknown;
};
