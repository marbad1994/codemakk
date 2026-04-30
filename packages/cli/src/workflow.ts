import chalk from "chalk";
import { RouterClient, type ChatMessage } from "@codemakk/core";
import type { AppState } from "./types.js";
import { readInteractiveLine } from "./input.js";
import { renderMarkdown } from "./markdown.js";
import { setProposalsFromModelOutput } from "./proposals.js";
import { saveSessionState } from "./session.js";
import {
  appendProjectHistory,
  createProject,
  getProject,
  listMockups,
  openMockup,
  printProject,
  printProjects,
  projectFile,
  readProjectHistory,
  readTextIfExists,
  saveDesignArtifacts,
  savePlanArtifacts,
  type ProjectRecord
} from "./projects.js";

type ArtifactBlocks = {
  planMd?: string;
  planJson?: unknown;
  designMd?: string;
  designJson?: unknown;
  mockups: Array<{ relativePath: string; content: string }>;
};

async function streamAssistant(args: {
  client: RouterClient;
  state: AppState;
  messages: ChatMessage[];
  profile?: string;
}): Promise<string> {
  let text = "";
  let usedModel: string | undefined;

  for await (const chunk of args.client.chatStream({
    model: args.state.model,
    profile: (args.profile ?? args.state.profile) as any,
    speed: args.state.speed,
    localPreference: args.state.localPreference,
    messages: args.messages
  })) {
    if (!usedModel && (chunk.usedModel || chunk.model)) {
      usedModel = chunk.usedModel ?? chunk.model;
      console.log(chalk.gray("\nModel used: ") + chalk.magenta(usedModel));
      console.log("");
    }

    text += chunk.content;
  }

  return text;
}

function systemPlanningPrompt(project: ProjectRecord): string {
  return [
    "You are Codemakk planning mode.",
    `Project id: ${project.id}`,
    "Discuss requirements with the user like a senior product/engineering planner.",
    "Ask focused questions when needed.",
    "Do not generate implementation files in planning mode.",
    "When the user is ready, they will type /done and you will produce final artifacts."
  ].join("\n");
}

function systemDesignPrompt(project: ProjectRecord, planMd: string, planJson: string): string {
  return [
    "You are Codemakk design mode.",
    `Project id: ${project.id}`,
    "Discuss UX and visual structure with the user.",
    "Mockups must be standalone HTML documents with embedded <style> blocks and reusable class-based CSS.",
    "Do not use inline style attributes.",
    "Do not use external network assets, CDNs, remote fonts, or images.",
    "Use semantic HTML and readable class names.",
    "Do not generate application source files in design mode.",
    "When approved, produce design artifacts and HTML mockups.",
    "",
    "Approved plan markdown:",
    planMd || "[No plan.md yet]",
    "",
    "Approved plan JSON:",
    planJson || "[No plan.json yet]"
  ].join("\n");
}

function planFinalizationPrompt(project: ProjectRecord, conversation: ChatMessage[]): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are finalizing a Codemakk project plan.",
        "Return EXACTLY two labeled fenced blocks and nothing else.",
        "The blocks must be PLAN_MD and PLAN_JSON.",
        "PLAN_JSON must be valid JSON.",
        "Do not include prose outside the blocks.",
        "The plan must be specific enough for a later /design and /build step.",
        "Include buildSlices in PLAN_JSON. At minimum include scaffold, core, tests, docs if relevant.",
        "",
        "Required format:",
        "PLAN_MD",
        "```markdown",
        "# Project title",
        "...",
        "```",
        "",
        "PLAN_JSON",
        "```json",
        "{ \"projectId\": \"0001\", \"title\": \"...\", \"summary\": \"...\", \"goals\": [], \"nonGoals\": [], \"targetUsers\": [], \"buildSlices\": [], \"acceptanceCriteria\": [], \"risks\": [], \"openQuestions\": [] }",
        "```"
      ].join("\n")
    },
    ...conversation,
    {
      role: "user",
      content: `Finalize the plan for project ${project.id}. Return only PLAN_MD and PLAN_JSON blocks.`
    }
  ];
}

