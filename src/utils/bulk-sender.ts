import chalk from "chalk";
import ora from "ora";
import type { Page } from "puppeteer-core";
import type { Contact } from "./contacts";
import { sendMessage } from "./sender";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface BulkResult {
  success: number;
  failed: string[];
}

export async function sendBulkMessages(
  page: Page,
  targets: string[],
  message: string,
  contacts: Contact[],
): Promise<BulkResult> {
  const result: BulkResult = { success: 0, failed: [] };

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    // Resolve position to name
    let contactName = target;
    if (/^\d+$/.test(target)) {
      const pos = parseInt(target, 10);
      if (pos < 1 || pos > contacts.length) {
        console.log(chalk.red(`  ✖ Posición #${pos} inválida (max ${contacts.length})`));
        result.failed.push(`#${pos}`);
        continue;
      }
      contactName = contacts[pos - 1].name;
    }

    const spinner = ora(`  [${i + 1}/${targets.length}] Enviando a ${contactName}...`).start();

    try {
      await sendMessage(page, contactName, message);
      spinner.succeed(chalk.green(`  ✓ Enviado a ${contactName}`));
      result.success++;

      if (i < targets.length - 1) {
        await delay(3000);
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`  ✖ Error con ${contactName}: ${err.message}`));
      result.failed.push(contactName);
    }
  }

  return result;
}
