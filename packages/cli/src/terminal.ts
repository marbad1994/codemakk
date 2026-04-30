import readline from "node:readline";
import { stdout as output } from "node:process";

export function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

export function terminalColumns(): number {
  return Math.max(20, output.columns ?? 80);
}

export function visualRows(value: string): number {
  const columns = terminalColumns();
  const plain = stripAnsi(value);

  if (plain.length === 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(plain.length / columns));
}

export function clearLines(renderedLines: number): void {
  for (let i = 0; i < renderedLines; i++) {
    readline.moveCursor(output, 0, -1);
    readline.clearLine(output, 0);
  }

  readline.cursorTo(output, 0);
  readline.clearLine(output, 0);
}
