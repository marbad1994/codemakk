export type CommandDefinition = {
  name: string;
  description: string;
  usage: string;
  group: string;
};

export type Skill = {
  name: string;
  description: string;
  filePath: string;
  instructions: string;
  frontmatter: Record<string, unknown>;
};

export type CommandSuggestion = {
  type: "command";
  command: CommandDefinition;
};

export type FileSuggestion = {
  type: "file";
  filePath: string;
  isDirectory: boolean;
};

export type Suggestion = CommandSuggestion | FileSuggestion;

export type AppState = {
  model: string;
  profile: string;
  speed: number;
  localPreference: boolean;
  contextFiles: string[];
  skill: Skill | null;
};
