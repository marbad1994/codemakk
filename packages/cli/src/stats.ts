import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { resolveFromRepoRoot } from "./config.js";

type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningOutputTokens?: number;
  estimated?: boolean;
  source?: string;
};

type ModelRunRecord = {
  id?: string;
  timestamp?: number;
  requestId?: string;
  mode?: string;
  taskType?: string;
  modelKey?: string;
  provider?: string;
  providerModel?: string;
  status?: string;
  latencyMs?: number;
  tokenUsage?: TokenUsage;
  fallbackIndex?: number;
  judgeReason?: string;
  error?: string;
  inputChars?: number;
  outputChars?: number;
};

type ModelAggregate = {
  modelKey: string;
  runs: number;
  success: number;
  failed: number;
  rejected: number;
  suspicious: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningOutputTokens: number;
  estimatedTokens: number;
  realTokens: number;
  latencyMs: number;
  maxInputTokens: number;
};

function ledgerPath(): string {
  return resolveFromRepoRoot(
    process.env.CODEMAKK_MODEL_RUN_LEDGER_PATH ??
      "../cline-model-router/data/model-runs.jsonl"
  );
}

function n(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatMs(value: number): string {
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) {
    return "unknown";
  }

  return new Date(timestamp).toLocaleString();
}

async function readLedger(): Promise<ModelRunRecord[]> {
  const file = ledgerPath();

  let raw: string;

  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    console.log(chalk.yellow(`No model run ledger found at: ${file}`));
    console.log(chalk.gray("Set CODEMAKK_MODEL_RUN_LEDGER_PATH with /config."));
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ModelRunRecord];
      } catch {
        return [];
      }
    });
}

