#!/usr/bin/env node

import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import { RouterClient } from "@codemakk/core";
import {
  apiKey,
  defaultLocalPreference,
  defaultModel,
  defaultProfile,
  defaultSpeed,
  routerBaseUrl
} from "./config.js";
import type { AppState } from "./types.js";
import { readInteractiveLine } from "./input.js";
import { printHelp } from "./help.js";
import { openModeMenu, openSkillsMenu, openSpeedMenu } from "./actions.js";
import { openModelRegistryMenu } from "./modelRegistry.js";
import { openConfigMenu, setConfigValue } from "./configManager.js";
import { printStats } from "./stats.js";
import {
  addContextFiles,
  buildPromptWithContext,
  countContext,
  extractMentionedFiles,
  printContext,
  stripFileMentions
} from "./context.js";
import { renderMarkdown } from "./markdown.js";
import {
  applyAcceptedProposals,
  buildRevisionPrompt,
  commentOnProposal,
  proposalSummary,
  setProposalsFromModelOutput
} from "./proposals.js";
import { openReviewQueue, printProposalList } from "./review.js";
import { loadSessionState, saveSessionState, sessionPath } from "./session.js";
import { printMainShow } from "./show.js";
import {
  handleBuildCommand,
  handleDesignCommand,
  handleOpenCommand,
  handlePlanCommand,
  handleProjectCommand,
  handleProjectsCommand
} from "./workflow.js";

async function streamResponse(args: {
  client: RouterClient;
  state: AppState;
  prompt: string;
}): Promise<{
  text: string;
  interrupted: boolean;
  usedModel?: string;
}> {
  readline.emitKeypressEvents(input);

  const controller = new AbortController();

  let interrupted = false;
  let responseText = "";
  let usedModel: string | undefined;

  const onKeypress = (_str: string, key: readline.Key) => {
    if (key.name === "q" && !key.ctrl && !key.meta) {
      interrupted = true;
      controller.abort();
      output.write(chalk.yellow("\n\nInterrupted with q.\n"));
    }
  };

  input.on("keypress", onKeypress);

  if (input.isTTY) {
    input.setRawMode(true);
  }

  try {
    for await (const chunk of args.client.chatStream({
      model: args.state.model,
      profile: args.state.profile as any,
      speed: args.state.speed,
      localPreference: args.state.localPreference,
      signal: controller.signal,
      messages: [
        {
          role: "user",
          content: args.prompt
        }
      ]
    })) {
      if (!usedModel && (chunk.usedModel || chunk.model)) {
        usedModel = chunk.usedModel ?? chunk.model;
        console.log(chalk.gray("\nModel used: ") + chalk.magenta(usedModel));
        console.log("");
      }

      responseText += chunk.content;
    }
  } catch (error) {
    if (!interrupted) {
      throw error;
    }
  } finally {
    input.off("keypress", onKeypress);

    if (input.isTTY) {
      input.setRawMode(false);
    }
  }

  return {
    text: responseText,
    interrupted,
    usedModel
  };
}

