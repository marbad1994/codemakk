import chalk from "chalk";

export function printMainShow(): void {
  console.log("");
  console.log(chalk.bold.cyan("Codemakk commands"));
  console.log("");
  console.log(chalk.gray("Workflow:"));
  console.log(`  ${chalk.cyan("/plan new")}                 Start a new project plan`);
  console.log(`  ${chalk.cyan("/plan <id>")}                Revise an existing plan`);
  console.log(`  ${chalk.cyan("/design <id>")}              Design UX and browser mockups`);
  console.log(`  ${chalk.cyan("/open <id> [mockup]")}       Open a saved mockup`);
  console.log(`  ${chalk.cyan("/build <id> [slice]")}       Generate file proposals`);
  console.log(`  ${chalk.cyan("/projects")}                 List projects`);
  console.log(`  ${chalk.cyan("/project <id>")}             Show project details`);
  console.log("");
  console.log(chalk.gray("Editing:"));
  console.log(`  ${chalk.cyan("/review")}                   Review proposed files`);
  console.log(`  ${chalk.cyan("/apply")}                    Write accepted proposals`);
  console.log(`  ${chalk.cyan("/comment <n> <text>")}       Add revision comment`);
  console.log(`  ${chalk.cyan("/revise")}                   Send commented files back`);
  console.log(`  ${chalk.cyan("/create")}                   File-create mode for next prompt`);
  console.log("");
}

export function printPlanningShow(projectId: string): void {
  console.log("");
  console.log(chalk.bold.cyan(`Planning project ${projectId}`));
  console.log(`  ${chalk.cyan("/done")}     Finalize and save plan`);
  console.log(`  ${chalk.cyan("/cancel")}   Leave planning mode`);
  console.log(`  ${chalk.cyan("/show")}     Show this reminder`);
  console.log("");
  console.log(chalk.gray(`After /done, next: /design ${projectId}`));
  console.log("");
}

export function printDesignShow(projectId: string): void {
  console.log("");
  console.log(chalk.bold.cyan(`Design project ${projectId}`));
  console.log(`  ${chalk.cyan("/approve")}       Finalize design and save mockups`);
  console.log(`  ${chalk.cyan(`/open ${projectId}`)}     Open first saved mockup`);
  console.log(`  ${chalk.cyan("/open [n]")}      Open mockup number while in design mode`);
  console.log(`  ${chalk.cyan("/cancel")}        Leave design mode`);
  console.log(`  ${chalk.cyan("/show")}          Show this reminder`);
  console.log("");
  console.log(chalk.gray("Mockups are saved automatically. Do not tell the AI where to save them."));
  console.log(chalk.gray(`After /approve, next: /open ${projectId} then /build ${projectId} scaffold`));
  console.log("");
}

export function commandStripForPrompt(prompt: string): string {
  if (prompt.startsWith("plan[")) {
    return "[/done save plan · /cancel exit · /show commands]";
  }

  if (prompt.startsWith("design[")) {
    return "[/approve save design · /open mockup · /cancel exit · /show commands]";
  }

  return "[/show commands · /plan new · /design <id> · /build <id> · /review]";
}
