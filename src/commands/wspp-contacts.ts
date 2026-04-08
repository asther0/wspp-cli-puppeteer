import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const side = document.querySelector('#side');
    if (!side) return false;
    return !!(side.querySelector('input, [role="textbox"], [contenteditable="true"], span[title]'));
  });
}

async function wsppContacts() {
  const keyword = process.argv[2] || "";

  console.log(chalk.bold.green("\n🔍 WSPP-CLI - BUSCAR CONTACTOS\n"));

  if (keyword) {
    console.log(chalk.cyan("  Buscando:"), `"${keyword}"`);
  } else {
    console.log(chalk.cyan("  Mostrando:"), "chats recientes");
  }
  console.log();

  if (!hasSession()) {
    console.log(chalk.yellow("⚠️  No hay sesión guardada. Ejecuta primero:"));
    console.log(chalk.gray('   bun run wspp "contacto" "mensaje"'));
    console.log(chalk.gray("   para escanear el QR y guardar la sesión\n"));
    process.exit(1);
  }

  const spinner = ora("Iniciando (headless)...").start();
  const browser = await launchBrowser(true);

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await delay(5000);

    if (!(await isLoggedIn(page))) {
      // Esperar más
      for (let i = 0; i < 30; i++) {
        await delay(1000);
        if (await isLoggedIn(page)) break;
      }

      if (!(await isLoggedIn(page))) {
        throw new Error("Sesión expirada. Ejecuta: bun run wspp:login");
      }
    }

    spinner.text = "Sesión activa...";
    await delay(3000);

    if (keyword) {
      // Buscar contacto específico
      spinner.text = `Buscando "${keyword}"...`;

      const searchInput = await page.$('#side input');
      if (!searchInput) throw new Error("No se encontró la barra de búsqueda");

      await searchInput.click();
      await delay(500);
      await page.keyboard.type(keyword, { delay: 80 });
      await delay(3000);
    }

    // Extraer contactos visibles
    spinner.text = "Extrayendo contactos...";

    const contacts = await page.evaluate(() => {
      const results: Array<{ name: string; lastMsg: string; time: string }> = [];
      const items = document.querySelectorAll('span[title]');
      const seen = new Set<string>();

      items.forEach((span) => {
        const name = span.getAttribute('title') || '';
        if (!name || seen.has(name) || name.length > 50) return;
        seen.add(name);

        const row = span.closest('[role="listitem"]') || span.closest('[data-testid^="cell-frame"]');
        if (!row) return;

        // Buscar último mensaje
        const msgSpans = row.querySelectorAll('span[title]');
        let lastMsg = '';
        if (msgSpans.length > 1) {
          lastMsg = msgSpans[msgSpans.length - 1]?.getAttribute('title')?.substring(0, 40) || '';
        }

        // Buscar hora
        const timeEl = row.querySelector('div[class] > span');
        const time = timeEl?.textContent?.trim() || '';

        results.push({ name, lastMsg, time });
      });

      return results.slice(0, 15);
    });

    spinner.succeed(chalk.green(`✓ ${contacts.length} contactos encontrados`));

    if (contacts.length === 0) {
      console.log(chalk.yellow("\n⚠️  No se encontraron contactos"));
      if (keyword) {
        console.log(chalk.gray(`  Intenta con otro término en vez de "${keyword}"\n`));
      }
    } else {
      const table = new Table({
        head: [
          chalk.cyan("#"),
          chalk.cyan("Contacto"),
          chalk.cyan("Último mensaje"),
        ],
        colWidths: [5, 30, 45],
        wordWrap: true,
      });

      contacts.forEach((c, i) => {
        table.push([String(i + 1), c.name, c.lastMsg || "..."]);
      });

      console.log("\n" + table.toString());

      console.log(chalk.bold.yellow("\n💡 Para enviar mensaje:"));
      console.log(chalk.gray(`   bun run wspp "${contacts[0]?.name}" "Tu mensaje aquí"\n`));
    }

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(chalk.yellow("\n⚠️"), error.message);
  } finally {
    await closeBrowser(browser);
  }
}

wsppContacts();
