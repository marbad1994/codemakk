import fs from "node:fs/promises";
import chalk from "chalk";
import {
  apiKey,
  defaultLocalPreference,
  defaultModel,
  defaultProfile,
  defaultSpeed,
  envPath,
  repoRoot,
  routerBaseUrl
} from "./config.js";
import { selectMenu } from "./menus.js";

type ConfigItem = {
  key: string;
  label: string;
  value: string;
  description: string;
};

function currentConfig(): ConfigItem[] {
  return [
    {
      key: "CODEMAKK_ROUTER_BASE_URL",
      label: "Router base URL",
      value: process.env.CODEMAKK_ROUTER_BASE_URL ?? routerBaseUrl,
      description: "OpenAI-compatible router endpoint"
    },
    {
      key: "CODEMAKK_API_KEY",
      label: "API key",
      value: process.env.CODEMAKK_API_KEY ?? apiKey,
      description: "Usually dummy for local router"
    },
    {
      key: "CODEMAKK_DEFAULT_MODEL",
      label: "Default model",
      value: process.env.CODEMAKK_DEFAULT_MODEL ?? defaultModel,
      description: "Model sent in request body"
    },
    {
      key: "CODEMAKK_DEFAULT_PROFILE",
      label: "Default profile",
      value: process.env.CODEMAKK_DEFAULT_PROFILE ?? defaultProfile,
      description: "Router profile header"
    },
    {
      key: "CODEMAKK_DEFAULT_SPEED",
      label: "Default speed",
      value: process.env.CODEMAKK_DEFAULT_SPEED ?? String(defaultSpeed),
      description: "Router speed header"
    },
    {
      key: "CODEMAKK_DEFAULT_LOCAL_PREFERENCE",
      label: "Local preference",
      value:
        process.env.CODEMAKK_DEFAULT_LOCAL_PREFERENCE ??
        String(defaultLocalPreference),
      description: "Prefer local/free models"
    },
    {
      key: "CODEMAKK_MODEL_RUN_LEDGER_PATH",
      label: "Model run ledger",
      value:
        process.env.CODEMAKK_MODEL_RUN_LEDGER_PATH ??
        "../cline-model-router/data/model-runs.jsonl",
      description: "Path to router model-runs.jsonl"
    }
  ];
}

async function readEnvFile(): Promise<string> {
  try {
    return await fs.readFile(envPath, "utf8");
  } catch {
    return "";
  }
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const raw = await readEnvFile();
  const lines = raw.split(/\r?\n/);
  const escaped = value.replace(/\n/g, "\\n");

  let found = false;

  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${escaped}`;
    }

    return line;
  });

  if (!found) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
      nextLines.push("");
    }

    nextLines.push(`${key}=${escaped}`);
  }

  await fs.writeFile(
    envPath,
    nextLines.join("\n").replace(/\n+$/, "\n"),
    "utf8"
  );

  process.env[key] = value;
}

async function askValue(prompt: string, current: string): Promise<string | null> {
  process.stdout.write(`${chalk.green(prompt)} ${chalk.gray(`[${current}]`)} `);

  return new Promise((resolve) => {
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let value = "";

    const onData = (chunk: string) => {
      if (chunk.includes("\n") || chunk.includes("\r")) {
        process.stdin.off("data", onData);
        resolve(value.trim() || current);
        return;
      }

      value += chunk;
    };

    process.stdin.on("data", onData);
  });
}

export function printConfig(): void {
  console.log("");
  console.log(chalk.bold.cyan("Config"));
  console.log(chalk.gray(`Repo root: ${repoRoot}`));
  console.log(chalk.gray(`Env file:  ${envPath}`));
  console.log("");

  for (const item of currentConfig()) {
    console.log(`${chalk.cyan(item.key.padEnd(36))} ${chalk.white(item.value)}`);
    console.log(`  ${chalk.gray(item.description)}`);
  }

  console.log("");
}

export async function openConfigMenu(): Promise<void> {
  const selected = await selectMenu({
    title: "Config",
    items: currentConfig(),
    renderItem: (item, selectedItem) => {
      const marker = selectedItem
        ? chalk.black.bgCyan(" › ")
        : chalk.gray("   ");

      const key = selectedItem
        ? chalk.cyanBright.bold(item.key.padEnd(36))
        : chalk.cyan(item.key.padEnd(36));

      const value = selectedItem
        ? chalk.whiteBright(item.value)
        : chalk.gray(item.value);

      return `${marker} ${key} ${value}`;
    }
  });

  if (!selected) {
    return;
  }

  const next = await askValue(`New value for ${selected.key}:`, selected.value);

  if (next === null) {
    return;
  }

  await setConfigValue(selected.key, next);

  console.log(
    `${chalk.gray("Updated")} ${chalk.cyan(selected.key)} ${chalk.gray("in")} ${chalk.white(envPath)}`
  );
}