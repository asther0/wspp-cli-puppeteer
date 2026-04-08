import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { extractContacts } from "../utils/contacts";
import { sendMessage } from "../utils/sender";
import { showBanner, showSuccess } from "../ui/banner";
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
      spinner.succeed(chalk.green("✓ Login completado"));
      return;
    }
    if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
  }

  throw new Error("Timeout esperando login.");
}

async function wsppCli() {
  const firstArg = process.argv[2];
  const message = process.argv.slice(3).join(" ");
  const isPositional = firstArg && /^\d+$/.test(firstArg);

  if (!firstArg || !message) {
    showBanner();
    console.log(chalk.red("  ❌ Faltan parámetros\n"));
    console.log(chalk.yellow("  📝 Uso:"));
    console.log(chalk.gray('     bun run wspp "Contacto" "Mensaje"  → por nombre'));
    console.log(chalk.gray('     bun run wspp 3 "Mensaje"           → por posición (#)'));
    console.log(chalk.gray('     bun run wspp 1,3,5 "Mensaje"       → envío masivo'));
    console.log(chalk.gray('     bun run wspp:contacts              → ver contactos'));
    console.log(chalk.gray('     bun run wspp:i                     → modo interactivo\n'));
    process.exit(1);
  }

  showBanner();

  if (isPositional) {
    console.log(chalk.cyan("  📱 Para:"), `contacto #${firstArg}`);
  } else {
    console.log(chalk.cyan("  📱 Para:"), firstArg);
  }
  console.log(chalk.cyan("  💬 Mensaje:"), message);
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
      spinner.succeed(chalk.green("✓ Sesión activa"));
    } else {
      await waitForLogin(page, spinner);
    }

    await delay(3000);

    // Resolve contact name
    let contactName: string;

    if (isPositional) {
      const pos = parseInt(firstArg, 10);
      spinner.start("Obteniendo lista de contactos...");
      const contacts = await extractContacts(page);

      if (pos < 1 || pos > contacts.length) {
        throw new Error(`Posición #${pos} inválida. Solo hay ${contacts.length} contactos. Usa: bun run wspp:contacts`);
      }

      contactName = contacts[pos - 1].name;
      spinner.succeed(chalk.green(`✓ Contacto #${pos}: ${contactName}`));
    } else {
      contactName = firstArg;
    }

    // Send message using shared sender
    spinner.start(`Enviando a "${contactName}"...`);
    await sendMessage(page, contactName, message);

    await page.screenshot({ path: "wspp-sent.png" });
    spinner.succeed(chalk.bold.green("✓ MENSAJE ENVIADO"));

    showSuccess("MENSAJE ENVIADO", {
      "📤 Para": contactName,
      "💬 Mensaje": `"${message}"`,
      "🕐 Hora": new Date().toLocaleTimeString("es-ES"),
    });

    await delay(3000);

  } catch (error: any) {
    spinner.fail(chalk.red("✖ Error"));
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
