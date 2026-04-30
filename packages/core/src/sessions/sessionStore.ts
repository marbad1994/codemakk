import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { CodemakkSession } from "./types.js";

export class SessionStore {
  constructor(
    private readonly rootDir = path.join(process.cwd(), ".codemakk", "sessions")
  ) {}

  async create(name: string, repoRoot = process.cwd()): Promise<CodemakkSession> {
    const now = Date.now();

    const session: CodemakkSession = {
      id: `session_${crypto.randomUUID()}`,
      name,
      repoRoot,
      createdAt: now,
      updatedAt: now,
      model: process.env.CODEMAKK_DEFAULT_MODEL ?? "auto-cline-deep",
      profile: process.env.CODEMAKK_DEFAULT_PROFILE ?? "balanced",
      speed: Number(process.env.CODEMAKK_DEFAULT_SPEED ?? 5),
      localPreference: process.env.CODEMAKK_DEFAULT_LOCAL_PREFERENCE === "true",
      files: [],
      summary: ""
    };

    await this.save(session);
    return session;
  }

  async save(session: CodemakkSession): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });

    const updated = {
      ...session,
      updatedAt: Date.now()
    };

    await fs.writeFile(
      path.join(this.rootDir, `${session.id}.json`),
      JSON.stringify(updated, null, 2),
      "utf8"
    );
  }

  async list(): Promise<CodemakkSession[]> {
    try {
      const entries = await fs.readdir(this.rootDir);

      const sessions = await Promise.all(
        entries
          .filter((entry) => entry.endsWith(".json"))
          .map(async (entry) => {
            const raw = await fs.readFile(path.join(this.rootDir, entry), "utf8");
            return JSON.parse(raw) as CodemakkSession;
          })
      );

      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }
}
