import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import type { AppState, FileProposal } from "./types.js";
import { workingDir } from "./config.js";
import { saveSessionState } from "./session.js";
import { highlight } from "cli-highlight";

const execAsync = promisify(exec);

type ReviewViewMode = "diff" | "original" | "proposal" | "side-by-side";

function languageFromPath(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();

  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".json": "json",
    ".py": "python",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".fish": "bash",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".rb": "ruby",
    ".sql": "sql",
    ".xml": "xml"
  };

  return map[ext];
}

function highlightCodeLines(filePath: string, content: string): string[] {
  const language = languageFromPath(filePath);

  try {
    return highlight(content, {
      language,
      ignoreIllegals: true
    }).split(/\r?\n/);
  } catch {
    return content.split(/\r?\n/);
  }
}


type ReviewState = {
  index: number;
  viewMode: ReviewViewMode;
  scroll: number;
  message: string | null;
};

function clearScreen(): void {
  output.write("\x1b[2J\x1b[H");
}

function terminalWidth(): number {
  return Math.max(80, output.columns ?? 100);
}

function terminalHeight(): number {
  return Math.max(24, output.rows ?? 38);
}

function horizontalRule(): string {
  return chalk.gray("─".repeat(Math.min(terminalWidth(), 120)));
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncatePlain(value: string, width: number): string {
  const plain = stripAnsi(value).replace(/\t/g, "  ");

  if (plain.length <= width) {
    return plain.padEnd(width);
  }

  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

function statusChip(status: FileProposal["status"]): string {
  if (status === "accepted") return chalk.black.bgGreen(" accepted ");
  if (status === "discarded") return chalk.white.bgRed(" discarded ");
  if (status === "needs_revision") return chalk.black.bgYellow(" needs revision ");
  return chalk.black.bgCyan(" pending ");
}

function statusText(status: FileProposal["status"]): string {
  if (status === "accepted") return chalk.green("accepted");
  if (status === "discarded") return chalk.red("discarded");
  if (status === "needs_revision") return chalk.yellow("needs revision");
  return chalk.cyan("pending");
}

function diffLines(oldText: string, newText: string): string[] {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);
  const out: string[] = [];

  for (let i = 0; i < max; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        out.push(chalk.gray(`  ${oldLine}`));
      }
      continue;
    }

    if (oldLine !== undefined) {
      out.push(chalk.red(`- ${oldLine}`));
    }

    if (newLine !== undefined) {
      out.push(chalk.green(`+ ${newLine}`));
    }
  }

  return out;
}

function withLineNumbers(lines: string[]): string[] {
  const width = String(lines.length).length;

  return lines.map((line, index) => {
    const number = String(index + 1).padStart(width);
    return `${chalk.gray(number)} ${line}`;
  });
}

function proposalLines(proposal: FileProposal): string[] {
  return withLineNumbers(
    highlightCodeLines(proposal.path, proposal.content)
  );
}
function originalLines(proposal: FileProposal): string[] {
  if (!proposal.exists) {
    return [chalk.gray("(new file; no original)")];
  }

  return withLineNumbers(
    highlightCodeLines(proposal.path, proposal.oldContent ?? "")
  );
}

function sideBySideLines(proposal: FileProposal): string[] {
const left = proposal.exists
  ? highlightCodeLines(proposal.path, proposal.oldContent ?? "")
  : [chalk.gray("(new file)")];

const right = highlightCodeLines(proposal.path, proposal.content);
  const totalWidth = terminalWidth();
  const gutter = 7;
  const colWidth = Math.max(28, Math.floor((totalWidth - gutter) / 2));
  const max = Math.max(left.length, right.length);
  const lines: string[] = [];

  lines.push(
    `${chalk.gray(truncatePlain("original", colWidth))} ${chalk.gray("│")} ${chalk.gray(truncatePlain("proposal", colWidth))}`
  );
  lines.push(`${chalk.gray("─".repeat(colWidth))} ${chalk.gray("│")} ${chalk.gray("─".repeat(colWidth))}`);

  for (let i = 0; i < max; i++) {
    const leftNumber = String(i + 1).padStart(4);
    const rightNumber = String(i + 1).padStart(4);
    const leftLine = left[i] ?? "";
    const rightLine = right[i] ?? "";

    lines.push(
      `${chalk.gray(leftNumber)} ${truncatePlain(leftLine, colWidth - 5)} ${chalk.gray("│")} ${chalk.gray(rightNumber)} ${truncatePlain(rightLine, colWidth - 5)}`    );
  }

  return lines;
}

