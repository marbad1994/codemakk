export type ContextFile = {
  path: string;
  content: string;
  chars: number;
  estimatedTokens: number;
};

export type BuiltContext = {
  files: ContextFile[];
  totalChars: number;
  estimatedTokens: number;
};
