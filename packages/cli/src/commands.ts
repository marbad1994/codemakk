import type { CommandDefinition, Suggestion } from "./types.js";

export const commands: CommandDefinition[] = [
  {
    name: "/help",
    usage: "/help",
    description: "Show available commands",
    group: "General"
  },
  {
    name: "/show",
    usage: "/show",
    description: "Show contextual command reminders",
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
    name: "/models",
    usage: "/models",
    description: "Open router model registry manager",
    group: "Routing"
  },
  {
    name: "/profile",
    usage: "/profile <balanced|deep|fast|free-first>",
    description: "Set router profile manually",
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
    name: "/projects",
    usage: "/projects",
    description: "List codemakk projects",
    group: "Projects"
  },
  {
    name: "/project",
    usage: "/project <id>",
    description: "Show project details",
    group: "Projects"
  },
  {
    name: "/plan",
    usage: "/plan new|<id>|list",
    description: "Plan a project",
    group: "Projects"
  },
  {
    name: "/design",
    usage: "/design <id>",
    description: "Design UX/mockups for a project",
    group: "Projects"
  },
  {
    name: "/build",
    usage: "/build <id> [slice]",
    description: "Build project slice into proposals",
    group: "Projects"
  },
  {
    name: "/open",
    usage: "/open <id> [mockup]",
    description: "Open project mockup in browser",
    group: "Projects"
  },
  {
    name: "/done",
    usage: "/done",
    description: "Finish planning mode and save the project plan",
    group: "Workflow"
  },
  {
    name: "/approve",
    usage: "/approve",
    description: "Approve design mode and save design/mockups",
    group: "Workflow"
  },
  {
    name: "/cancel",
    usage: "/cancel",
    description: "Leave the current workflow submode",
    group: "Workflow"
  },
  {
    name: "/create",
    usage: "/create",
    description: "Enable file-create mode for the next prompt",
    group: "Edits"
  },
  {
    name: "/review",
    usage: "/review",
    description: "Review proposed file changes",
    group: "Edits"
  },
  {
    name: "/proposals",
    usage: "/proposals",
    description: "List proposed file changes",
    group: "Edits"
  },
  {
    name: "/comment",
    usage: "/comment <number> <comment>",
    description: "Add revision comment to a proposal",
    group: "Edits"
  },
  {
    name: "/revise",
    usage: "/revise",
    description: "Send commented proposals back for revision",
    group: "Edits"
  },
  {
    name: "/apply",
    usage: "/apply",
    description: "Apply accepted proposals",
    group: "Edits"
  },
  {
    name: "/diff",
    usage: "/diff",
    description: "Open review in diff mode",
    group: "Edits"
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
