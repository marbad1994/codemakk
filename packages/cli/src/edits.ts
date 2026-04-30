import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import type { AppState, PendingEdit } from "./types.js";
import { isInsideWorkingDir, workingDir } from "./config.js";

type ParsedFileBlock = {
  path: string;
  content: string;
};

function normalizeModelPath(filePath: string): string {
  return filePath
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^\.?\//, "");
}
function extractSingleCodeBlockContent(output: string): string | null {
  const trimmed = output.trim();

  const match = trimmed.match(/^```[A-Za-z0-9_-]*\n([\s\S]*?)\n```$/);

  if (!match || match[1] === undefined) {
    return null;
  }

  return match[1].trimEnd() + "\n";
}
function parseFullFileBlocks(output: string): ParsedFileBlock[] {
  const blocks: ParsedFileBlock[] = [];

  // Supported format 1:
  //
  // File: path/to/file.ext
  // ```lang
  // full file contents
  // ```
  const fileLineRegex =
    /(?:^|\n)File:\s*`?([^`\n]+?)`?\s*\n```[A-Za-z0-9_-]*\n([\s\S]*?)\n```/g;

  for (const match of output.matchAll(fileLineRegex)) {
    const rawPath = match[1];
    const content = match[2];

    if (!rawPath || content === undefined) {
      continue;
    }

    blocks.push({
      path: normalizeModelPath(rawPath),
      content
    });
  }
  // Supported format 2:
  //
  // ```lang:path/to/file.ext
  // full file contents
  // ```
  //
  // Some models, especially Qwen-style coding models, return this format.
  const fencedPathRegex = /(?:^|\n)```([A-Za-z0-9_-]+):([^\n]+)\n([\s\S]*?)\n```/g;

  for (const match of output.matchAll(fencedPathRegex)) {
    const rawPath = match[2];
    const content = match[3];

    if (!rawPath || content === undefined) {
      continue;
    }

    const normalizedPath = normalizeModelPath(rawPath);

    if (blocks.some((block) => block.path === normalizedPath)) {
      continue;
    }

    blocks.push({
      path: normalizedPath,
      content
    });
  }

  return blocks;
}

function looksLikeBareCode(output: string): boolean {
  const trimmed = output.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.includes("```")) {
    return false;
  }

  if (/^File:\s+/m.test(trimmed)) {
    return false;
  }

  const codeSignals = [
    /^import\s+/m,
    /^from\s+\S+\s+import\s+/m,
    /^def\s+\w+/m,
    /^class\s+\w+/m,
    /^if\s+__name__\s*==\s*["']__main__["']/m,
    /^const\s+/m,
    /^let\s+/m,
    /^export\s+/m,
    /^function\s+/m,
    /^#!/m
  ];

  return codeSignals.some((regex) => regex.test(trimmed));
}
function assertSafeRelativePath(relativePath: string): void {
  if (!relativePath) {
    throw new Error("Refusing empty file path.");
  }

  if (path.isAbsolute(relativePath)) {
    throw new Error(`Refusing absolute path: ${relativePath}`);
  }

  const parts = relativePath.split(/[\\/]/);

  if (parts.includes("..")) {
    throw new Error(`Refusing path traversal outside working directory: ${relativePath}`);
  }

  if (relativePath.endsWith("/")) {
    throw new Error(`Refusing to write directory path as file: ${relativePath}`);
  }
}

async function createPendingEdit(block: ParsedFileBlock): Promise<PendingEdit> {
  assertSafeRelativePath(block.path);

  const absolutePath = path.resolve(workingDir, block.path);

  if (!isInsideWorkingDir(absolutePath)) {
    throw new Error(`Refusing write outside working directory: ${block.path}`);
  }

  let oldContent: string | null = null;
  let exists = false;

  try {
    const stat = await fs.stat(absolutePath);

    if (stat.isDirectory()) {
      throw new Error(`Refusing to overwrite directory: ${block.path}`);
    }

    oldContent = await fs.readFile(absolutePath, "utf8");
    exists = true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing")) {
      throw error;
    }

    oldContent = null;
    exists = false;
  }

  return {
    path: block.path,
    absolutePath,
    content: block.content,
    oldContent,
    exists
  };
}

