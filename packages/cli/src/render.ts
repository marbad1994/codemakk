import chalk from "chalk";
import type { AppState, Suggestion } from "./types.js";

function displayInputValue(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, chalk.gray(" ⏎ "));
}

export function statePrefix(state: AppState): string {
  return [
    chalk.gray("["),
    chalk.gray("mode:"),
    chalk.cyan(state.profile),
    chalk.gray(" speed:"),
    chalk.yellow(String(state.speed)),
    chalk.gray(" model:"),
    chalk.magenta(state.model),
    chalk.gray(" files:"),
    chalk.yellow(String(state.contextFiles.length)),
    state.skill ? `${chalk.gray(" skill:")}${chalk.green(state.skill.name)}` : "",
    state.pendingEdits.length > 0
      ? `${chalk.gray(" edits:")}${chalk.yellow(String(state.pendingEdits.length))}`
      : "",
    chalk.gray("]")
  ].join("");
}

export function renderPrompt(args: {
  prompt: string;
  value: string;
  suggestions: Suggestion[];
  selectedSuggestion: number;
  state: AppState;
}): number {
  const { prompt, value, suggestions, selectedSuggestion, state } = args;

  process.stdout.write(
    `${statePrefix(state)} ${chalk.green(prompt)}${displayInputValue(value)}`
  );

  let renderedLines = 0;

  if (suggestions.length > 0) {
    process.stdout.write("\n");
    renderedLines += 1;

    let lastGroup = "";

    for (let i = 0; i < suggestions.length; i++) {
      const suggestion = suggestions[i]!;
      const selected = i === selectedSuggestion;

      if (suggestion.type === "command") {
        const group = suggestion.command.group;

        if (group !== lastGroup) {
          process.stdout.write(`${chalk.gray("  " + group)}\n`);
          renderedLines += 1;
          lastGroup = group;
        }

        const marker = selected ? chalk.black.bgCyan(" › ") : chalk.gray("   ");

        const usage = selected
          ? chalk.cyanBright.bold(suggestion.command.usage.padEnd(36))
          : chalk.cyan(suggestion.command.usage.padEnd(36));

        const description = selected
          ? chalk.whiteBright(suggestion.command.description)
          : chalk.gray(suggestion.command.description);

        process.stdout.write(`${marker} ${usage} ${description}\n`);
        renderedLines += 1;
        continue;
      }

      if (lastGroup !== "Files") {
        process.stdout.write(`${chalk.gray("  Files")}\n`);
        renderedLines += 1;
        lastGroup = "Files";
      }

      const marker = selected ? chalk.black.bgCyan(" › ") : chalk.gray("   ");

      const icon = suggestion.isDirectory ? chalk.blue("dir ") : chalk.green("file");

      const filePath = suggestion.isDirectory
        ? chalk.blueBright(suggestion.filePath)
        : chalk.white(suggestion.filePath);

      process.stdout.write(`${marker} ${icon} ${filePath}\n`);
      renderedLines += 1;
    }
  }

  return renderedLines;
}

export function formatFinalPromptLine(
  state: AppState,
  prompt: string,
  value: string
): string {
  return `${statePrefix(state)} ${chalk.green(prompt)}${displayInputValue(value)}`;
}
