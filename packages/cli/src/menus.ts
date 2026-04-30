import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { clearLines } from "./terminal.js";

let lastExitKeypressAt = 0;

function shouldExitAfterDoubleTap(): boolean {
  const now = Date.now();

  if (now - lastExitKeypressAt < 1500) {
    return true;
  }

  lastExitKeypressAt = now;
  return false;
}

export async function selectMenu<T>(args: {
  title: string;
  items: T[];
  renderItem: (item: T, selected: boolean, index: number) => string;
}): Promise<T | null> {
  readline.emitKeypressEvents(input);

  if (input.isTTY) {
    input.setRawMode(true);
  }

  let selected = 0;
  let renderedLines = 0;

  function render(): void {
    clearLines(renderedLines);

    output.write(`${chalk.bold.cyan(args.title)}\n`);
    renderedLines = 1;

    if (args.items.length === 0) {
      output.write(`${chalk.gray("  No items available")}\n`);
      renderedLines += 1;
      return;
    }

    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i]!;
      output.write(args.renderItem(item, i === selected, i));
      output.write("\n");
      renderedLines += 1;
    }

    output.write(chalk.gray("  ↑/↓ navigate, Enter select, Esc cancel\n"));
    renderedLines += 1;
  }

  render();

  return new Promise((resolve) => {
    const onKeypress = (_str: string, key: readline.Key) => {
      if ((key.ctrl && key.name === "c") || (key.ctrl && key.name === "d")) {
        if (shouldExitAfterDoubleTap()) {
          cleanup();
          output.write("\n");
          process.exit(0);
        }

        output.write(chalk.yellow("\nPress Ctrl+C or Ctrl+D again to exit.\n"));
        render();
        return;
      }

      if (key.name === "escape") {
        cleanup();
        resolve(null);
        return;
      }

      if (key.name === "return") {
        const item = args.items[selected] ?? null;
        cleanup();
        resolve(item);
        return;
      }

      if (key.name === "up") {
        selected =
          selected <= 0
            ? args.items.length - 1
            : selected - 1;
        render();
        return;
      }

      if (key.name === "down") {
        selected =
          selected >= args.items.length - 1
            ? 0
            : selected + 1;
        render();
      }
    };

    function cleanup(): void {
      input.off("keypress", onKeypress);

      if (input.isTTY) {
        input.setRawMode(false);
      }

      clearLines(renderedLines);
    }

    input.on("keypress", onKeypress);
  });
}
