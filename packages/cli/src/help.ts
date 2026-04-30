import chalk from "chalk";
import { commands } from "./commands.js";

export function printHelp(): void {
  console.log("");

  let lastGroup = "";

  for (const command of commands) {
    if (command.group !== lastGroup) {
      console.log(chalk.gray(command.group));
      lastGroup = command.group;
    }

    console.log(
      `  ${chalk.cyan(command.usage.padEnd(36))} ${chalk.gray(command.description)}`
    );
  }

  console.log("");
  console.log(chalk.gray("File picker:"));
  console.log(`  ${chalk.yellow("@")} starts file autocomplete. Use ↑/↓ and Tab.`);
  console.log("");
}
