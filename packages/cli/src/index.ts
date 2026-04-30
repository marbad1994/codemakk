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
import { openSkillsMenu, openSpeedMenu, openModeMenu } from "./actions.js";
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

async function main(): Promise<void> {
  const client = new RouterClient(routerBaseUrl, apiKey);

  const state: AppState = {
    model: defaultModel,
    profile: defaultProfile,
    speed: defaultSpeed,
    localPreference: defaultLocalPreference,
    contextFiles: [],
    skill: null
  };

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
    `${chalk.gray("Type")} ${chalk.cyan("/help")} ${chalk.gray("for commands. Type")} ${chalk.cyan("/")} ${chalk.gray("for commands or")} ${chalk.yellow("@")} ${chalk.gray("for files.")}`
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
    }

    const lineWithoutMentions = stripFileMentions(line);

    if (lineWithoutMentions === "/exit" || lineWithoutMentions === "/quit") {
      break;
    }

    if (lineWithoutMentions === "/help") {
      printHelp();
      continue;
    }

    if (lineWithoutMentions === "/config") {
      await openConfigMenu();
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
        `${chalk.gray("Profile:")} ${chalk.cyan(state.profile)} ${chalk.gray("(saved)")}`
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
      printContext(state.contextFiles);
      continue;
    }

    if (lineWithoutMentions === "/clear") {
      state.contextFiles = [];
      console.log(chalk.gray("Context cleared."));
      continue;
    }

    if (lineWithoutMentions.startsWith("/session")) {
      console.log(chalk.yellow("Sessions are not implemented yet."));
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

    if (lineWithoutMentions === "/diff") {
      console.log(chalk.yellow("Diff preview is not implemented yet."));
      continue;
    }

    if (lineWithoutMentions === "/apply") {
      console.log(chalk.yellow("Apply is not implemented yet."));
      continue;
    }

    const rawPrompt = lineWithoutMentions.startsWith("/ask ")
      ? lineWithoutMentions.slice("/ask ".length).trim()
      : lineWithoutMentions;

    const prompt = await buildPromptWithContext(rawPrompt, state);

    process.stdout.write(
      chalk.gray("\nStreaming response... ") +
        chalk.yellow("press q to interrupt") +
        chalk.gray("\n\n")
    );

    const result = await streamResponse({
      client,
      state,
      prompt
    });

    if (result.text.trim()) {
      console.log(renderMarkdown(result.text));
      console.log("");
    }

    if (result.interrupted) {
      console.log(chalk.yellow("Response was interrupted. Partial output shown above."));
      console.log("");
    }
  }
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});