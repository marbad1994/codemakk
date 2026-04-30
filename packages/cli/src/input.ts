import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import type { AppState, Suggestion } from "./types.js";
import { getCommandSuggestions } from "./commands.js";
import { getFileSuggestions, getAtToken } from "./filePicker.js";
import { clearLines } from "./terminal.js";
import { renderPrompt, formatFinalPromptLine } from "./render.js";

const KEY = {
  ENTER_CR: "\r",
  ENTER_LF: "\n",
  BACKSPACE: "\x7f",
  CTRL_H: "\x08",
  TAB: "\t",
  ESC: "\x1b",
  UP: "\x1b[A",
  DOWN: "\x1b[B",
  CTRL_C: "\x03",
  CTRL_D: "\x04",
  PASTE_START: "\x1b[200~",
  PASTE_END: "\x1b[201~"
};

const immediateCommands = new Set([
  "/help",
  "/cancel",
  "/approve",
  "/done",
  "/show",
  "/config",
  "/mode",
  "/models",
  "/speed",
  "/skills",
  "/context",
  "/clear",
  "/count",
  "/stats",
  "/stats-model",
  "/stats-recent",
  "/stats-largest",
  "/projects",
  "/create",
  "/review",
  "/proposals",
  "/revise",
  "/diff",
  "/apply",
  "/exit",
  "/quit"
]);

let lastExitKeypressAt = 0;

function shouldExitAfterDoubleTap(): boolean {
  const now = Date.now();

  if (now - lastExitKeypressAt < 1500) {
    return true;
  }

  lastExitKeypressAt = now;
  return false;
}

async function getSuggestions(value: string): Promise<Suggestion[]> {
  if (value.startsWith("/")) {
    return getCommandSuggestions(value);
  }

  return getFileSuggestions(value);
}

function shouldAcceptCommandSuggestion(value: string): boolean {
  if (!value.startsWith("/")) {
    return false;
  }

  const parts = value.trim().split(/\s+/);
  return parts.length <= 1;
}

function applySuggestion(value: string, suggestion: Suggestion): string {
  if (suggestion.type === "command") {
    return `${suggestion.command.name} `;
  }

  const token = getAtToken(value);

  if (!token) {
    return value;
  }

  return `${value.slice(0, token.start)}@${suggestion.filePath}${value.slice(token.end)}`;
}

function commandShouldRunImmediately(suggestion: Suggestion): boolean {
  return suggestion.type === "command" && immediateCommands.has(suggestion.command.name);
}

function normalizePastedText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isPrintableText(text: string): boolean {
  if (!text) {
    return false;
  }

  if (text.startsWith("\x1b")) {
    return false;
  }

  if (text === KEY.CTRL_C || text === KEY.CTRL_D) {
    return false;
  }

  return true;
}

function splitIncomingData(chunk: string): string[] {
  const tokens: string[] = [];
  let rest = chunk;

  while (rest.length > 0) {
    if (rest.startsWith(KEY.PASTE_START)) {
      tokens.push(KEY.PASTE_START);
      rest = rest.slice(KEY.PASTE_START.length);
      continue;
    }

    if (rest.startsWith(KEY.PASTE_END)) {
      tokens.push(KEY.PASTE_END);
      rest = rest.slice(KEY.PASTE_END.length);
      continue;
    }

    if (rest.startsWith(KEY.UP)) {
      tokens.push(KEY.UP);
      rest = rest.slice(KEY.UP.length);
      continue;
    }

    if (rest.startsWith(KEY.DOWN)) {
      tokens.push(KEY.DOWN);
      rest = rest.slice(KEY.DOWN.length);
      continue;
    }

    const first = rest[0]!;

    if (
      first === KEY.ENTER_CR ||
      first === KEY.ENTER_LF ||
      first === KEY.BACKSPACE ||
      first === KEY.CTRL_H ||
      first === KEY.TAB ||
      first === KEY.ESC ||
      first === KEY.CTRL_C ||
      first === KEY.CTRL_D
    ) {
      tokens.push(first);
      rest = rest.slice(1);
      continue;
    }

    const nextSpecialIndexes = [
      rest.indexOf(KEY.PASTE_START),
      rest.indexOf(KEY.PASTE_END),
      rest.indexOf(KEY.UP),
      rest.indexOf(KEY.DOWN),
      rest.search(/[\r\n\x7f\x08\t\x1b\x03\x04]/)
    ].filter((index) => index > 0);

    const nextSpecial =
      nextSpecialIndexes.length === 0 ? -1 : Math.min(...nextSpecialIndexes);

    if (nextSpecial === -1) {
      tokens.push(rest);
      rest = "";
    } else {
      tokens.push(rest.slice(0, nextSpecial));
      rest = rest.slice(nextSpecial);
    }
  }

  return tokens;
}

