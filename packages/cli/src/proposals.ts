import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import type { AppState, FileProposal } from "./types.js";
import { isInsideWorkingDir, workingDir } from "./config.js";
import { saveSessionState } from "./session.js";

type ParsedFileCandidate = {
  path: string;
  content: string;
  source: string;
};

function normalizeModelPath(filePath: string): string {
  return filePath
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/^\.\//, "");
}

function assertSafeRelativePath(relativePath: string): void {
  if (!relativePath) {
    throw new Error("Refusing empty file path.");
  }

  if (path.isAbsolute(relativePath)) {
    throw new Error(`Refusing absolute path: ${relativePath}`);
  }

  if (relativePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Refusing path traversal outside working directory: ${relativePath}`);
  }

  if (relativePath.endsWith("/")) {
    throw new Error(`Refusing directory path: ${relativePath}`);
  }
}

function extractSingleCodeBlockContent(output: string): string | null {
  const match = output.trim().match(/^```[A-Za-z0-9_-]*\n([\s\S]*?)\n```$/);

  if (!match || match[1] === undefined) {
    return null;
  }

  return `${match[1].trimEnd()}\n`;
}

function parseFileCandidates(
  output: string,
  selectedFiles: string[]
): ParsedFileCandidate[] {
  const candidates: ParsedFileCandidate[] = [];

  const fileLineRegex =
    /(?:^|\n)File:\s*`?([^`\n]+?)`?\s*\n```[A-Za-z0-9_-]*\n([\s\S]*?)\n```/g;

  for (const match of output.matchAll(fileLineRegex)) {
    const rawPath = match[1];
    const content = match[2];

    if (!rawPath || content === undefined) {
      continue;
    }

    candidates.push({
      path: normalizeModelPath(rawPath),
      content: `${content.trimEnd()}\n`,
      source: "file-block"
    });
  }

  const fencedPathRegex = /(?:^|\n)```([A-Za-z0-9_-]+):([^\n]+)\n([\s\S]*?)\n```/g;

  for (const match of output.matchAll(fencedPathRegex)) {
    const rawPath = match[2];
    const content = match[3];

    if (!rawPath || content === undefined) {
      continue;
    }

    candidates.push({
      path: normalizeModelPath(rawPath),
      content: `${content.trimEnd()}\n`,
      source: "fenced-path"
    });
  }

  if (candidates.length === 0 && selectedFiles.length === 1 && output.trim()) {
    candidates.push({
      path: selectedFiles[0]!,
      content: extractSingleCodeBlockContent(output) ?? `${output.trimEnd()}\n`,
      source: "single-context-fallback"
    });
  }

  return candidates;
}

async function toProposal(candidate: ParsedFileCandidate): Promise<FileProposal> {
  assertSafeRelativePath(candidate.path);

  const absolutePath = path.resolve(workingDir, candidate.path);

  if (!isInsideWorkingDir(absolutePath)) {
    throw new Error(`Refusing write outside working directory: ${candidate.path}`);
  }

  let oldContent: string | null = null;
  let exists = false;

  try {
    const stat = await fs.stat(absolutePath);

    if (stat.isDirectory()) {
      throw new Error(`Refusing to overwrite directory: ${candidate.path}`);
    }

    oldContent = await fs.readFile(absolutePath, "utf8");
    exists = true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Refusing")) {
      throw error;
    }
  }

  return {
    id: randomUUID(),
    path: candidate.path,
    absolutePath,
    content: candidate.content,
    oldContent,
    exists,
    status: "pending",
    source: candidate.source
  };
}

function chooseLatestPerPath(candidates: ParsedFileCandidate[]): {
  chosen: ParsedFileCandidate[];
  supersededCount: number;
} {
  const byPath = new Map<string, ParsedFileCandidate>();
  let supersededCount = 0;

  for (const candidate of candidates) {
    const key = normalizeModelPath(candidate.path);

    if (byPath.has(key)) {
      supersededCount += 1;
    }

    byPath.set(key, {
      ...candidate,
      path: key
    });
  }

  return {
    chosen: [...byPath.values()],
    supersededCount
  };
}

export async function setProposalsFromModelOutput(
  state: AppState,
  output: string
): Promise<number> {
  const selectedFiles = state.contextFiles.filter((file) => !file.endsWith("/"));
  const candidates = parseFileCandidates(output, selectedFiles);

  if (candidates.length === 0) {
    console.log("");
    console.log(chalk.yellow("No file proposals detected."));
    console.log(
      chalk.gray(
        "Tip: select one file with @, use /create, or ask for File: path code blocks."
      )
    );
    console.log("");
    return 0;
  }

  const { chosen, supersededCount } = chooseLatestPerPath(candidates);
  const proposals: FileProposal[] = [];

  for (const candidate of chosen) {
    try {
      proposals.push(await toProposal(candidate));
    } catch (error) {
      console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    }
  }

  if (proposals.length === 0) {
    return 0;
  }

  state.proposals = proposals;
  await saveSessionState(state);

  console.log("");
  console.log(
    `${chalk.green("Detected")} ${chalk.yellow(String(proposals.length))} ${chalk.green("file proposal(s).")}`
  );

  if (supersededCount > 0) {
    console.log(
      chalk.gray(
        `Ignored ${supersededCount} earlier duplicate candidate(s); kept latest per file.`
      )
    );
  }

  console.log(chalk.gray("Use /review to inspect proposals. /apply writes only accepted files."));
  console.log("");

  return proposals.length;
}

export function proposalSummary(state: AppState): string {
  const accepted = state.proposals.filter((proposal) => proposal.status === "accepted").length;
  const pending = state.proposals.filter((proposal) => proposal.status === "pending").length;
  const needsRevision = state.proposals.filter(
    (proposal) => proposal.status === "needs_revision"
  ).length;
  const discarded = state.proposals.filter((proposal) => proposal.status === "discarded").length;

  return `${state.proposals.length} proposal(s): ${accepted} accepted, ${pending} pending, ${needsRevision} needs revision, ${discarded} discarded`;
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

async function writeAcceptedProposal(proposal: FileProposal): Promise<void> {
  const absolutePath = path.resolve(workingDir, proposal.path);

  if (absolutePath !== proposal.absolutePath) {
    throw new Error(`Proposal path changed unexpectedly: ${proposal.path}`);
  }

  if (!isInsideWorkingDir(absolutePath)) {
    throw new Error(`Refusing write outside working directory: ${proposal.path}`);
  }

  await fs.mkdir(path.dirname(absolutePath), {
    recursive: true
  });

  if (proposal.exists) {
    const backupPath = await nextBackupPath(absolutePath);
    await fs.rename(absolutePath, backupPath);

    console.log(
      `${chalk.yellow("Existing file moved to")} ${chalk.white(path.relative(workingDir, backupPath))}`
    );
  }

  await fs.writeFile(absolutePath, proposal.content, "utf8");

  console.log(
    proposal.exists
      ? `${chalk.green("Wrote")} ${chalk.white(proposal.path)} ${chalk.gray("(backup created)")}`
      : `${chalk.green("Created")} ${chalk.white(proposal.path)}`
  );
}

export async function applyAcceptedProposals(state: AppState): Promise<void> {
  const accepted = state.proposals.filter((proposal) => proposal.status === "accepted");

  if (accepted.length === 0) {
    console.log(chalk.gray("No accepted proposals to apply. Use /review first."));
    return;
  }

  console.log("");

  for (const proposal of accepted) {
    await writeAcceptedProposal(proposal);
  }

  state.proposals = state.proposals.filter((proposal) => proposal.status !== "accepted");
  await saveSessionState(state);

  console.log("");
  console.log(chalk.green("Apply complete."));
  console.log("");
}

export function buildRevisionPrompt(state: AppState): string | null {
  const needsRevision = state.proposals.filter(
    (proposal) => proposal.status === "needs_revision"
  );

  if (needsRevision.length === 0) {
    return null;
  }

  const accepted = state.proposals.filter((proposal) => proposal.status === "accepted");

  const lines: string[] = [
    "You previously proposed file changes.",
    "",
    "The user accepted these files. Do not resend them:",
    ...(accepted.length > 0 ? accepted.map((proposal) => `- ${proposal.path}`) : ["- none"]),
    "",
    "Revise only the files below.",
    "Return ONLY file blocks using this exact format:",
    "",
    "File: path/to/file.ext",
    "```lang",
    "full file contents",
    "```",
    "",
    "No explanations. No alternatives. No markdown outside file blocks.",
    ""
  ];

  for (const proposal of needsRevision) {
    lines.push(`File needing revision: ${proposal.path}`);
    lines.push(`User comment: ${proposal.comment ?? "No comment provided."}`);
    lines.push("");
    lines.push("Current proposed content:");
    lines.push("```");
    lines.push(proposal.content);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

export async function commentOnProposal(
  state: AppState,
  index: number,
  comment: string
): Promise<void> {
  const proposal = state.proposals[index];

  if (!proposal) {
    console.log(chalk.red(`No proposal number ${index + 1}.`));
    return;
  }

  proposal.status = "needs_revision";
  proposal.comment = comment.trim() || "Needs revision.";
  await saveSessionState(state);

  console.log(
    `${chalk.yellow("Marked for revision:")} ${chalk.white(proposal.path)}`
  );
}
