import type { CommandDefinition, Suggestion } from "./types.js";

export const commands: CommandDefinition[] = [
  {
    name: "/help",
    usage: "/help",
    description: "Show available commands",
    group: "General"
  },
  {
    name: "/config",
    usage: "/config",
    description: "View/edit codemakk environment config",
    group: "General"
  },
    {
  name: "/mode",
  usage: "/mode",
  description: "Select routing mode",
  group: "Routing"
},
  {
    name: "/model",
    usage: "/model <model>",
    description: "Set model, e.g. auto-cline or gpt55",
    group: "Routing"
  },
  {
    name: "/profile",
    usage: "/profile <balanced|deep|fast|free-first>",
    description: "Set router profile",
    group: "Routing"
  },
  {
    name: "/speed",
    usage: "/speed",
    description: "Open speed selector",
    group: "Routing"
  },
  {
    name: "/ask",
    usage: "/ask <prompt>",
    description: "Send a prompt to the router",
    group: "Prompt"
  },
  {
    name: "/session",
    usage: "/session new <name>",
    description: "Session command placeholder",
    group: "Session"
  },
  {
    name: "/skills",
    usage: "/skills",
    description: "Open skills menu",
    group: "Skills"
  },
  {
    name: "/context",
    usage: "/context",
    description: "Show selected context files",
    group: "Context"
  },
  {
    name: "/remove",
    usage: "/remove <file>",
    description: "Remove file from context",
    group: "Context"
  },
  {
    name: "/clear",
    usage: "/clear",
    description: "Clear selected context files",
    group: "Context"
  },
  {
    name: "/count",
    usage: "/count",
    description: "Estimate tokens for current context",
    group: "Stats"
  },
  {
    name: "/stats",
    usage: "/stats",
    description: "Show token/run stats overview",
    group: "Stats"
  },
  {
    name: "/stats-model",
    usage: "/stats-model",
    description: "Show stats grouped by model",
    group: "Stats"
  },
  {
    name: "/stats-recent",
    usage: "/stats-recent",
    description: "Show recent model runs",
    group: "Stats"
  },
  {
    name: "/stats-largest",
    usage: "/stats-largest",
    description: "Show largest input runs",
    group: "Stats"
  },
  {
    name: "/diff",
    usage: "/diff",
    description: "Show pending diff placeholder",
    group: "Edits"
  },
  {
    name: "/apply",
    usage: "/apply",
    description: "Apply pending changes placeholder",
    group: "Edits"
  },
  {
    name: "/exit",
    usage: "/exit",
    description: "Exit codemakk",
    group: "General"
  },
  {
    name: "/quit",
    usage: "/quit",
    description: "Exit codemakk",
    group: "General"
  }
];

export function getCommandSuggestions(value: string): Suggestion[] {
  if (!value.startsWith("/")) {
    return [];
  }

  const firstToken = value.split(/\s+/)[0] ?? "";
  const normalized = firstToken.toLowerCase();

  return commands
    .filter((command) => command.name.toLowerCase().startsWith(normalized))
    .map((command) => ({
      type: "command",
      command
    }));
}