export async function readInteractiveLine(
  state: AppState,
  prompt = "codemakk › "
): Promise<string> {
  if (input.isTTY) {
    input.setRawMode(true);
  }

  input.resume();
  input.setEncoding("utf8");

  output.write("\x1b[?2004h"); // enable bracketed paste

  let value = "";
  let selectedSuggestion = 0;
  let renderedSuggestionLines = 0;
  let suggestions: Suggestion[] = [];

  let isPasting = false;
  let pasteBuffer = "";

  async function rerender(): Promise<void> {
    clearLines(renderedSuggestionLines);

    suggestions = await getSuggestions(value);

    if (selectedSuggestion >= suggestions.length) {
      selectedSuggestion = Math.max(0, suggestions.length - 1);
    }

    renderedSuggestionLines = renderPrompt({
      prompt,
      value,
      suggestions,
      selectedSuggestion,
      state
    });
  }

  await rerender();

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (line: string): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      output.write("\n");
      resolve(line.trim());
    };

    const onData = (chunk: string) => {
      void (async () => {
        const tokens = splitIncomingData(chunk);

        for (const token of tokens) {
          if (resolved) {
            return;
          }

          if (token === KEY.PASTE_START) {
            isPasting = true;
            pasteBuffer = "";
            continue;
          }

          if (token === KEY.PASTE_END) {
            isPasting = false;
            value += normalizePastedText(pasteBuffer);
            pasteBuffer = "";
            selectedSuggestion = 0;
            await rerender();
            continue;
          }

          if (isPasting) {
            pasteBuffer += token;
            continue;
          }

          if (token === KEY.CTRL_C || token === KEY.CTRL_D) {
            if (shouldExitAfterDoubleTap()) {
              cleanup();
              output.write("\n");
              process.exit(0);
            }

            output.write(chalk.yellow("\nPress Ctrl+C or Ctrl+D again to exit.\n"));
            await rerender();
            continue;
          }

          if (token === KEY.ENTER_CR || token === KEY.ENTER_LF) {
            if (
              suggestions.length > 0 &&
              value.startsWith("/") &&
              shouldAcceptCommandSuggestion(value) &&
              suggestions[selectedSuggestion]
            ) {
              const suggestion = suggestions[selectedSuggestion]!;

              if (commandShouldRunImmediately(suggestion)) {
                const commandName =
                  suggestion.type === "command" ? suggestion.command.name : value.trim();

                value = commandName;
                finish(commandName);
                return;
              }

              value = applySuggestion(value, suggestion);
              selectedSuggestion = 0;
              await rerender();
              continue;
            }
            if (
              suggestions.length > 0 &&
              suggestions[selectedSuggestion]?.type === "file"
            ) {
              value = applySuggestion(value, suggestions[selectedSuggestion]!);
              selectedSuggestion = 0;
              await rerender();
              continue;
            }
            finish(value);
            return;
          }

          if (token === KEY.TAB) {
            if (suggestions.length > 0 && suggestions[selectedSuggestion]) {
              const suggestion = suggestions[selectedSuggestion]!;

              if (commandShouldRunImmediately(suggestion)) {
                const commandName =
                  suggestion.type === "command" ? suggestion.command.name : value.trim();

                value = commandName;
                finish(commandName);
                return;
              }

              value = applySuggestion(value, suggestion);
              selectedSuggestion = 0;
              await rerender();
            }

            continue;
          }

          if (token === KEY.UP) {
            if (suggestions.length > 0) {
              selectedSuggestion =
                selectedSuggestion <= 0 ? suggestions.length - 1 : selectedSuggestion - 1;

              await rerender();
            }

            continue;
          }

          if (token === KEY.DOWN) {
            if (suggestions.length > 0) {
              selectedSuggestion =
                selectedSuggestion >= suggestions.length - 1 ? 0 : selectedSuggestion + 1;

              await rerender();
            }

            continue;
          }

          if (token === KEY.BACKSPACE || token === KEY.CTRL_H) {
            value = value.slice(0, -1);
            selectedSuggestion = 0;
            await rerender();
            continue;
          }

          if (token === KEY.ESC) {
            value = "";
            selectedSuggestion = 0;
            await rerender();
            continue;
          }

          if (isPrintableText(token)) {
            value += normalizePastedText(token);
            selectedSuggestion = 0;
            await rerender();
          }
        }
      })().catch((error) => {
        cleanup();
        console.error(error);
        resolve("");
      });
    };

    function cleanup(): void {
      output.write("\x1b[?2004l"); // disable bracketed paste
      input.off("data", onData);

      if (input.isTTY) {
        input.setRawMode(false);
      }

      clearLines(renderedSuggestionLines);
      output.write(formatFinalPromptLine(state, prompt, value));
    }

    input.on("data", onData);
  });
}