function viewLines(proposal: FileProposal, viewMode: ReviewViewMode): string[] {
  if (viewMode === "original") return originalLines(proposal);
  if (viewMode === "proposal") return proposalLines(proposal);
  if (viewMode === "side-by-side") return sideBySideLines(proposal);

  if (!proposal.exists) {
    return withLineNumbers(
      proposal.content.split(/\r?\n/).map((line) => chalk.green(`+ ${line}`))
    );
  }

  return withLineNumbers(diffLines(proposal.oldContent ?? "", proposal.content));
}

function modeButton(mode: ReviewViewMode, current: ReviewViewMode, key: string, label: string): string {
  return mode === current
    ? chalk.black.bgCyan(` ${key} ${label} `)
    : chalk.cyan(`[${key}]`) + chalk.gray(` ${label}`);
}

function progressBar(current: number, total: number, width: number): string {
  if (total <= 0) return "";

  const ratio = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(width * ratio);

  return chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(Math.max(0, width - filled)));
}

function printReviewScreen(state: AppState, review: ReviewState): void {
  clearScreen();

  if (state.proposals.length === 0) {
    console.log(chalk.gray("No file proposals."));
    return;
  }

  if (review.index >= state.proposals.length) {
    review.index = state.proposals.length - 1;
  }

  const proposal = state.proposals[review.index]!;
  const lines = viewLines(proposal, review.viewMode);
  const visibleRows = Math.max(8, terminalHeight() - 14);
  const maxScroll = Math.max(0, lines.length - visibleRows);
  review.scroll = Math.min(Math.max(0, review.scroll), maxScroll);

  const kind = proposal.exists ? "modified" : "new file";
  const scrollInfo =
    maxScroll === 0
      ? "all"
      : `${Math.min(review.scroll + 1, lines.length)}-${Math.min(review.scroll + visibleRows, lines.length)} / ${lines.length}`;

  console.log(chalk.bold.cyan(`Review ${review.index + 1}/${state.proposals.length}`));
  console.log(horizontalRule());
  console.log(
    [
      `${chalk.gray("File")} ${chalk.white(proposal.path)}`,
      `${chalk.gray("Type")} ${proposal.exists ? chalk.cyan(kind) : chalk.green(kind)}`,
      `${chalk.gray("Status")} ${statusChip(proposal.status)}`,
      `${chalk.gray("Lines")} ${chalk.white(scrollInfo)}`
    ].join(chalk.gray("  │  "))
  );

  if (proposal.comment) {
    console.log(`${chalk.gray("Comment")} ${chalk.yellow(proposal.comment)}`);
  }

  console.log(
    [
      modeButton("diff", review.viewMode, "1", "diff"),
      modeButton("original", review.viewMode, "2", "original"),
      modeButton("proposal", review.viewMode, "3", "proposal"),
      modeButton("side-by-side", review.viewMode, "4", "side-by-side")
    ].join("  ")
  );

  if (review.message) {
    console.log(horizontalRule());
    console.log(review.message);
  }

  console.log(horizontalRule());

  const visible = lines.slice(review.scroll, review.scroll + visibleRows);
  for (const line of visible) {
    console.log(line);
  }

  for (let i = visible.length; i < visibleRows; i++) {
    console.log("");
  }

  console.log(horizontalRule());

  if (maxScroll > 0) {
    const barWidth = Math.min(40, Math.max(16, terminalWidth() - 70));
    console.log(
      `${chalk.gray("Scroll")} ${progressBar(review.scroll + visibleRows, Math.max(1, lines.length), barWidth)} ${chalk.gray("↑/↓ line  PgUp/PgDn page  g/G top/bottom")}`
    );
  } else {
    console.log(chalk.gray("Scroll all visible"));
  }

  console.log(
    [
      chalk.green("a accept"),
      chalk.red("d discard"),
      chalk.yellow("c mark revision"),
      chalk.magenta("r dry-run"),
      chalk.cyan("n next"),
      chalk.cyan("p prev"),
      chalk.white("q quit")
    ].join(chalk.gray("  ·  "))
  );
}

