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

    let loaded = false;
    for (let i = 0; i < 60; i++) {
      if (await isLoggedIn(page)) { loaded = true; break; }
      await delay(1000);
      if (i > 0 && i % 10 === 0) spinner.text = `Cargando chats (${i}s)...`;
    }

    if (!loaded) {
      await page.screenshot({ path: "wspp-contacts-debug.png" });
      throw new Error("No se pudo cargar. Revisa wspp-contacts-debug.png o ejecuta: bun run wspp:login");
    }

    spinner.text = "Sesión activa...";
    await delay(3000);

    if (keyword) {
      spinner.text = `Buscando "${keyword}"...`;
      const searchInput = await page.$('#side input');
      if (!searchInput) throw new Error("No se encontró la barra de búsqueda");
      await searchInput.click();
      await delay(500);
      await page.keyboard.type(keyword, { delay: 80 });
      await delay(3000);
    }

    spinner.text = "Extrayendo contactos...";
    const filtered = await extractContacts(page);

    spinner.succeed(chalk.green(`✓ ${filtered.length} contactos encontrados`));

    if (filtered.length === 0) {
      console.log(chalk.yellow("\n⚠️  No se encontraron contactos"));
      if (keyword) {
        console.log(chalk.gray(`  Intenta con otro término en vez de "${keyword}"\n`));
      }
    } else {
      const maxLen = Math.max(...filtered.map(n => n.length), 20);
      const colW = Math.max(maxLen + 2, 40);
      const numW = 4;

      const line = (l: string, m: string, r: string, fill: string) =>
        l + fill.repeat(numW + 2) + m + fill.repeat(colW + 2) + r;

      console.log(chalk.cyan("\n" + line("╔", "╦", "╗", "═")));
      console.log(chalk.cyan("║") + chalk.bold.white(" #".padEnd(numW + 2)) + chalk.cyan("║") + chalk.bold.white(" Contacto".padEnd(colW + 2)) + chalk.cyan("║"));
      console.log(chalk.cyan(line("╠", "╬", "╣", "═")));

      filtered.forEach((name, i) => {
        const num = ` ${String(i + 1).padEnd(numW + 1)}`;
        const col = ` ${name.padEnd(colW + 1)}`;
        console.log(chalk.cyan("║") + chalk.white(num) + chalk.cyan("║") + chalk.green(col) + chalk.cyan("║"));
      });

      console.log(chalk.cyan(line("╚", "╩", "╝", "═")));

      console.log(chalk.bold.yellow("\n💡 Para enviar mensaje:"));
      console.log(chalk.gray(`   bun run wspp 3 "Tu mensaje aquí"  → envía al contacto #3\n`));
    }

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(chalk.yellow("\n⚠️"), error.message);
  } finally {
    await closeBrowser(browser);
  }
}

wsppContacts();