export async function stageEditsFromModelOutput(
  state: AppState,
  output: string
): Promise<void> {
  const blocks = parseFullFileBlocks(output);

  const selectedFiles = state.contextFiles.filter((file) => !file.endsWith("/"));

  if (blocks.length === 0 && selectedFiles.length === 1 && output.trim()) {
    blocks.push({
      path: selectedFiles[0]!,
      content: extractSingleCodeBlockContent(output) ?? output.trimEnd() + "\n"
    });
  }

  if (blocks.length === 0) {
    console.log("");
    console.log(chalk.yellow("No file edits detected."));

    if (selectedFiles.length === 0) {
      console.log(chalk.gray("Tip: select one file with @, then ask for a rewrite."));
    } else if (selectedFiles.length > 1) {
      console.log(
        chalk.gray(
          "Tip: multiple files are selected, so bare code is ambiguous. Ask the model to use File: path + code block format."
        )
      );
    } else {
      console.log(
        chalk.gray("Tip: ask the model to use File: path + code block format.")
      );
    }

    console.log("");
    return;
  }

  const edits: PendingEdit[] = [];

  for (const block of blocks) {
    try {
      edits.push(await createPendingEdit(block));
    } catch (error) {
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }

  if (edits.length === 0) {
    return;
  }

  state.pendingEdits = edits;

  console.log("");
  console.log(
    `${chalk.green("Staged")} ${chalk.yellow(String(edits.length))} ${chalk.green("file edit(s).")}`
  );
  console.log(chalk.gray("Use /diff to preview or /apply to write them."));
  console.log("");
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

export function printPendingDiff(state: AppState): void {
  if (state.pendingEdits.length === 0) {
    console.log(chalk.gray("No pending edits."));
    return;
  }

  console.log("");

  for (const edit of state.pendingEdits) {
    console.log(
      edit.exists
        ? chalk.bold.cyan(`Modified: ${edit.path}`)
        : chalk.bold.green(`Created:  ${edit.path}`)
    );

    console.log(chalk.gray(`--- ${edit.path}`));
    console.log(chalk.gray(`+++ ${edit.path}`));

    const oldText = edit.oldContent ?? "";
    const newText = edit.content;

    const lines = diffLines(oldText, newText);
    const maxShown = 220;

    for (const line of lines.slice(0, maxShown)) {
      console.log(line);
    }

    if (lines.length > maxShown) {
      console.log(chalk.gray(`... ${lines.length - maxShown} more diff lines hidden`));
    }

    console.log("");
  }
}

async function writeEdit(edit: PendingEdit): Promise<void> {
  const absolutePath = path.resolve(workingDir, edit.path);

  if (absolutePath !== edit.absolutePath) {
    throw new Error(`Pending edit path changed unexpectedly: ${edit.path}`);
  }

  if (!isInsideWorkingDir(absolutePath)) {
    throw new Error(`Refusing write outside working directory: ${edit.path}`);
  }

  await fs.mkdir(path.dirname(absolutePath), {
    recursive: true
  });

  await fs.writeFile(absolutePath, edit.content, "utf8");
}

export async function applyPendingEdits(state: AppState): Promise<void> {
  if (state.pendingEdits.length === 0) {
    console.log(chalk.gray("No pending edits."));
    return;
  }

  console.log("");

  for (const edit of state.pendingEdits) {
    await writeEdit(edit);

    console.log(
      edit.exists
        ? `${chalk.green("Wrote")} ${chalk.white(edit.path)}`
        : `${chalk.green("Created")} ${chalk.white(edit.path)}`
    );
  }

  state.pendingEdits = [];

  console.log("");
  console.log(chalk.green("Apply complete."));
  console.log("");
}

async function nextBackupPath(absolutePath: string): Promise<string> {
  let candidate = `${absolutePath}.old`;

  try {
    await fs.access(candidate);
  } catch {
    return candidate;
  }

  for (let i = 1; i < 1000; i++) {
    candidate = `${absolutePath}.old.${i}`;

    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }

  throw new Error(`Could not find available backup path for ${absolutePath}`);
}

async function writeCreateModeFile(edit: PendingEdit): Promise<void> {
  const absolutePath = path.resolve(workingDir, edit.path);

  if (absolutePath !== edit.absolutePath) {
    throw new Error(`Pending edit path changed unexpectedly: ${edit.path}`);
  }

  if (!isInsideWorkingDir(absolutePath)) {
    throw new Error(`Refusing write outside working directory: ${edit.path}`);
  }

  await fs.mkdir(path.dirname(absolutePath), {
    recursive: true
  });

  if (edit.exists) {
    const backupPath = await nextBackupPath(absolutePath);
    await fs.rename(absolutePath, backupPath);

    console.log(
      `${chalk.yellow("Existing file moved to")} ${chalk.white(path.relative(workingDir, backupPath))}`
    );
  }

  await fs.writeFile(absolutePath, edit.content, "utf8");

  console.log(
    edit.exists
      ? `${chalk.green("Created")} ${chalk.white(edit.path)} ${chalk.gray("(existing file backed up)")}`
      : `${chalk.green("Created")} ${chalk.white(edit.path)}`
  );
}

export async function createFilesFromModelOutput(output: string): Promise<number> {
  const blocks = parseFullFileBlocks(output);

  if (blocks.length === 0) {
    console.log(chalk.yellow("No createable file blocks found."));
    console.log(chalk.gray("Expected format:"));
    console.log(chalk.gray("File: path/to/file.ts"));
    console.log(chalk.gray("```ts"));
    console.log(chalk.gray("// full file contents"));
    console.log(chalk.gray("```"));
    return 0;
  }

  const edits: PendingEdit[] = [];

  for (const block of blocks) {
    try {
      edits.push(await createPendingEdit(block));
    } catch (error) {
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }

  if (edits.length === 0) {
    return 0;
  }

  console.log("");

  for (const edit of edits) {
    await writeCreateModeFile(edit);
  }

  console.log("");
  console.log(
    `${chalk.green("Created")} ${chalk.yellow(String(edits.length))} ${chalk.green("file(s).")}`
  );
  console.log("");

  return edits.length;
}