async function writeTempProposalFile(proposal: FileProposal): Promise<string> {
  const safeName = proposal.path.replace(/[\\/]/g, "__");
  const tempDir = path.join(workingDir, ".codemakk", "tmp", "review");
  const tempPath = path.join(tempDir, safeName);

  await fs.mkdir(tempDir, { recursive: true });
  await fs.writeFile(tempPath, proposal.content, "utf8");

  return tempPath;
}

function defaultDryRunCommand(proposal: FileProposal, tempPath: string): string {
  const ext = path.extname(proposal.path).toLowerCase();

  if (ext === ".py") return `python -m py_compile "${tempPath}"`;
  if (ext === ".sh" || ext === ".bash" || ext === ".zsh") return `bash -n "${tempPath}"`;
  if (ext === ".json") {
    return `node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "${tempPath}"`;
  }
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return `node --check "${tempPath}"`;

  return `cat "${tempPath}" >/dev/null`;
}

async function dryRunProposal(proposal: FileProposal): Promise<string> {
  const tempPath = await writeTempProposalFile(proposal);
  const command = defaultDryRunCommand(proposal, tempPath);

  try {
    const result = await execAsync(command, {
      cwd: workingDir,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 4
    });

    const parts = [
      chalk.magenta(`Dry run: ${command}`),
      chalk.green("✓ Dry run passed.")
    ];

    if (result.stdout.trim()) {
      parts.push(chalk.gray("stdout:"));
      parts.push(result.stdout.trim());
    }

    if (result.stderr.trim()) {
      parts.push(chalk.gray("stderr:"));
      parts.push(result.stderr.trim());
    }

    return parts.join("\n");
  } catch (error) {
    const parts = [
      chalk.magenta(`Dry run: ${command}`),
      chalk.red("✗ Dry run failed.")
    ];

    const maybeOutput = error as { stdout?: string; stderr?: string };

    if (maybeOutput.stdout?.trim()) {
      parts.push(chalk.gray("stdout:"));
      parts.push(maybeOutput.stdout.trim());
    }

    if (maybeOutput.stderr?.trim()) {
      parts.push(chalk.gray("stderr:"));
      parts.push(maybeOutput.stderr.trim());
    }

    if (error instanceof Error) {
      parts.push(chalk.red(error.message));
    }

    return parts.join("\n");
  }
}

function keyValue(str: string, key: readline.Key): string {
  return key.name ?? str ?? key.sequence ?? "";
}

function pageSize(): number {
  return Math.max(6, terminalHeight() - 17);
}

