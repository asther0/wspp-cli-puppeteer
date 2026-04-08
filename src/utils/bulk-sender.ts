import chalk from "chalk";
import ora from "ora";
import type { Page } from "puppeteer-core";
import type { Contact } from "./contacts";
import type { CsvRow } from "./csv-parser";
import { sendMessage, sendMessageByPhone } from "./sender";
import { renderTemplate } from "./template-engine";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const WARN_LIMIT = 50;

/** Returns a random delay between min and max ms (default: 3s-7s) */
function humanDelay(min = 3000, max = 7000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
  if (targets.length >= WARN_LIMIT) {
    console.log(chalk.yellow(`  ⚠ ${targets.length} mensajes — enviar más de ${WARN_LIMIT} por sesión aumenta el riesgo de ban`));
  }

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
        const wait = humanDelay();
        await delay(wait);
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`  ✖ Error con ${label}: ${err.message}`));
      result.failed.push(label);
    }
  }

  return result;
}

export async function sendCsvMessages(
  page: Page,
  rows: CsvRow[],
  defaultMessage: string,
): Promise<BulkResult> {
  if (rows.length >= WARN_LIMIT) {
    console.log(chalk.yellow(`  ⚠ ${rows.length} mensajes — enviar más de ${WARN_LIMIT} por sesión aumenta el riesgo de ban`));
  }

  const result: BulkResult = { success: 0, failed: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = row.name || row.phone || `Fila ${i + 2}`;

    // Render message: row-level message overrides default, then apply template vars
    const rawMessage = row.message || defaultMessage;
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v) vars[k] = v;
    }
    const message = renderTemplate(rawMessage, vars);

    if (!message.trim()) {
      console.log(chalk.yellow(`  ⚠ ${label}: sin mensaje, saltando`));
      result.failed.push(label);
      continue;
    }

    const spinner = ora(`  [${i + 1}/${rows.length}] Enviando a ${label}...`).start();

    try {
      if (row.phone) {
        await sendMessageByPhone(page, row.phone, message);
      } else if (row.name) {
        await sendMessage(page, row.name, message);
      }
      spinner.succeed(chalk.green(`  ✓ Enviado a ${label}`));
      result.success++;

      if (i < rows.length - 1) {
        const wait = humanDelay();
        await delay(wait);
      }
    } catch (err: any) {
      spinner.fail(chalk.red(`  ✖ Error con ${label}: ${err.message}`));
      result.failed.push(label);
    }
  }

  return result;
}