function aggregateByModel(records: ModelRunRecord[]): ModelAggregate[] {
  const map = new Map<string, ModelAggregate>();

  for (const record of records) {
    const modelKey = record.modelKey ?? "unknown";
    const usage = record.tokenUsage ?? {};
    const totalTokens = n(usage.totalTokens);
    const inputTokens = n(usage.inputTokens);
    const outputTokens = n(usage.outputTokens);

    const existing =
      map.get(modelKey) ??
      {
        modelKey,
        runs: 0,
        success: 0,
        failed: 0,
        rejected: 0,
        suspicious: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedInputTokens: 0,
        reasoningOutputTokens: 0,
        estimatedTokens: 0,
        realTokens: 0,
        latencyMs: 0,
        maxInputTokens: 0
      };

    existing.runs += 1;
    existing.inputTokens += inputTokens;
    existing.outputTokens += outputTokens;
    existing.totalTokens += totalTokens;
    existing.cachedInputTokens += n(usage.cachedInputTokens);
    existing.reasoningOutputTokens += n(usage.reasoningOutputTokens);
    existing.latencyMs += n(record.latencyMs);
    existing.maxInputTokens = Math.max(existing.maxInputTokens, inputTokens);

    if (usage.estimated === true) {
      existing.estimatedTokens += totalTokens;
    } else {
      existing.realTokens += totalTokens;
    }

    if (record.status === "success") existing.success += 1;
    else if (record.status === "failed") existing.failed += 1;
    else if (record.status === "rejected") existing.rejected += 1;
    else if (record.status === "suspicious") existing.suspicious += 1;

    map.set(modelKey, existing);
  }

  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

function printOverview(records: ModelRunRecord[]): void {
  const totalTokens = records.reduce(
    (sum, record) => sum + n(record.tokenUsage?.totalTokens),
    0
  );

  const inputTokens = records.reduce(
    (sum, record) => sum + n(record.tokenUsage?.inputTokens),
    0
  );

  const outputTokens = records.reduce(
    (sum, record) => sum + n(record.tokenUsage?.outputTokens),
    0
  );

  const cachedInputTokens = records.reduce(
    (sum, record) => sum + n(record.tokenUsage?.cachedInputTokens),
    0
  );

  const realTokens = records
    .filter((record) => record.tokenUsage?.estimated !== true)
    .reduce((sum, record) => sum + n(record.tokenUsage?.totalTokens), 0);

  const estimatedTokens = records
    .filter((record) => record.tokenUsage?.estimated === true)
    .reduce((sum, record) => sum + n(record.tokenUsage?.totalTokens), 0);

  const success = records.filter((record) => record.status === "success").length;
  const failed = records.filter((record) => record.status === "failed").length;
  const rejected = records.filter((record) => record.status === "rejected").length;
  const suspicious = records.filter((record) => record.status === "suspicious").length;

  const avgLatency =
    records.length === 0
      ? 0
      : records.reduce((sum, record) => sum + n(record.latencyMs), 0) / records.length;

  console.log("");
  console.log(chalk.bold.cyan("Stats overview"));
  console.log(chalk.gray(`Ledger: ${ledgerPath()}`));
  console.log("");

  console.log(`${chalk.gray("Runs:")} ${chalk.white(formatNumber(records.length))}`);
  console.log(`${chalk.green("Success:")} ${formatNumber(success)}  ${chalk.red("Failed:")} ${formatNumber(failed)}  ${chalk.yellow("Rejected:")} ${formatNumber(rejected)}  ${chalk.magenta("Suspicious:")} ${formatNumber(suspicious)}`);
  console.log(`${chalk.gray("Avg latency:")} ${chalk.white(formatMs(avgLatency))}`);
  console.log("");

  console.log(`${chalk.gray("Input tokens:")} ${chalk.yellow(formatNumber(inputTokens))}`);
  console.log(`${chalk.gray("Output tokens:")} ${chalk.yellow(formatNumber(outputTokens))}`);
  console.log(`${chalk.gray("Total tokens:")} ${chalk.yellow(formatNumber(totalTokens))}`);
  console.log(`${chalk.gray("Cached input:")} ${chalk.green(formatNumber(cachedInputTokens))}`);
  console.log("");

  console.log(`${chalk.gray("Real provider tokens:")} ${chalk.green(formatNumber(realTokens))}`);
  console.log(`${chalk.gray("Estimated tokens:")} ${chalk.yellow(formatNumber(estimatedTokens))}`);

  if (estimatedTokens > 0) {
    console.log(chalk.gray("Note: estimated tokens are rough char/4 guesses, not billing-accurate."));
  }

  console.log("");
}

function printByModel(records: ModelRunRecord[]): void {
  const models = aggregateByModel(records);

  console.log(chalk.bold.cyan("By model"));
  console.log("");

  for (const model of models) {
    const avgLatency =
      model.runs === 0
        ? 0
        : model.latencyMs / model.runs;

    console.log(
      `${chalk.magenta(model.modelKey.padEnd(18))} ` +
        `${chalk.gray("runs")} ${formatNumber(model.runs).padStart(4)}  ` +
        `${chalk.gray("tokens")} ${chalk.yellow(formatNumber(model.totalTokens)).padStart(10)}  ` +
        `${chalk.gray("in")} ${formatNumber(model.inputTokens).padStart(10)}  ` +
        `${chalk.gray("out")} ${formatNumber(model.outputTokens).padStart(8)}  ` +
        `${chalk.gray("avg")} ${formatMs(avgLatency).padStart(7)}`
    );
  }

  console.log("");
}

function printRecent(records: ModelRunRecord[], limit = 10): void {
  const recent = [...records]
    .sort((a, b) => n(b.timestamp) - n(a.timestamp))
    .slice(0, limit);

  console.log(chalk.bold.cyan(`Recent ${recent.length} runs`));
  console.log("");

  for (const record of recent) {
    const usage = record.tokenUsage ?? {};
    const estimated = usage.estimated ? chalk.yellow("estimated") : chalk.green("real");

    console.log(
      `${chalk.gray(formatDate(record.timestamp))}  ` +
        `${chalk.magenta(record.modelKey ?? "unknown")}  ` +
        `${chalk.white(record.status ?? "unknown")}  ` +
        `${chalk.yellow(formatNumber(n(usage.totalTokens)))} tokens  ` +
        `${chalk.gray(formatMs(n(record.latencyMs)))}  ` +
        estimated
    );
  }

  console.log("");
}

function printLargestInputs(records: ModelRunRecord[], limit = 8): void {
  const largest = [...records]
    .sort((a, b) => n(b.tokenUsage?.inputTokens) - n(a.tokenUsage?.inputTokens))
    .slice(0, limit);

  console.log(chalk.bold.cyan("Largest input runs"));
  console.log("");

  for (const record of largest) {
    console.log(
      `${chalk.magenta((record.modelKey ?? "unknown").padEnd(18))} ` +
        `${chalk.yellow(formatNumber(n(record.tokenUsage?.inputTokens))).padStart(10)} input tokens  ` +
        `${chalk.gray(formatDate(record.timestamp))}  ` +
        `${record.tokenUsage?.estimated ? chalk.yellow("estimated") : chalk.green("real")}`
    );
  }

  console.log("");
}

export async function printStats(mode = "overview"): Promise<void> {
  const records = await readLedger();

  if (records.length === 0) {
    return;
  }

  if (mode === "model") {
    printByModel(records);
    return;
  }

  if (mode === "recent") {
    printRecent(records);
    return;
  }

  if (mode === "largest") {
    printLargestInputs(records);
    return;
  }

  printOverview(records);
  printByModel(records.slice(-200));
  printLargestInputs(records);
}
