import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { selectMenu } from "./menus.js";
import { repoRoot } from "./config.js";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";

type RegistryModel = {
  key: string;
  enabled: boolean | null;
  provider?: string;
  model?: string;
  label?: string;
  start: number;
  end: number;
  block: string;
};

function clearScreen(): void {
  output.write("\x1b[2J\x1b[H");
}

function registryPath(): string {
  const configured = process.env.CODEMAKK_ROUTER_REGISTRY_PATH;

  if (configured && configured.trim()) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot, configured);
  }

  return path.resolve(repoRoot, "../cline-model-router/src/router/modelRegistry.ts");
}

async function readRegistry(): Promise<string> {
  return fs.readFile(registryPath(), "utf8");
}

function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  let inString: "'" | '"' | "\`" | null = null;
  let escaped = false;

  for (let i = openIndex; i < source.length; i++) {
    const char = source[i]!;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === inString) {
        inString = null;
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "\`") {
      inString = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function extractStringProperty(block: string, name: string): string | undefined {
  const regex = new RegExp(`${name}\\s*:\\s*["']([^"']+)["']`);
  const match = block.match(regex);

  return match?.[1];
}


function extractEnabled(block: string): boolean | null {
  const match = block.match(/enabled\s*:\s*(true|false)/);

  if (!match) {
    return null;
  }

  return match[1] === "true";
}

function parseRegistryModels(source: string): RegistryModel[] {
  const models: RegistryModel[] = [];
  const keyRegex = /([A-Za-z0-9_-]+)\s*:\s*\{/g;

  for (const match of source.matchAll(keyRegex)) {
    const key = match[1];

    if (!key || match.index === undefined) {
      continue;
    }

    const openIndex = source.indexOf("{", match.index);

    if (openIndex === -1) {
      continue;
    }

    const end = findMatchingBrace(source, openIndex);

    if (end === -1) {
      continue;
    }

    const block = source.slice(openIndex, end + 1);

    if (
      !/provider\s*:/.test(block) &&
      !/model\s*:/.test(block) &&
      !/enabled\s*:/.test(block)
    ) {
      continue;
    }

    models.push({
      key,
      enabled: extractEnabled(block),
      provider: extractStringProperty(block, "provider"),
      model: extractStringProperty(block, "model"),
      label: extractStringProperty(block, "label"),
      start: openIndex,
      end: end + 1,
      block
    });
  }

  return models;
}
function toggleEnabledInBlock(block: string, nextEnabled: boolean): string {
  if (/enabled\s*:\s*(true|false)/.test(block)) {
    return block.replace(
      /enabled\s*:\s*(true|false)/,
      `enabled: ${String(nextEnabled)}`
    );
  }

  return block.replace("{", `{\n  enabled: ${String(nextEnabled)},`);
}

async function writeToggledModel(
  model: RegistryModel,
  nextEnabled: boolean
): Promise<string> {
  const filePath = registryPath();
  const source = await readRegistry();
  const latestModels = parseRegistryModels(source);
  const latest = latestModels.find((entry) => entry.key === model.key);

  if (!latest) {
    throw new Error(`Model no longer found in registry: ${model.key}`);
  }

  const nextBlock = toggleEnabledInBlock(latest.block, nextEnabled);

  const nextSource =
    source.slice(0, latest.start) +
    nextBlock +
    source.slice(latest.end);

  const backupPath = `${filePath}.bak-model-registry-${Date.now()}`;

  await fs.copyFile(filePath, backupPath);
  await fs.writeFile(filePath, nextSource, "utf8");

  return backupPath;
}

function formatModel(model: RegistryModel, selected: boolean): string {
  const marker = selected ? chalk.black.bgCyan(" › ") : chalk.gray("   ");
  const status =
    model.enabled === false
      ? chalk.red("disabled")
      : model.enabled === true
        ? chalk.green("enabled ")
        : chalk.yellow("unknown ");

  const key = selected
    ? chalk.cyanBright.bold(model.key.padEnd(24))
    : chalk.cyan(model.key.padEnd(24));

  const provider = chalk.gray((model.provider ?? "provider?").padEnd(14));
  const remoteModel = chalk.gray(model.model ?? model.label ?? "");

  return `${marker} ${status} ${key} ${provider} ${remoteModel}`;
}

export async function openModelRegistryMenu(): Promise<void> {
  readline.emitKeypressEvents(input);

  if (input.isTTY) {
    input.setRawMode(true);
  }

  let index = 0;
  let message: string | null = null;

  async function loadModels(): Promise<RegistryModel[]> {
    const source = await readRegistry();
    return parseRegistryModels(source);
  }

  function render(models: RegistryModel[]): void {
    clearScreen();

    console.log(chalk.bold.cyan("Model registry"));
    console.log(chalk.gray(`Path: ${registryPath()}`));
    console.log(chalk.gray("↑/↓ navigate · Space toggle · q/Esc exit"));
    console.log("");

    if (message) {
      console.log(message);
      console.log("");
    }

    for (let i = 0; i < models.length; i++) {
      console.log(formatModel(models[i]!, i === index));
    }
  }

  try {
    let models = await loadModels();

    if (models.length === 0) {
      console.log("");
      console.log(chalk.yellow("No models found in registry."));
      console.log(chalk.gray(`Registry path: ${registryPath()}`));
      console.log("");
      return;
    }

    render(models);

    await new Promise<void>((resolve) => {
      const onKeypress = (_str: string, key: readline.Key) => {
        void (async () => {
          if (key.name === "q" || key.name === "escape") {
            cleanup();
            resolve();
            return;
          }

          if (key.name === "up") {
            index = index <= 0 ? models.length - 1 : index - 1;
            render(models);
            return;
          }

          if (key.name === "down") {
            index = index >= models.length - 1 ? 0 : index + 1;
            render(models);
            return;
          }

          if (key.name === "space" || _str === " ") {
            const selected = models[index];

            if (!selected) {
              return;
            }

            const nextEnabled = selected.enabled === false;

            await writeToggledModel(selected, nextEnabled);

            message = nextEnabled
              ? chalk.green(`Enabled ${selected.key}`)
              : chalk.red(`Disabled ${selected.key}`);

            models = await loadModels();

            if (index >= models.length) {
              index = Math.max(0, models.length - 1);
            }

            render(models);
          }
        })().catch((error) => {
          cleanup();
          console.error(chalk.red(error instanceof Error ? error.message : String(error)));
          resolve();
        });
      };

      function cleanup(): void {
        input.off("keypress", onKeypress);

        if (input.isTTY) {
          input.setRawMode(false);
        }

        clearScreen();
        console.log(chalk.gray("Model registry closed."));
        console.log("");
      }

      input.on("keypress", onKeypress);
    });
  } catch (error) {
    if (input.isTTY) {
      input.setRawMode(false);
    }

    console.log("");
    console.log(chalk.red("Could not read router model registry."));
    console.log(chalk.gray(`Expected path: ${registryPath()}`));
    console.log(
      chalk.gray(
        "Set CODEMAKK_ROUTER_REGISTRY_PATH in /config if your router registry lives elsewhere."
      )
    );
    console.log(chalk.red(error instanceof Error ? error.message : String(error)));
    console.log("");
  }
}
