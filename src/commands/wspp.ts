import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { extractContacts } from "../utils/contacts";
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
    console.log(chalk.red("\n❌ Faltan parámetros"));
    console.log(chalk.yellow('\n📝 Uso:'));
    console.log(chalk.gray('   bun run wspp "Contacto" "Mensaje"  → por nombre'));
    console.log(chalk.gray('   bun run wspp 3 "Mensaje"           → por posición (#)\n'));
    console.log(chalk.gray('   bun run wspp:contacts              → ver lista de contactos\n'));
    process.exit(1);
  }

  console.log(chalk.bold.green("\n🚀 WSPP-CLI"));
  console.log(chalk.bold.cyan("═══════════════════════════════════════\n"));

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

      contactName = contacts[pos - 1];
      spinner.succeed(chalk.green(`✓ Contacto #${pos}: ${contactName}`));
    } else {
      contactName = firstArg;
    }

    // ===== PASO 1: Click en búsqueda y escribir contacto =====
    spinner.start(`Buscando "${contactName}"...`);

    const searchInput = await page.$('#side input');
    if (!searchInput) throw new Error("No se encontró la barra de búsqueda");

    await searchInput.click();
    await delay(500);

    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await delay(300);

    await page.keyboard.type(contactName, { delay: 100 });
    await delay(3000);

    // ===== PASO 2: Seleccionar contacto =====
    spinner.text = "Seleccionando contacto...";

    let chatOpened = false;

    const listItems = await page.$$('[role="listitem"]');
    if (listItems.length > 0) {
      await listItems[0].click();
      chatOpened = true;
    }

    if (!chatOpened) {
      const cellFrames = await page.$$('[data-testid^="cell-frame"]');
      if (cellFrames.length > 0) {
        await cellFrames[0].click();
        chatOpened = true;
      }
    }

    if (!chatOpened) {
      const spans = await page.$$('span[title]');
      for (const span of spans) {
        const title = await span.evaluate((el: Element) => el.getAttribute('title'));
        if (title && title.toLowerCase().includes(contactName.toLowerCase())) {
          await span.click();
          chatOpened = true;
          break;
        }
      }
    }

    if (!chatOpened) {
      await page.keyboard.press("ArrowDown");
      await delay(300);
      await page.keyboard.press("Enter");
    }

    await delay(3000);

    // ===== PASO 3: Verificar chat abierto =====
    spinner.text = "Verificando chat abierto...";

    const footer = await page.$('footer');
    const main = await page.$('main');

    if (!footer && !main) {
      throw new Error(`No se abrió el chat de "${contactName}". Verifica que el nombre sea exacto.`);
    }

    // ===== PASO 4: Escribir mensaje =====
    spinner.text = "Escribiendo mensaje...";

    let messageBox = null;

    if (footer) {
      messageBox = await footer.$('input, textarea, [role="textbox"], [contenteditable="true"]');
    }

    if (!messageBox && main) {
      messageBox = await main.$('input, textarea, [role="textbox"], [contenteditable="true"]');
    }

    if (!messageBox) {
      throw new Error("No se encontró el cuadro de mensaje. El chat puede no haberse abierto correctamente.");
    }

    await messageBox.click();
    await delay(500);
    await page.keyboard.type(message, { delay: 50 });
    await delay(1000);

    // ===== PASO 5: Enviar =====
    spinner.text = "Enviando...";
    await page.keyboard.press("Enter");
    await delay(3000);

    await page.screenshot({ path: "wspp-sent.png" });

    spinner.succeed(chalk.bold.green("✓ MENSAJE ENVIADO"));

    console.log(chalk.green("\n✅ ÉXITO\n"));
    console.log(chalk.cyan("  📤 Para:"), contactName);
    console.log(chalk.cyan("  💬 Mensaje:"), `"${message}"`);
    console.log(chalk.cyan("  🕐 Hora:"), new Date().toLocaleTimeString("es-ES"));
    console.log(chalk.gray("\n  Cerrando en 5s...\n"));

    await delay(5000);

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
