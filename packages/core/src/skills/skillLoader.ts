import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { Skill, SkillFrontmatter } from "./types.js";

const DEFAULT_SKILL_DIRS = [
  "skills",
  ".skills",
  ".claude/skills",
  ".agents/skills"
];

function parseSkillMarkdown(raw: string): {
  frontmatter: SkillFrontmatter;
  instructions: string;
} {
  if (!raw.startsWith("---")) {
    throw new Error("SKILL.md must start with YAML frontmatter");
  }

  const end = raw.indexOf("\n---", 3);

  if (end === -1) {
    throw new Error("SKILL.md missing closing YAML frontmatter marker");
  }

  const yamlText = raw.slice(3, end).trim();
  const instructions = raw.slice(end + 4).trim();

  const frontmatter = YAML.parse(yamlText) as SkillFrontmatter;

  if (!frontmatter.name || !frontmatter.description) {
    throw new Error("SKILL.md frontmatter must include name and description");
  }

  return {
    frontmatter,
    instructions
  };
}

export async function loadSkills(root = process.cwd()): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const relativeDir of DEFAULT_SKILL_DIRS) {
    const baseDir = path.join(root, relativeDir);

    let entries: string[];

    try {
      entries = await fs.readdir(baseDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const skillDir = path.join(baseDir, entry);
      const skillPath = path.join(skillDir, "SKILL.md");

      try {
        const raw = await fs.readFile(skillPath, "utf8");
        const parsed = parseSkillMarkdown(raw);

        skills.push({
          name: parsed.frontmatter.name,
          description: parsed.frontmatter.description,
          dir: skillDir,
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
