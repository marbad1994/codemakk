import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import type { AppState } from "./types.js";
import { estimateTokens } from "./tokenEstimator.js";
import { workingDir } from "./config.js";
export function extractMentionedFiles(value: string): string[] {
  const matches = value.matchAll(/@([^\s]+)/g);

  return [...matches]
    .map((match) => match[1])
    .filter((filePath): filePath is string => Boolean(filePath));
}

export function stripFileMentions(value: string): string {
  return value.replace(/@([^\s]+)/g, "").replace(/\s+/g, " ").trim();
}

export function addContextFiles(state: AppState, files: string[]): void {
  for (const file of files) {
    if (!state.contextFiles.includes(file)) {
      state.contextFiles.push(file);
    }
  }
}

async function fileContentBlock(filePath: string): Promise<string> {
const absolute = path.resolve(workingDir, filePath);
 const content = await fs.readFile(absolute, "utf8");

  return [
    `File: ${filePath}`,
    "```",
    content,
    "```"
  ].join("\n");
}

export async function buildPromptWithContext(
  prompt: string,
  state: AppState
): Promise<string> {
  const sections: string[] = [];

  if (state.skill) {
    sections.push(
      [
        `Active skill: ${state.skill.name}`,
        "",
        state.skill.instructions
      ].join("\n")
    );
  }

  sections.push(prompt);

  if (state.contextFiles.length > 0) {
    const fileBlocks: string[] = [];

    for (const filePath of state.contextFiles) {
      if (filePath.endsWith("/")) {
        continue;
      }

      try {
        fileBlocks.push(await fileContentBlock(filePath));
      } catch {
        fileBlocks.push(`File: ${filePath}\n[Could not read file]`);
      }
    }

    sections.push(
      [
        "Selected context files:",
        "",
        fileBlocks.join("\n\n")
      ].join("\n")
    );
  }

  return sections.join("\n\n");
}

export function printContext(files: string[]): void {
  if (files.length === 0) {
    console.log(chalk.gray("No context files selected."));
    return;
  }

  console.log(chalk.gray("Context files:"));

  for (const file of files) {
    console.log(`  ${chalk.yellow("@")}${chalk.white(file)}`);
  }
}

export async function countContext(state: AppState): Promise<void> {
  let total = 0;

  if (state.skill) {
    total += estimateTokens(state.skill.instructions);
  }

  console.log("");

  if (state.skill) {
    console.log(
      `${chalk.green("skill")} ${state.skill.name}: ${chalk.yellow(String(estimateTokens(state.skill.instructions)))} tokens estimated`
    );
  }

  for (const file of state.contextFiles) {
    if (file.endsWith("/")) {
      continue;
    }

    try {
      const content = await fs.readFile(path.resolve(workingDir, file), "utf8");      const tokens = estimateTokens(content);
      total += tokens;
      console.log(`${chalk.white(file)}: ${chalk.yellow(String(tokens))} tokens estimated`);
    } catch {
      console.log(`${chalk.white(file)}: ${chalk.red("could not read")}`);
    }
  }

  console.log("");
  console.log(`${chalk.gray("Total estimated context tokens:")} ${chalk.yellow(String(total))}`);
  console.log("");
}
