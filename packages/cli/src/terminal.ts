import readline from "node:readline";
import { stdout as output } from "node:process";

export function clearLines(renderedLines: number): void {
  for (let i = 0; i < renderedLines; i++) {
    readline.moveCursor(output, 0, -1);
    readline.clearLine(output, 0);
  }

  readline.cursorTo(output, 0);
  readline.clearLine(output, 0);
}
