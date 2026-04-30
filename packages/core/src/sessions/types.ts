export type CodemakkSession = {
  id: string;
  name: string;
  repoRoot: string;
  createdAt: number;
  updatedAt: number;

  model: string;
  profile: string;
  speed: number;
  localPreference: boolean;

  activeSkill?: string;
  files: string[];

  summary: string;
};