function strictFileOutputInstruction(createMode: boolean): string {
  const lines = [
    "CODEMAKK FILE OUTPUT RULES:",
    "When the user asks you to create, modify, rewrite, patch, fix, or update files, you MUST return file blocks only.",
    "Do not include explanations, apologies, alternatives, analysis, markdown headings, or prose outside file blocks.",
    "Do not show multiple versions of the same file. Return only the final version.",
    "Do not say 'I will', 'Here is', 'Let me correct', or 'Wait'.",
    "Do not use placeholders.",
    "Every file block MUST use exactly this format:",
    "",
    "File: relative/path/from/project/root.ext",
    "```lang",
    "full final file contents",
    "```",
    "",
    "Paths must be relative. Never use absolute paths. Never use ../.",
    "If modifying a file, return the entire final file, not a snippet.",
    "If creating multiple files, return each file once.",
    "If you cannot comply exactly, return no file blocks."
  ];

  if (createMode) {
    lines.unshift("You are in codemakk create/review mode.");
    lines.push("In create/review mode, output ONLY file blocks and nothing else.");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const client = new RouterClient(routerBaseUrl, apiKey);

  const state: AppState = {
    model: defaultModel,
    profile: defaultProfile,
    speed: defaultSpeed,
    localPreference: defaultLocalPreference,
    contextFiles: [],
    skill: null,
    pendingEdits: [],
    proposals: [],
    lastResponseText: "",
    createMode: false
  };

  const restoredSession = await loadSessionState(state);

  if (restoredSession && state.proposals.length > 0) {
    console.log(
      chalk.yellow(
        `Recovered ${state.proposals.length} proposal(s) from ${sessionPath()}. Use /review to continue.`
      )
    );
    console.log("");
  }

  const banner = `
╭──────────────────────────────────────────────────────────────────────╮
│  ██████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ██╗  ██╗██╗  ██╗ │
│ ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗██║ ██╔╝██║ ██╔╝ │
│ ██║     ██║   ██║██║  ██║█████╗  ██╔████╔██║███████║█████╔╝ █████╔╝  │
│ ██║     ██║   ██║██║  ██║██╔══╝  ██║╚██╔╝██║██╔══██║██╔═██╗ ██╔═██╗  │
│ ╚██████╗╚██████╔╝██████╔╝███████╗██║ ╚═╝ ██║██║  ██║██║  ██╗██║  ██╗ │
│  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ │
╰──────────────────────────────────────────────────────────────────────╯
`;
  console.log(chalk.bold.cyan(banner));
  console.log(chalk.bold.cyan("Welcome to codemakk CLI!"));
  const version = process.env.npm_package_version ?? "unknown";
  console.log(chalk.gray(`Version: ${version}`));
  const explainer = `This CLI allows you to interact with codemakk, a code assistant that can help you with various coding tasks.\nYou can ask questions, get explanations, generate code snippets, and more.\nThe CLI supports context files, which can provide additional information to the assistant.\nYou can also configure the model, profile, and speed of the assistant to suit your needs.`;
  console.log(chalk.gray(explainer));
  console.log("");
  console.log(
    `${chalk.gray("Type")} ${chalk.cyan("/show")} ${chalk.gray("for workflow commands, ")} ${chalk.cyan("/help")} ${chalk.gray("for all commands, or ")} ${chalk.yellow("@")} ${chalk.gray("for files.")}`
  );
  console.log("");

  while (true) {
    const line = await readInteractiveLine(state, "codemakk › ");

    if (!line) {
      continue;
    }

    const mentionedFiles = extractMentionedFiles(line);

    if (mentionedFiles.length > 0) {
      addContextFiles(state, mentionedFiles);
      await saveSessionState(state);
    }

    const lineWithoutMentions = stripFileMentions(line);
    let lineWithoutMentionsForPrompt = lineWithoutMentions;

    if (lineWithoutMentions === "/exit" || lineWithoutMentions === "/quit") {
      break;
    }

    if (lineWithoutMentions === "/help") {
      printHelp();
      continue;
    }

    if (lineWithoutMentions === "/show") {
      printMainShow();
      continue;
    }

    if (lineWithoutMentions === "/config") {
      await openConfigMenu();
      continue;
    }

    if (lineWithoutMentions === "/models") {
      await openModelRegistryMenu();
      continue;
    }

    if (lineWithoutMentions === "/mode") {
      await openModeMenu(state);
      continue;
    }

    if (lineWithoutMentions.startsWith("/model ")) {
      state.model = lineWithoutMentions.slice("/model ".length).trim();
      await setConfigValue("CODEMAKK_DEFAULT_MODEL", state.model);

      console.log(
        `${chalk.gray("Model:")} ${chalk.magenta(state.model)} ${chalk.gray("(saved)")}`
      );
      continue;
    }

    if (lineWithoutMentions.startsWith("/profile ")) {
      state.profile = lineWithoutMentions.slice("/profile ".length).trim();
      await setConfigValue("CODEMAKK_DEFAULT_PROFILE", state.profile);

      console.log(
        `${chalk.gray("Mode:")} ${chalk.cyan(state.profile)} ${chalk.gray("(saved)")}`
      );
      continue;
    }

    if (lineWithoutMentions === "/speed") {
      await openSpeedMenu(state);
      continue;
    }

    if (lineWithoutMentions === "/skills") {
      await openSkillsMenu(state);
      continue;
    }

    if (lineWithoutMentions === "/context") {
      printContext(state.contextFiles);
      continue;
    }

    if (lineWithoutMentions.startsWith("/remove ")) {
      const target = lineWithoutMentions.slice("/remove ".length).trim();

      state.contextFiles = state.contextFiles.filter((file) => file !== target);
      await saveSessionState(state);
      printContext(state.contextFiles);
      continue;
    }

    if (lineWithoutMentions === "/clear") {
      state.contextFiles = [];
      await saveSessionState(state);
      console.log(chalk.gray("Context cleared."));
      continue;
    }

    if (lineWithoutMentions === "/count") {
      await countContext(state);
      continue;
    }

    if (lineWithoutMentions === "/stats") {
      await printStats("overview");
      continue;
    }

    if (lineWithoutMentions === "/stats-model") {
      await printStats("model");
      continue;
    }

    if (lineWithoutMentions === "/stats-recent") {
      await printStats("recent");
      continue;
    }

    if (lineWithoutMentions === "/stats-largest") {
      await printStats("largest");
      continue;
    }

    if (lineWithoutMentions === "/projects") {
      await handleProjectsCommand();
      continue;
    }

    if (lineWithoutMentions.startsWith("/project ")) {
      await handleProjectCommand(lineWithoutMentions.slice("/project ".length).trim());
      continue;
    }

    if (lineWithoutMentions.startsWith("/plan")) {
      await handlePlanCommand({
        client,
        state,
        rawArgs: lineWithoutMentions.slice("/plan".length).trim()
      });
      continue;
    }

    if (lineWithoutMentions.startsWith("/design ")) {
      await handleDesignCommand({
        client,
        state,
        rawArgs: lineWithoutMentions.slice("/design ".length).trim()
      });
      continue;
    }

    if (lineWithoutMentions.startsWith("/open ")) {
      await handleOpenCommand(lineWithoutMentions.slice("/open ".length).trim());
      continue;
    }

    if (lineWithoutMentions.startsWith("/build ")) {
      await handleBuildCommand({
        client,
        state,
        rawArgs: lineWithoutMentions.slice("/build ".length).trim()
      });
      continue;
    }

    if (lineWithoutMentions === "/create") {
      state.createMode = true;
      await saveSessionState(state);
      console.log(chalk.green("Create mode enabled for the next prompt."));
      console.log(chalk.gray("Every file proposal in the next response will enter review mode."));
      continue;
    }

    if (lineWithoutMentions === "/proposals") {
      printProposalList(state);
      continue;
    }

    if (lineWithoutMentions === "/review") {
      await openReviewQueue(state);
      continue;
    }

    if (lineWithoutMentions.startsWith("/comment ")) {
      const rest = lineWithoutMentions.slice("/comment ".length).trim();
      const match = rest.match(/^(\d+)\s+([\s\S]+)$/);

      if (!match) {
        console.log(chalk.yellow("Usage: /comment <proposal-number> <comment>"));
        continue;
      }

      await commentOnProposal(state, Number(match[1]) - 1, match[2]);
      continue;
    }

    if (lineWithoutMentions === "/revise") {
      const revisionPrompt = buildRevisionPrompt(state);

      if (!revisionPrompt) {
        console.log(chalk.gray("No proposals marked for revision. Use /review and press c, or /comment <n> <comment>."));
        continue;
      }

      lineWithoutMentionsForPrompt = revisionPrompt;
    }

    if (lineWithoutMentions === "/diff") {
      console.log(chalk.gray("Diff view moved into /review. Press 1 for diff, 2 original, 3 proposal, 4 side-by-side."));
      await openReviewQueue(state);
      continue;
    }

    if (lineWithoutMentions === "/apply") {
      await applyAcceptedProposals(state);
      continue;
    }

    const rawPrompt = lineWithoutMentionsForPrompt.startsWith("/ask ")
      ? lineWithoutMentionsForPrompt.slice("/ask ".length).trim()
      : lineWithoutMentionsForPrompt;

    const prompt = await buildPromptWithContext(
      `${strictFileOutputInstruction(state.createMode)}\n\n${rawPrompt}`,
      state
    );

    process.stdout.write(
      chalk.gray("\nStreaming response... ") +
        chalk.yellow("\npress q to interrupt") +
        chalk.gray("\n\n")
    );

    const result = await streamResponse({
      client,
      state,
      prompt
    });

    if (result.text.trim()) {
      state.lastResponseText = result.text;

      console.log(renderMarkdown(result.text));
      console.log("");

      const proposalCount = await setProposalsFromModelOutput(state, result.text);

      if (proposalCount > 0) {
        console.log(chalk.gray(proposalSummary(state)));
        console.log(chalk.gray("Use /review to inspect proposals. /apply writes only accepted files."));
      }

      state.createMode = false;
      await saveSessionState(state);
    }

    if (result.interrupted) {
      state.createMode = false;
      await saveSessionState(state);
      console.log(chalk.yellow("Response was interrupted. Create/review flow cancelled."));
      console.log("");
    }
  }
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
