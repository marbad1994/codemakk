import fs from "node:fs/promises";
import path from "node:path";
import type { AppState, FileProposal } from "./types.js";
import { workingDir } from "./config.js";

type PersistedSession = {
  version: 1;
  savedAt: string;
  contextFiles: string[];
  proposals: FileProposal[];
  lastResponseText: string;
  createMode: boolean;
};

const sessionDir = path.join(workingDir, ".codemakk");
const sessionFile = path.join(sessionDir, "session.json");

export function sessionPath(): string {
  return sessionFile;
}

export async function saveSessionState(state: AppState): Promise<void> {
  const session: PersistedSession = {
    version: 1,
    savedAt: new Date().toISOString(),
    contextFiles: state.contextFiles,
    proposals: state.proposals,
    lastResponseText: state.lastResponseText,
    createMode: state.createMode
  };

  await fs.mkdir(sessionDir, { recursive: true });
  await fs.writeFile(sessionFile, JSON.stringify(session, null, 2), "utf8");
}

export async function loadSessionState(state: AppState): Promise<boolean> {
  let raw: string;

  try {
    raw = await fs.readFile(sessionFile, "utf8");
  } catch {
    return false;
  }

  const parsed = JSON.parse(raw) as Partial<PersistedSession>;

  if (parsed.version !== 1) {
    return false;
  }

  state.contextFiles = Array.isArray(parsed.contextFiles) ? parsed.contextFiles : [];
  state.proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  state.lastResponseText =
    typeof parsed.lastResponseText === "string" ? parsed.lastResponseText : "";
  state.createMode = parsed.createMode === true;

  return true;
}

export async function clearSessionState(): Promise<void> {
  await fs.rm(sessionFile, { force: true });
}
