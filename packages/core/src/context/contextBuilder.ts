import fs from "node:fs/promises";
import path from "node:path";
import { estimateTokens } from "../tokens/tokenEstimator.js";
import type { BuiltContext, ContextFile } from "./types.js";

export async function buildContext(
  files: string[],
  root = process.cwd()
): Promise<BuiltContext> {
  const contextFiles: ContextFile[] = [];

  for (const file of files) {
    const absolute = path.resolve(root, file);
    const content = await fs.readFile(absolute, "utf8");
    const relative = path.relative(root, absolute);

    contextFiles.push({
      path: relative,
      content,
      chars: content.length,
      estimatedTokens: estimateTokens(content)
    });
  }

  return {
    files: contextFiles,
    totalChars: contextFiles.reduce((sum, file) => sum + file.chars, 0),
    estimatedTokens: contextFiles.reduce((sum, file) => sum + file.estimatedTokens, 0)
  };
}
