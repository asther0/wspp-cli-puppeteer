import chalk from "chalk";
import ora from "ora";
import type { Page } from "puppeteer-core";
import type { Contact } from "./contacts";
import { sendMessage, sendMessageByPhone } from "./sender";

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

    // Detect target type: position (#), phone (+), or name
    const isPosition = /^\d+$/.test(target);
    const isPhone = /^\+\d{7,}$/.test(target.replace(/[\s\-()]/g, ''));

    let label = target;
    if (isPosition) {
      const pos = parseInt(target, 10);
      if (pos < 1 || pos > contacts.length) {
        console.log(chalk.red(`  ✖ Posición #${pos} inválida (max ${contacts.length})`));
        result.failed.push(`#${pos}`);
        continue;
      }
      label = contacts[pos - 1].name;
    }

    const spinner = ora(`  [${i + 1}/${targets.length}] Enviando a ${label}...`).start();

    try {
      if (isPhone) {
        await sendMessageByPhone(page, target, message);
      } else if (isPosition) {
        await sendMessage(page, label, message);
      } else {
        await sendMessage(page, target, message);
      }
      spinner.succeed(chalk.green(`  ✓ Enviado a ${label}`));
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
