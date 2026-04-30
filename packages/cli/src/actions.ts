import chalk from "chalk";
import type { AppState } from "./types.js";
import { loadSkills } from "./skills.js";
import { selectMenu } from "./menus.js";
import { setConfigValue } from "./configManager.js";
import { repoRoot } from "./config.js";

export async function openSkillsMenu(state: AppState): Promise<void> {
  const skills = await loadSkills(repoRoot);

  const selected = await selectMenu({
    title: "Select skill",
    items: skills,
    renderItem: (skill, isSelected) => {
      const marker = isSelected
        ? chalk.black.bgGreen(" › ")
        : chalk.gray("   ");

      const name = isSelected
        ? chalk.greenBright.bold(skill.name.padEnd(24))
        : chalk.green(skill.name.padEnd(24));

      const description = isSelected
        ? chalk.whiteBright(skill.description)
        : chalk.gray(skill.description);

      return `${marker} ${name} ${description}`;
    }
  });

  if (!selected) {
    console.log(chalk.gray("No skill selected."));
    return;
  }

  state.skill = selected;
  console.log(`${chalk.gray("Skill:")} ${chalk.green(selected.name)}`);
}

export async function openModeMenu(state: AppState): Promise<void> {
  const modes = [
    {
      value: "balanced",
      label: "Balanced",
      description: "Good default mix of quality, speed, and cost"
    },
    {
      value: "deep",
      label: "Deep",
      description: "Prefer stronger models for harder coding tasks"
    },
    {
      value: "free-first",
      label: "Free first",
      description: "Prefer local/free models before paid models"
    },
    {
      value: "fast",
      label: "Fast",
      description: "Prefer lower latency"
    }
  ];

  const selected = await selectMenu({
    title: "Select routing mode",
    items: modes,
    renderItem: (mode, isSelected) => {
      const marker = isSelected
        ? chalk.black.bgCyan(" › ")
        : chalk.gray("   ");

      const label = isSelected
        ? chalk.cyanBright.bold(mode.label.padEnd(14))
        : chalk.cyan(mode.label.padEnd(14));

      const description = isSelected
        ? chalk.whiteBright(mode.description)
        : chalk.gray(mode.description);

      return `${marker} ${label} ${description}`;
    }
  });

  if (!selected) {
    console.log(chalk.gray("Mode unchanged."));
    return;
  }

  state.profile = selected.value;
  await setConfigValue("CODEMAKK_DEFAULT_PROFILE", selected.value);

  console.log(
    `${chalk.gray("Mode:")} ${chalk.cyan(state.profile)} ${chalk.gray("(saved)")}`
  );
}

export async function openSpeedMenu(state: AppState): Promise<void> {
  const speeds = Array.from({ length: 10 }, (_value, index) => index + 1);

  const selected = await selectMenu({
    title: "Select router speed",
    items: speeds,
    renderItem: (speed, isSelected) => {
      const marker = isSelected
        ? chalk.black.bgYellow(" › ")
        : chalk.gray("   ");

      const label = `speed ${speed}`.padEnd(12);
      const description =
        speed <= 3
          ? "slower / quality-biased"
          : speed <= 7
            ? "balanced"
            : "faster / latency-biased";

      const renderedLabel = isSelected
        ? chalk.yellowBright.bold(label)
        : chalk.yellow(label);

      const renderedDescription = isSelected
        ? chalk.whiteBright(description)
        : chalk.gray(description);

      return `${marker} ${renderedLabel} ${renderedDescription}`;
    }
  });

  if (!selected) {
    console.log(chalk.gray("Speed unchanged."));
    return;
  }

  state.speed = selected;
  await setConfigValue("CODEMAKK_DEFAULT_SPEED", String(selected));

  console.log(
    `${chalk.gray("Speed:")} ${chalk.yellow(String(state.speed))} ${chalk.gray("(saved)")}`
  );
}