function designFinalizationPrompt(
  project: ProjectRecord,
  planMd: string,
  planJson: string,
  conversation: ChatMessage[]
): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are finalizing Codemakk design artifacts.",
        "Return ONLY labeled fenced blocks.",
        "Required blocks: DESIGN_MD, DESIGN_JSON, and at least one MOCKUP_FILE block.",
        "DESIGN_JSON must be valid JSON.",
        "Mockup files must be standalone HTML with embedded <style> blocks and class-based CSS.",
        "Do not use inline style attributes.",
        "Do not use external assets, CDNs, remote images, or remote fonts.",
        "Mockup paths must be relative under mockups/current/ and end in .html.",
        "No prose outside the labeled blocks.",
        "",
        "Required format:",
        "DESIGN_MD",
        "```markdown",
        "# Design",
        "...",
        "```",
        "",
        "DESIGN_JSON",
        "```json",
        "{ \"projectId\": \"0001\", \"designType\": \"web\", \"screens\": [], \"interactionModel\": [], \"visualStyle\": {}, \"approved\": true }",
        "```",
        "",
        "MOCKUP_FILE: mockups/current/index.html",
        "```html",
        "<!doctype html>",
        "<html>...</html>",
        "```"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "Approved plan markdown:",
        planMd || "[No plan.md]",
        "",
        "Approved plan JSON:",
        planJson || "[No plan.json]"
      ].join("\n")
    },
    ...conversation,
    {
      role: "user",
      content: `Finalize design artifacts and mockups for project ${project.id}.`
    }
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function blockRegex(label: string): RegExp {
  return new RegExp(
    `${escapeRegExp(label)}\\s*\\n` +
      "```[A-Za-z0-9_-]*\\n([\\s\\S]*?)\\n```",
    "m"
  );
}

