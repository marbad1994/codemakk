import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function findRepoRoot(startDir = process.cwd()): string {
  let current = startDir;

  while (true) {
    const packageJsonPath = path.join(current, "package.json");

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

        if (packageJson.name === "codemakk" && packageJson.workspaces) {
          return current;
        }
      } catch {
        // Keep walking upward.
      }
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return startDir;
    }

    current = parent;
  }
}

export const repoRoot = findRepoRoot();
export const workingDir = process.cwd();
export const envPath = path.join(repoRoot, ".env");

dotenv.config({
  path: envPath
});

export function resolveFromRepoRoot(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(repoRoot, value);
}

export function getConfigValue(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const routerBaseUrl =
  getConfigValue("CODEMAKK_ROUTER_BASE_URL", "http://localhost:8787/v1");

export const apiKey =
  getConfigValue("CODEMAKK_API_KEY", "dummy");

export const defaultModel =
  getConfigValue("CODEMAKK_DEFAULT_MODEL", "auto-cline");

export const defaultProfile =
  getConfigValue("CODEMAKK_DEFAULT_PROFILE", "balanced");

export const defaultSpeed =
  Number(getConfigValue("CODEMAKK_DEFAULT_SPEED", "5"));

export const defaultLocalPreference =
  getConfigValue("CODEMAKK_DEFAULT_LOCAL_PREFERENCE", "false") === "true";
