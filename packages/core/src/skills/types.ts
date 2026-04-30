export type SkillFrontmatter = {
  name: string;
  description: string;
  "x-router"?: {
    profile?: string;
    outputMode?: "full-file" | "diff" | "answer";
    allowScripts?: boolean;
    maxFiles?: number;
  };
};

export type Skill = {
  name: string;
  description: string;
  dir: string;
  instructions: string;
  frontmatter: SkillFrontmatter;
};