function parseJsonBlock(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArtifacts(output: string): ArtifactBlocks {
  const planMdMatch = output.match(blockRegex("PLAN_MD"));
  const planJsonMatch = output.match(blockRegex("PLAN_JSON"));
  const designMdMatch = output.match(blockRegex("DESIGN_MD"));
  const designJsonMatch = output.match(blockRegex("DESIGN_JSON"));

  const mockups: Array<{ relativePath: string; content: string }> = [];
  const mockupRegex = /MOCKUP_FILE:\s*([^\n]+)\n```html\n([\s\S]*?)\n```/g;

  for (const match of output.matchAll(mockupRegex)) {
    if (!match[1] || match[2] === undefined) {
      continue;
    }

    mockups.push({
      relativePath: match[1].trim(),
      content: `${match[2].trimEnd()}\n`
    });
  }

  return {
    planMd: planMdMatch?.[1]?.trimEnd(),
    planJson: planJsonMatch?.[1] ? parseJsonBlock(planJsonMatch[1], "PLAN_JSON") : undefined,
    designMd: designMdMatch?.[1]?.trimEnd(),
    designJson: designJsonMatch?.[1] ? parseJsonBlock(designJsonMatch[1], "DESIGN_JSON") : undefined,
    mockups
  };
}

function planningHelp(project: ProjectRecord): void {
  console.log(chalk.bold.cyan(`Planning mode for project ${project.id}`));
  console.log(chalk.gray("Discuss the project. Commands: /done, /cancel, /show"));
  console.log("");
}

function designHelp(project: ProjectRecord): void {
  console.log(chalk.bold.cyan(`Design mode for project ${project.id}`));
  console.log(chalk.gray("Discuss UX/mockups. Commands: /approve, /open [n], /cancel, /show"));
  console.log("");
}

export async function handleProjectsCommand(): Promise<void> {
  await printProjects();
}

export async function handleProjectCommand(projectId: string): Promise<void> {
  await printProject(projectId);
}

export async function handleOpenCommand(args: string): Promise<void> {
  const [projectId, selector] = args.trim().split(/\s+/, 2);

  if (!projectId) {
    console.log(chalk.yellow("Usage: /open <project-id> [mockup-number-or-path]"));
    return;
  }

  await openMockup(projectId, selector);
}

export async function handlePlanCommand(args: {
  client: RouterClient;
  state: AppState;
  rawArgs: string;
}): Promise<void> {
  const trimmed = args.rawArgs.trim();

  if (trimmed === "" || trimmed === "list") {
    await printProjects();
    return;
  }

  let project: ProjectRecord | null;

  if (trimmed === "new") {
    project = await createProject();
    console.log(`${chalk.green("Created project")} ${chalk.yellow(project.id)}`);
  } else {
    project = await getProject(trimmed);

    if (!project) {
      console.log(chalk.red(`Unknown project id: ${trimmed}`));
      return;
    }
  }

  await runPlanningMode(args.client, args.state, project);
}

async function runPlanningMode(
  client: RouterClient,
  state: AppState,
  project: ProjectRecord
): Promise<void> {
  planningHelp(project);

  const history = await readProjectHistory(project.id, "plan");
  const conversation: ChatMessage[] = [
    { role: "system", content: systemPlanningPrompt(project) },
    ...history
  ];

  while (true) {
    const line = await readInteractiveLine(state, `plan[${project.id}] › `);

    if (!line) {
      continue;
    }

    if (line === "/cancel") {
      console.log(chalk.gray("Planning cancelled."));
      return;
    }

    if (line === "/show") {
      await printProject(project.id);
      continue;
    }

    if (line === "/done") {
      console.log(chalk.gray("Finalizing plan..."));
      const output = await streamAssistant({
        client,
        state,
        profile: "deep",
        messages: planFinalizationPrompt(project, conversation)
      });

      console.log(renderMarkdown(output));
      console.log("");

      const artifacts = parseArtifacts(output);

      if (!artifacts.planMd || !artifacts.planJson) {
        console.log(chalk.red("Could not parse PLAN_MD and PLAN_JSON. Continue planning and try /done again."));
        continue;
      }

      await savePlanArtifacts(project, {
        planMd: artifacts.planMd,
        planJson: artifacts.planJson
      });

      console.log(`${chalk.green("Saved approved plan for project")} ${chalk.yellow(project.id)}`);
      return;
    }

    conversation.push({ role: "user", content: line });
    await appendProjectHistory(project.id, "plan", "user", line);

    const output = await streamAssistant({
      client,
      state,
      profile: "deep",
      messages: conversation
    });

    conversation.push({ role: "assistant", content: output });
    await appendProjectHistory(project.id, "plan", "assistant", output);

    console.log(renderMarkdown(output));
    console.log("");
  }
}

export async function handleDesignCommand(args: {
  client: RouterClient;
  state: AppState;
  rawArgs: string;
}): Promise<void> {
  const projectId = args.rawArgs.trim();

  if (!projectId) {
    console.log(chalk.yellow("Usage: /design <project-id>"));
    return;
  }

  const project = await getProject(projectId);

  if (!project) {
    console.log(chalk.red(`Unknown project id: ${projectId}`));
    return;
  }

  await runDesignMode(args.client, args.state, project);
}

async function runDesignMode(
  client: RouterClient,
  state: AppState,
  project: ProjectRecord
): Promise<void> {
  const planMd = await readTextIfExists(projectFile(project, "plan.md"));
  const planJson = await readTextIfExists(projectFile(project, "plan.json"));

  designHelp(project);

  const history = await readProjectHistory(project.id, "design");
  const conversation: ChatMessage[] = [
    { role: "system", content: systemDesignPrompt(project, planMd, planJson) },
    ...history
  ];

  while (true) {
    const line = await readInteractiveLine(state, `design[${project.id}] › `);

    if (!line) {
      continue;
    }

    if (line === "/cancel") {
      console.log(chalk.gray("Design cancelled."));
      return;
    }

    if (line === "/show") {
      await printProject(project.id);
      continue;
    }

    if (line.startsWith("/open")) {
      const selector = line.slice("/open".length).trim();
      await openMockup(project.id, selector || undefined);
      continue;
    }

    if (line === "/approve") {
      console.log(chalk.gray("Finalizing design and mockups..."));
      const output = await streamAssistant({
        client,
        state,
        profile: "deep",
        messages: designFinalizationPrompt(project, planMd, planJson, conversation)
      });

      console.log(renderMarkdown(output));
      console.log("");

      const artifacts = parseArtifacts(output);

      if (!artifacts.designMd || !artifacts.designJson || artifacts.mockups.length === 0) {
        console.log(chalk.red("Could not parse DESIGN_MD, DESIGN_JSON, and at least one MOCKUP_FILE. Continue design and try /approve again."));
        continue;
      }

      await saveDesignArtifacts(project, {
        designMd: artifacts.designMd,
        designJson: artifacts.designJson,
        mockups: artifacts.mockups
      });

      console.log(`${chalk.green("Saved approved design for project")} ${chalk.yellow(project.id)}`);
      const mockups = await listMockups(project);

      if (mockups.length > 0) {
        console.log(chalk.gray("Mockups:"));
        mockups.forEach((mockup, index) => {
          console.log(`  ${chalk.yellow(String(index + 1).padStart(2))}. ${chalk.white(mockup)}`);
        });
        console.log(chalk.gray(`Use /open ${project.id} 1 to open the first mockup.`));
      }

      return;
    }

    conversation.push({ role: "user", content: line });
    await appendProjectHistory(project.id, "design", "user", line);

    const output = await streamAssistant({
      client,
      state,
      profile: "deep",
      messages: conversation
    });

    conversation.push({ role: "assistant", content: output });
    await appendProjectHistory(project.id, "design", "assistant", output);

    console.log(renderMarkdown(output));
    console.log("");
  }
}

function strictBuildPrompt(args: {
  project: ProjectRecord;
  slice: string;
  planMd: string;
  planJson: string;
  designMd: string;
  designJson: string;
  mockups: Array<{ path: string; content: string }>;
}): string {
  return [
    "You are Codemakk build mode.",
    `Project id: ${args.project.id}`,
    `Build slice: ${args.slice}`,
    "Return ONLY source file blocks.",
    "No explanations, no alternatives, no markdown outside file blocks.",
    "Every file must use exactly this format:",
    "",
    "File: relative/path/from/project/root.ext",
    "```lang",
    "full final file contents",
    "```",
    "",
    "Paths must be relative. Never use absolute paths. Never use ../.",
    "Return complete files, not snippets.",
    "Use the approved plan and design below.",
    "",
    "APPROVED PLAN MARKDOWN:",
    args.planMd || "[No plan.md]",
    "",
    "APPROVED PLAN JSON:",
    args.planJson || "[No plan.json]",
    "",
    "APPROVED DESIGN MARKDOWN:",
    args.designMd || "[No design.md]",
    "",
    "APPROVED DESIGN JSON:",
    args.designJson || "[No design.json]",
    "",
    "APPROVED MOCKUPS:",
    ...args.mockups.flatMap((mockup) => [
      `Mockup: ${mockup.path}`,
      "```html",
      mockup.content,
      "```",
      ""
    ])
  ].join("\n");
}

export async function handleBuildCommand(args: {
  client: RouterClient;
  state: AppState;
  rawArgs: string;
}): Promise<void> {
  const [projectId, slice = "scaffold"] = args.rawArgs.trim().split(/\s+/, 2);

  if (!projectId) {
    console.log(chalk.yellow("Usage: /build <project-id> [slice]"));
    return;
  }

  const project = await getProject(projectId);

  if (!project) {
    console.log(chalk.red(`Unknown project id: ${projectId}`));
    return;
  }

  const planMd = await readTextIfExists(projectFile(project, "plan.md"));
  const planJson = await readTextIfExists(projectFile(project, "plan.json"));
  const designMd = await readTextIfExists(projectFile(project, "design.md"));
  const designJson = await readTextIfExists(projectFile(project, "design.json"));
  const mockupPaths = await listMockups(project);
  const mockups = await Promise.all(
    mockupPaths.slice(0, 5).map(async (mockupPath) => ({
      path: mockupPath,
      content: await readTextIfExists(projectFile(project, mockupPath))
    }))
  );

  const prompt = strictBuildPrompt({
    project,
    slice,
    planMd,
    planJson,
    designMd,
    designJson,
    mockups
  });

  console.log(chalk.gray(`Building project ${project.id}, slice ${slice}...`));

  const output = await streamAssistant({
    client: args.client,
    state: args.state,
    profile: "deep",
    messages: [{ role: "user", content: prompt }]
  });

  console.log(renderMarkdown(output));
  console.log("");

  const proposalCount = await setProposalsFromModelOutput(args.state, output);

  if (proposalCount > 0) {
    console.log(chalk.gray(`Detected ${proposalCount} proposal(s). Use /review.`));
    await saveSessionState(args.state);
  }
}
