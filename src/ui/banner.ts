import chalk from "chalk";

export function showBanner() {
  console.log();
  console.log(chalk.gray("  ┌─────────────────────────────────┐"));
  console.log(chalk.gray("  │") + chalk.white.bold("  wspp-cli ") + chalk.dim("· WhatsApp from CLI") + chalk.gray("  │"));
  console.log(chalk.gray("  └─────────────────────────────────┘"));
  console.log();
}

export function showSuccess(title: string, details: Record<string, string>) {
  console.log(chalk.green(`\n  ✓ ${title}\n`));
  for (const [key, value] of Object.entries(details)) {
    console.log(chalk.dim(`  ${key}:`), value);
  }
  console.log();
}

export function showError(message: string) {
  console.log(chalk.red(`\n  ✖ ${message}\n`));
}
