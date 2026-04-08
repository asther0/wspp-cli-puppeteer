import chalk from "chalk";
import figlet from "figlet";

export function showBanner() {
  const banner = figlet.textSync("WSPP-CLI", {
    font: "ANSI Shadow",
    horizontalLayout: "default",
  });
  console.log(chalk.bold.green(banner));
  console.log(chalk.cyan("  " + "═".repeat(50)));
  console.log(chalk.gray("  WhatsApp Web Automation CLI · Puppeteer + Bun"));
  console.log(chalk.cyan("  " + "═".repeat(50)) + "\n");
}

export function showSuccess(title: string, details: Record<string, string>) {
  console.log(chalk.bold.green(`\n✅ ${title}\n`));
  for (const [key, value] of Object.entries(details)) {
    console.log(chalk.cyan(`  ${key}:`), value);
  }
  console.log();
}

export function showError(message: string) {
  console.log(chalk.bold.red(`\n❌ ${message}\n`));
}
