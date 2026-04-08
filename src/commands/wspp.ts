import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser } from "../utils/browser";
import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const side = document.querySelector('#side');
    if (!side) return false;
    // WhatsApp usa <input>, <p>, spans con title, o divs con data-testid
    const hasSearchInput = !!side.querySelector('input, [role="textbox"], [contenteditable="true"]');
    const hasChats = !!side.querySelector('[role="listitem"], [data-testid^="cell-frame"], span[title]');
    return hasSearchInput || hasChats;
  });
}

async function waitForLogin(page: Page, spinner: ReturnType<typeof ora>): Promise<void> {
  spinner.warn(chalk.yellow("📸 Escanea el QR con tu teléfono"));
  console.log(chalk.gray("  Completa TODOS los pasos de vinculación"));
  console.log(chalk.gray("  La sesión se guardará para futuros usos\n"));

  for (let i = 0; i < 120; i++) {
    await delay(1000);
    if (await isLoggedIn(page)) {
      spinner.succeed(chalk.green("✓ Login completado"));
      return;
    }
    if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
  }

  throw new Error("Timeout. Completa todo el proceso de vinculación en tu teléfono.");
}

async function wsppCli() {
  const contactName = process.argv[2];
  const message = process.argv.slice(3).join(" ");

  if (!contactName || !message) {
    console.log(chalk.red("\n❌ Faltan parámetros"));
    console.log(chalk.yellow('\n📝 Uso: bun run wspp "Contacto" "Mensaje"\n'));
    process.exit(1);
  }

  console.log(chalk.bold.green("\n🚀 WSPP-CLI"));
  console.log(chalk.bold.cyan("═══════════════════════════════════════\n"));
  console.log(chalk.cyan("  📱 Para:"), contactName);
  console.log(chalk.cyan("  💬 Mensaje:"), message);
  console.log();

  const spinner = ora("Iniciando...").start();

  // Usar sesión persistente para no pedir QR cada vez
  const browser = await launchBrowser(true);

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await delay(5000);

    if (await isLoggedIn(page)) {
      spinner.succeed(chalk.green("✓ Sesión activa (guardada)"));
    } else {
      await waitForLogin(page, spinner);
    }

    await delay(3000);

    // ===== PASO 1: Buscar contacto =====
    spinner.start(`Buscando "${contactName}"...`);

    const searchClicked = await page.evaluate(() => {
      const side = document.querySelector('#side');
      if (!side) return null;
      // Probar todos los posibles tipos de campo de búsqueda
      const tb = side.querySelector('input')
        || side.querySelector('[role="textbox"]')
        || side.querySelector('[contenteditable="true"]');
      if (tb) { (tb as HTMLElement).click(); (tb as HTMLElement).focus(); return "ok"; }
      return null;
    });

    if (!searchClicked) throw new Error("No se encontró la barra de búsqueda");

    await delay(800);
    await page.keyboard.type(contactName, { delay: 120 });
    await delay(3000);

    // ===== PASO 2: Seleccionar contacto =====
    spinner.text = "Seleccionando contacto...";

    const contactClicked = await page.evaluate((name: string) => {
      const spans = document.querySelectorAll('span[title]');
      for (const span of spans) {
        const title = span.getAttribute('title') || '';
        if (title.toLowerCase().includes(name.toLowerCase())) {
          const target = span.closest('[role="listitem"]') || span.closest('[data-testid^="cell-frame"]') || span;
          (target as HTMLElement).click();
          return title;
        }
      }
      const first = document.querySelector('[role="listitem"]');
      if (first) { (first as HTMLElement).click(); return "first"; }
      return null;
    }, contactName);

    if (!contactClicked) await page.keyboard.press("Enter");

    await delay(3000);

    // ===== PASO 3: Escribir mensaje =====
    spinner.text = "Escribiendo mensaje...";

    const msgBoxClicked = await page.evaluate(() => {
      // Buscar campo de mensaje en footer
      const footer = document.querySelector('footer');
      if (footer) {
        const tb = footer.querySelector('input, textarea, [role="textbox"], [contenteditable="true"]');
        if (tb) { (tb as HTMLElement).click(); (tb as HTMLElement).focus(); return "footer"; }
      }
      // Buscar en main
      const main = document.querySelector('main');
      if (main) {
        const tb = main.querySelector('input, textarea, [role="textbox"], [contenteditable="true"]');
        if (tb) { (tb as HTMLElement).click(); (tb as HTMLElement).focus(); return "main"; }
      }
      // Fallback: último campo editable
      const all = document.querySelectorAll('input, textarea, [role="textbox"], [contenteditable="true"]');
      if (all.length >= 2) {
        (all[all.length - 1] as HTMLElement).click();
        (all[all.length - 1] as HTMLElement).focus();
        return "last";
      }
      return null;
    });

    if (!msgBoxClicked) throw new Error("No se encontró el cuadro de mensaje");

    await delay(500);
    await page.keyboard.type(message, { delay: 60 });
    await delay(1000);

    // ===== PASO 4: Enviar =====
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
    await delay(3000);
  } finally {
    await closeBrowser(browser);
  }
}

wsppCli();
