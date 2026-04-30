import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { workingDir } from "./config.js";

export type ProjectStatus =
  | "draft_plan"
  | "plan_approved"
  | "design_draft"
  | "design_approved"
  | "ready_to_build"
  | "building"
  | "built";

export type ProjectSummary = {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

type ProjectIndex = {
  nextProjectNumber: number;
  projects: ProjectSummary[];
};

export type ProjectRecord = ProjectSummary & {
  rootDir: string;
};

const projectsRoot = path.join(workingDir, ".codemakk", "projects");
const indexPath = path.join(projectsRoot, "index.json");

async function ensureProjectsRoot(): Promise<void> {
  await fs.mkdir(projectsRoot, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function padProjectId(value: number): string {
  return String(value).padStart(4, "0");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function loadProjectIndex(): Promise<ProjectIndex> {
  await ensureProjectsRoot();
  const existing = await readJsonFile<ProjectIndex>(indexPath);

  if (existing) {
    return existing;
  }

  const fresh: ProjectIndex = {
    nextProjectNumber: 1,
    projects: []
  };

  await writeJsonFile(indexPath, fresh);
  return fresh;
}

async function saveProjectIndex(index: ProjectIndex): Promise<void> {
  await writeJsonFile(indexPath, index);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const index = await loadProjectIndex();
  return [...index.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(title = "Untitled project"): Promise<ProjectRecord> {
  const index = await loadProjectIndex();
  const id = padProjectId(index.nextProjectNumber);
  index.nextProjectNumber += 1;

  const createdAt = nowIso();
  const summary: ProjectSummary = {
    id,
    title,
    status: "draft_plan",
    createdAt,
    updatedAt: createdAt
  };

  index.projects.push(summary);
  await saveProjectIndex(index);

  const project = projectRecord(summary);
  await fs.mkdir(project.rootDir, { recursive: true });
  await fs.mkdir(path.join(project.rootDir, "conversations"), { recursive: true });
  await fs.mkdir(path.join(project.rootDir, "mockups", "current"), { recursive: true });
  await writeJsonFile(path.join(project.rootDir, "project.json"), summary);

  return project;
}

function projectRecord(summary: ProjectSummary): ProjectRecord {
  return {
    ...summary,
    rootDir: path.join(projectsRoot, summary.id)
  };
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const index = await loadProjectIndex();
  const summary = index.projects.find((project) => project.id === id);
  return summary ? projectRecord(summary) : null;
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<ProjectSummary, "title" | "status">>
): Promise<ProjectRecord> {
  const index = await loadProjectIndex();
  const summary = index.projects.find((project) => project.id === id);

  if (!summary) {
    throw new Error(`Unknown project id: ${id}`);
  }

  Object.assign(summary, updates, {
    updatedAt: nowIso()
  });

  await saveProjectIndex(index);

  const project = projectRecord(summary);
  await writeJsonFile(path.join(project.rootDir, "project.json"), summary);
  return project;
}

export async function appendProjectHistory(
  projectId: string,
  mode: "plan" | "design" | "build",
  role: "user" | "assistant" | "system",
  content: string
): Promise<void> {
  const project = await getProject(projectId);

  if (!project) {
    throw new Error(`Unknown project id: ${projectId}`);
  }

  const entry = JSON.stringify({
    timestamp: nowIso(),
    mode,
    role,
    content
  });

  const filePath = path.join(project.rootDir, "conversations", `${mode}.jsonl`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${entry}\n`, "utf8");
}

export async function readProjectHistory(
  projectId: string,
  mode: "plan" | "design" | "build"
): Promise<Array<{ role: "user" | "assistant" | "system"; content: string }>> {
  const project = await getProject(projectId);

  if (!project) {
    return [];
  }

  const filePath = path.join(project.rootDir, "conversations", `${mode}.jsonl`);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as { role?: string; content?: string };

          if (
            (parsed.role === "user" || parsed.role === "assistant" || parsed.role === "system") &&
            typeof parsed.content === "string"
          ) {
            return [{ role: parsed.role, content: parsed.content }];
          }
        } catch {
          // Ignore broken history rows.
        }

        return [];
      });
  } catch {
    return [];
  }
}

export function projectFile(project: ProjectRecord, relativePath: string): string {
  return path.join(project.rootDir, relativePath);
}

export async function savePlanArtifacts(
  project: ProjectRecord,
  args: {
    planMd: string;
    planJson: unknown;
  }
): Promise<void> {
  await fs.writeFile(projectFile(project, "plan.md"), `${args.planMd.trimEnd()}\n`, "utf8");
  await writeJsonFile(projectFile(project, "plan.json"), args.planJson);

  const title =
    typeof args.planJson === "object" &&
    args.planJson !== null &&
    "title" in args.planJson &&
    typeof (args.planJson as { title?: unknown }).title === "string"
      ? (args.planJson as { title: string }).title
      : project.title;

  await updateProject(project.id, {
    title,
    status: "plan_approved"
  });
}

export async function saveDesignArtifacts(
  project: ProjectRecord,
  args: {
    designMd: string;
    designJson: unknown;
    mockups: Array<{ relativePath: string; content: string }>;
  }
): Promise<void> {
  await fs.writeFile(projectFile(project, "design.md"), `${args.designMd.trimEnd()}\n`, "utf8");
  await writeJsonFile(projectFile(project, "design.json"), args.designJson);

  const mockupDir = projectFile(project, path.join("mockups", "current"));
  await fs.rm(mockupDir, { recursive: true, force: true });
  await fs.mkdir(mockupDir, { recursive: true });

  for (const mockup of args.mockups) {
    const safePath = normalizeMockupPath(mockup.relativePath);
    const target = path.join(project.rootDir, safePath);

    if (!target.startsWith(path.join(project.rootDir, "mockups") + path.sep)) {
      throw new Error(`Refusing mockup path outside mockups directory: ${mockup.relativePath}`);
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, mockup.content, "utf8");
  }

  await updateProject(project.id, {
    status: "design_approved"
  });
}

function normalizeMockupPath(relativePath: string): string {
  const cleaned = relativePath
    .trim()
    .replace(/^['"`]|['"`]$/g, "")
    .replace(/^\.\//, "");

  const normalized = path.normalize(cleaned);

  if (path.isAbsolute(normalized) || normalized.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe mockup path: ${relativePath}`);
  }

  if (normalized.startsWith("mockups")) {
    return normalized;
  }

  return path.join("mockups", "current", normalized);
}

export async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

export async function listMockups(project: ProjectRecord): Promise<string[]> {
  const root = path.join(project.rootDir, "mockups");
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;

    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as Array<{
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }>;
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".html")) {
        results.push(path.relative(project.rootDir, absolute));
      }
    }
  }

  await walk(root);
  return results;
}

export async function openMockup(projectId: string, selector?: string): Promise<void> {
  const project = await getProject(projectId);

  if (!project) {
    console.log(chalk.red(`Unknown project id: ${projectId}`));
    return;
  }

  const mockups = await listMockups(project);

  if (mockups.length === 0) {
    console.log(chalk.yellow(`No mockups found for project ${project.id}.`));
    return;
  }

  let selected = mockups[0]!;

  if (selector) {
    const maybeIndex = Number(selector);

    if (Number.isInteger(maybeIndex) && maybeIndex >= 1 && maybeIndex <= mockups.length) {
      selected = mockups[maybeIndex - 1]!;
    } else {
      const found = mockups.find((mockup) => mockup.endsWith(selector) || mockup === selector);

      if (found) {
        selected = found;
      }
    }
  }

  const absolute = path.join(project.rootDir, selected);
  const command = process.env.CODEMAKK_OPEN_COMMAND ?? "xdg-open";

  console.log(`${chalk.gray("Opening")} ${chalk.white(selected)}`);

  const child = spawn(command, [absolute], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
}

export async function printProjects(): Promise<void> {
  const projects = await listProjects();

  if (projects.length === 0) {
    console.log(chalk.gray("No codemakk projects yet. Use /plan new."));
    return;
  }

  console.log("");
  console.log(chalk.bold.cyan("Codemakk projects"));

  for (const project of projects) {
    console.log(
      `${chalk.yellow(project.id)}  ${chalk.white(project.title)}  ${chalk.gray(project.status)}  ${chalk.gray(project.updatedAt)}`
    );
  }

  console.log("");
}

export async function printProject(projectId: string): Promise<void> {
  const project = await getProject(projectId);

  if (!project) {
    console.log(chalk.red(`Unknown project id: ${projectId}`));
    return;
  }

  console.log("");
  console.log(chalk.bold.cyan(`Project ${project.id}`));
  console.log(`${chalk.gray("Title:")}  ${chalk.white(project.title)}`);
  console.log(`${chalk.gray("Status:")} ${chalk.yellow(project.status)}`);
  console.log(`${chalk.gray("Path:")}   ${chalk.white(project.rootDir)}`);

  const mockups = await listMockups(project);

  if (mockups.length > 0) {
    console.log("");
    console.log(chalk.gray("Mockups:"));
    mockups.forEach((mockup, index) => {
      console.log(`  ${chalk.yellow(String(index + 1).padStart(2))}. ${chalk.white(mockup)}`);
    });
  }

  console.log("");
}
