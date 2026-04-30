import fs from "node:fs/promises";
import path from "node:path";
import type { Suggestion } from "./types.js";
import { workingDir } from "./config.js";

const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  ".codemakk"
]);

const ignoredFiles = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

function isIgnoredPath(filePath: string): boolean {
  const parts = filePath.split(path.sep);

  return (
    parts.some((part) => ignoredDirs.has(part)) ||
    ignoredFiles.has(path.basename(filePath))
  );
}

export async function listFilesRecursive(
  root: string,
  maxFiles = 500
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxFiles) {
      return;
    }

    let entries: Array<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
    }>;

    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as Array<{
        name: string;
        isDirectory(): boolean;
        isFile(): boolean;
      }>;
    } catch {
      return;
    }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }

      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute);

      if (isIgnoredPath(relative)) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(`${relative}/`);
        await walk(absolute);
      } else if (entry.isFile()) {
        results.push(relative);
      }
    }
  }

  await walk(root);

  return results;
}

export function getAtToken(value: string): {
  start: number;
  end: number;
  query: string;
} | null {
  const cursor = value.length;
  const beforeCursor = value.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");

  if (atIndex === -1) {
    return null;
  }

  const beforeAt = atIndex === 0 ? "" : beforeCursor[atIndex - 1];

  if (beforeAt && !/\s/.test(beforeAt)) {
    return null;
  }

  const token = beforeCursor.slice(atIndex + 1);

  if (/\s/.test(token)) {
    return null;
  }

  return {
    start: atIndex,
    end: cursor,
    query: token
  };
}

export async function getFileSuggestions(value: string): Promise<Suggestion[]> {
  const token = getAtToken(value);

  if (!token) {
    return [];
  }

  const query = token.query.toLowerCase();
  const files = await listFilesRecursive(workingDir);

  return files
    .filter((filePath) => filePath.toLowerCase().includes(query))
    .slice(0, 20)
    .map((filePath) => ({
      type: "file",
      filePath,
      isDirectory: filePath.endsWith("/")
    }));
}