export async function openReviewQueue(state: AppState): Promise<void> {
  if (state.proposals.length === 0) {
    console.log(chalk.gray("No file proposals to review."));
    return;
  }

  readline.emitKeypressEvents(input);

  if (input.isTTY) {
    input.setRawMode(true);
  }

  const review: ReviewState = {
    index: 0,
    viewMode: "diff",
    scroll: 0,
    message: chalk.gray("Tip: 1/2/3/4 switch views. ↑/↓ scroll. c marks revision; add text with /comment <number> <text>.")
  };

  let onKeypress: ((_str: string, key: readline.Key) => void) | null = null;

  printReviewScreen(state, review);

  await new Promise<void>((resolve) => {
    onKeypress = (str: string, key: readline.Key) => {
      void (async () => {
        const value = keyValue(str, key);
        const proposal = state.proposals[review.index];

        if (!proposal) {
          cleanup();
          resolve();
          return;
        }

        const lines = viewLines(proposal, review.viewMode);
        const visibleRows = Math.max(8, terminalHeight() - 14);

        if (value === "q" || value === "escape") {
          cleanup();
          resolve();
          return;
        }

        if (value === "1") {
          review.viewMode = "diff";
          review.scroll = 0;
          review.message = chalk.cyan("View: diff");
        } else if (value === "2") {
          review.viewMode = "original";
          review.scroll = 0;
          review.message = chalk.cyan("View: original");
        } else if (value === "3") {
          review.viewMode = "proposal";
          review.scroll = 0;
          review.message = chalk.cyan("View: proposal");
        } else if (value === "4") {
          review.viewMode = "side-by-side";
          review.scroll = 0;
          review.message = chalk.cyan("View: side-by-side");
        } else if (value === "v") {
          const modes: ReviewViewMode[] = ["diff", "original", "proposal", "side-by-side"];
          review.viewMode = modes[(modes.indexOf(review.viewMode) + 1) % modes.length]!;
          review.scroll = 0;
          review.message = chalk.cyan(`View: ${review.viewMode}`);
        } else if (value === "down" || value === "j") {
          review.scroll += 1;
          review.message = null;
        } else if (value === "up" || value === "k") {
          review.scroll -= 1;
          review.message = null;
        } else if (value === "pagedown" || value === "space") {
          review.scroll += pageSize();
          review.message = null;
        } else if (value === "pageup" || value === "b") {
          review.scroll -= pageSize();
          review.message = null;
        } else if (value === "g") {
          review.scroll = 0;
          review.message = null;
        } else if (value === "G") {
          review.scroll = Math.max(0, lines.length - visibleRows);
          review.message = null;
        } else if (value === "n" || value === "right") {
          review.index = Math.min(state.proposals.length - 1, review.index + 1);
          review.scroll = 0;
          review.message = chalk.gray(`File ${review.index + 1}/${state.proposals.length}`);
        } else if (value === "p" || value === "left") {
          review.index = Math.max(0, review.index - 1);
          review.scroll = 0;
          review.message = chalk.gray(`File ${review.index + 1}/${state.proposals.length}`);
        } else if (value === "a") {
          proposal.status = "accepted";
          await saveSessionState(state);
          review.message = chalk.green(`✓ Accepted ${proposal.path}. /apply will write it.`);
        } else if (value === "d") {
          proposal.status = "discarded";
          await saveSessionState(state);
          review.message = chalk.red(`✗ Discarded ${proposal.path}.`);
        } else if (value === "c") {
          proposal.status = "needs_revision";
          proposal.comment = proposal.comment ?? "Needs revision.";
          await saveSessionState(state);
          review.message = chalk.yellow(`↻ Marked ${proposal.path} for revision. Add text with: /comment ${review.index + 1} <comment>`);
        } else if (value === "r") {
          review.message = chalk.magenta("Running dry run…");
          printReviewScreen(state, review);
          review.message = await dryRunProposal(proposal);
        }

        printReviewScreen(state, review);
      })().catch((error) => {
        cleanup();
        console.error(error);
        resolve();
      });
    };

    function cleanup(): void {
      if (onKeypress) {
        input.off("keypress", onKeypress);
      }

      if (input.isTTY) {
        input.setRawMode(false);
      }

      clearScreen();
      console.log(chalk.gray("Review closed."));
      console.log("");
    }

    input.on("keypress", onKeypress);
  });
}

export function printProposalList(state: AppState): void {
  if (state.proposals.length === 0) {
    console.log(chalk.gray("No file proposals."));
    return;
  }

  console.log("");
  console.log(chalk.bold.cyan("File proposals"));

  for (const [index, proposal] of state.proposals.entries()) {
    const kind = proposal.exists ? "modified" : "new";
    console.log(
      `${chalk.gray(String(index + 1).padStart(2))}. ${chalk.white(proposal.path)} ${chalk.gray(kind)} ${statusText(proposal.status)}`
    );

    if (proposal.comment) {
      console.log(`    ${chalk.yellow(proposal.comment)}`);
    }
  }

  console.log("");
}
