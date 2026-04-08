import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { extractContacts } from "../utils/contacts";
import { sendMessage, sendMessageByPhone } from "../utils/sender";
import { sendBulkMessages } from "../utils/bulk-sender";
import { showBanner } from "../ui/banner";
import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const side = document.querySelector('#side');
    if (!side) return false;
    return !!(side.querySelector('input, [role="textbox"], [contenteditable="true"], [role="listitem"], span[title]'));
  });
}

async function waitForLogin(page: Page, spinner: ReturnType<typeof ora>): Promise<void> {
  spinner.warn(chalk.yellow("📸 Escanea el QR con tu teléfono"));
  console.log(chalk.gray("  Completa TODOS los pasos de vinculación\n"));

  for (let i = 0; i < 120; i++) {
    await delay(1000);
    if (await isLoggedIn(page)) {
      spinner.succeed(chalk.green("Login completado"));
      return;
    }
    if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
  }

  throw new Error("Timeout esperando login.");
}

function parseArgs() {
  const args = process.argv.slice(2);

  // Extract --at flag
  let scheduleTime: string | null = null;
  const atIdx = args.indexOf("--at");
  if (atIdx !== -1 && args[atIdx + 1]) {
    scheduleTime = args[atIdx + 1];
    args.splice(atIdx, 2);
  }

  const firstArg = args[0] || "";
  const message = args.slice(1).join(" ");

  // Detect bulk: "José,María" (commas) or "2 3 4 5" (PowerShell expands commas for digits)
  const allDigitsWithSpaces = /^\d+(\s+\d+)+$/.test(firstArg.trim());
  const isBulk = firstArg.includes(",") || allDigitsWithSpaces;
  const targets = isBulk
    ? (allDigitsWithSpaces && !firstArg.includes(",")
        ? firstArg.split(/\s+/)
        : firstArg.split(",")
      ).map(t => t.trim()).filter(Boolean)
    : [];
  // Phone: starts with + and has 7+ digits
  const isPhone = !isBulk && /^\+\d{7,}$/.test(firstArg.replace(/[\s\-()]/g, ''));
  const isPositional = !isBulk && !isPhone && /^\d+$/.test(firstArg);

  return { firstArg, message, isBulk, targets, isPositional, isPhone, scheduleTime };
}

async function wsppCli() {
  const { firstArg, message, isBulk, targets, isPositional, isPhone, scheduleTime } = parseArgs();

  if (!firstArg || !message) {
    showBanner();
    console.log(chalk.red("  ❌ Faltan parámetros\n"));
    console.log(chalk.yellow("  📝 Uso:"));
    console.log(chalk.gray('     bun run wspp "Contacto" "Mensaje"      → por nombre'));
    console.log(chalk.gray('     bun run wspp 3 "Mensaje"               → por posición (#)'));
    console.log(chalk.gray('     bun run wspp +51987654321 "Mensaje"    → por teléfono'));
    console.log(chalk.gray('     bun run wspp "1,3,5" "Mensaje"         → masivo por #'));
    console.log(chalk.gray('     bun run wspp "Juan,María" "Mensaje"    → masivo por nombre'));
    console.log(chalk.gray('     bun run wspp "+51...,+56..." "Mensaje" → masivo por tel'));
    console.log(chalk.gray('     bun run wspp 3 "Msg" --at 08:00       → programado'));
    console.log(chalk.gray('     bun run wspp:contacts                  → ver contactos'));
    console.log(chalk.gray('     bun run wspp:i                         → modo interactivo\n'));
    process.exit(1);
  }

  showBanner();

  if (isBulk) {
    console.log(chalk.cyan("  📨 Envío masivo:"), `${targets.length} destinatarios`);
  } else if (isPhone) {
    console.log(chalk.cyan("  📞 Para:"), firstArg);
  } else if (isPositional) {
    console.log(chalk.cyan("  📱 Para:"), `contacto #${firstArg}`);
  } else {
    console.log(chalk.cyan("  📱 Para:"), firstArg);
  }
  console.log(chalk.cyan("  💬 Mensaje:"), message);
  if (scheduleTime) {
    console.log(chalk.cyan("  ⏰ Programado:"), scheduleTime);
  }
  console.log();

  const sessionExists = hasSession();
  const mode = sessionExists ? "headless (background)" : "visible (QR)";
  const spinner = ora(`Iniciando [${mode}]...`).start();
  const browser = await launchBrowser(true);

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await delay(5000);

    if (await isLoggedIn(page)) {
      spinner.succeed(chalk.green("Sesión activa"));
    } else {
      await waitForLogin(page, spinner);
    }

    await delay(3000);

    // Handle scheduled messages
    if (scheduleTime) {
      const { waitUntil, parseScheduleTime } = await import("../utils/scheduler");
      const targetTime = parseScheduleTime(scheduleTime);
      console.log(chalk.cyan("  ⏰ Enviará a las:"), targetTime.toLocaleString("es-ES"));
      console.log();
      await waitUntil(targetTime);
    }

    // Bulk mode
    if (isBulk) {
      // Only load contacts if any target is a position number
      const hasPositions = targets.some(t => /^\d+$/.test(t));
      let contacts: Awaited<ReturnType<typeof extractContacts>> = [];
      if (hasPositions) {
        spinner.start("Obteniendo contactos...");
        contacts = await extractContacts(page);
        spinner.succeed(chalk.green(`${contacts.length} contactos cargados`));
      }

      console.log();
      const result = await sendBulkMessages(page, targets, message, contacts);

      console.log(chalk.cyan("\n  ─── Resumen ───"));
      console.log(chalk.green(`  ✓ Enviados: ${result.success}`));
      if (result.failed.length > 0) {
        console.log(chalk.red(`  ✖ Fallidos: ${result.failed.length} (${result.failed.join(", ")})`));
      }
      console.log();

    } else {
      // Single mode
      let contactName: string;

      if (isPhone) {
        contactName = firstArg;
        spinner.start(`Enviando a ${firstArg}...`);
        await sendMessageByPhone(page, firstArg, message);
      } else if (isPositional) {
        const pos = parseInt(firstArg, 10);
        spinner.start("Obteniendo lista de contactos...");
        const contacts = await extractContacts(page);

        if (pos < 1 || pos > contacts.length) {
          throw new Error(`Posición #${pos} inválida. Solo hay ${contacts.length} contactos. Usa: bun run wspp:contacts`);
        }

        contactName = contacts[pos - 1].name;
        spinner.succeed(chalk.green(`Contacto #${pos}: ${contactName}`));

        spinner.start(`Enviando a "${contactName}"...`);
        await sendMessage(page, contactName, message);
      } else {
        contactName = firstArg;

        spinner.start(`Enviando a "${contactName}"...`);
        await sendMessage(page, contactName, message);
      }

      await page.screenshot({ path: "wspp-sent.png" });
      spinner.succeed(chalk.bold.green("MENSAJE ENVIADO"));
      console.log(chalk.dim(`  📤 ${contactName} · 🕐 ${new Date().toLocaleTimeString("es-ES")}`));
    }

    await delay(3000);

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(chalk.yellow("\n⚠️"), error.message);

    try {
      const pages = await browser.pages();
      await pages[0].screenshot({ path: "wspp-error.png" });
      console.log(chalk.gray("  Screenshot de error: wspp-error.png\n"));
    } catch {}

    await delay(3000);
  } finally {
    await closeBrowser(browser);
  }
}

wsppCli();
