import fs from "node:fs/promises";
import path from "node:path";
import type { Skill } from "./types.js";

function parseSkillMarkdown(raw: string): {
  frontmatter: Record<string, unknown>;
  instructions: string;
} {
  if (!raw.startsWith("---")) return { frontmatter: {}, instructions: raw.trim() };

  const end = raw.indexOf("\n---", 3);

  if (end === -1) return { frontmatter: {}, instructions: raw.trim() };

  const yamlText = raw.slice(3, end).trim();
  const instructions = raw.slice(end + 4).trim();
  const frontmatter: Record<string, unknown> = {};

  for (const line of yamlText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);

    if (match) {
      frontmatter[match[1]!] = match[2]!.replace(/^["']|["']$/g, "");
    }
  }

  return { frontmatter, instructions };
}

export async function loadSkills(root = process.cwd()): Promise<Skill[]> {
  const dirs = [
    path.join(root, "skills"),
    path.join(root, ".skills"),
    path.join(root, ".claude", "skills"),
    path.join(root, ".agents", "skills")
  ];

  const skills: Skill[] = [];

  for (const dir of dirs) {
    let entries: string[];

    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const skillFile = path.join(dir, entry, "SKILL.md");

      try {
        const raw = await fs.readFile(skillFile, "utf8");
        const parsed = parseSkillMarkdown(raw);
        const name =
          typeof parsed.frontmatter.name === "string" ? parsed.frontmatter.name : entry;
        const description =
          typeof parsed.frontmatter.description === "string"
            ? parsed.frontmatter.description
            : "No description";

        skills.push({
          name,
          description,
          filePath: skillFile,
          instructions: parsed.instructions,
          frontmatter: parsed.frontmatter
        });
      } catch {
        continue;
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
