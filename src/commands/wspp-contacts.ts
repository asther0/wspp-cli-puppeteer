import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { extractContacts } from "../utils/contacts";
import { showBanner } from "../ui/banner";
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

  showBanner();

  if (keyword) {
    console.log(chalk.cyan("  🔍 Buscando:"), `"${keyword}"\n`);
  } else {
    console.log(chalk.cyan("  📋 Mostrando:"), "chats recientes\n");
  }

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
      const nameW = Math.max(...filtered.map(c => c.name.length), 20) + 2;
      const numW = 4;
      const hasAnyPhone = filtered.some(c => c.phone);
      const phoneW = hasAnyPhone ? 18 : 0;

      if (hasAnyPhone) {
        const line = (l: string, c1: string, c2: string, r: string, fill: string) =>
          l + fill.repeat(numW + 2) + c1 + fill.repeat(nameW + 2) + c2 + fill.repeat(phoneW + 2) + r;

        console.log(chalk.cyan("\n" + line("╔", "╦", "╦", "╗", "═")));
        console.log(
          chalk.cyan("║") + chalk.bold.white(" #".padEnd(numW + 2)) +
          chalk.cyan("║") + chalk.bold.white(" Contacto".padEnd(nameW + 2)) +
          chalk.cyan("║") + chalk.bold.white(" Teléfono".padEnd(phoneW + 2)) +
          chalk.cyan("║")
        );
        console.log(chalk.cyan(line("╠", "╬", "╬", "╣", "═")));

        filtered.forEach((c, i) => {
          const num = ` ${String(i + 1).padEnd(numW + 1)}`;
          const name = ` ${c.name.padEnd(nameW + 1)}`;
          const phone = ` ${(c.phone || "—").padEnd(phoneW + 1)}`;
          console.log(
            chalk.cyan("║") + chalk.white(num) +
            chalk.cyan("║") + chalk.green(name) +
            chalk.cyan("║") + chalk.gray(phone) +
            chalk.cyan("║")
          );
        });

        console.log(chalk.cyan(line("╚", "╩", "╩", "╝", "═")));
      } else {
        const line = (l: string, m: string, r: string, fill: string) =>
          l + fill.repeat(numW + 2) + m + fill.repeat(nameW + 2) + r;

        console.log(chalk.cyan("\n" + line("╔", "╦", "╗", "═")));
        console.log(
          chalk.cyan("║") + chalk.bold.white(" #".padEnd(numW + 2)) +
          chalk.cyan("║") + chalk.bold.white(" Contacto".padEnd(nameW + 2)) +
          chalk.cyan("║")
        );
        console.log(chalk.cyan(line("╠", "╬", "╣", "═")));

        filtered.forEach((c, i) => {
          const num = ` ${String(i + 1).padEnd(numW + 1)}`;
          const name = ` ${c.name.padEnd(nameW + 1)}`;
          console.log(
            chalk.cyan("║") + chalk.white(num) +
            chalk.cyan("║") + chalk.green(name) +
            chalk.cyan("║")
          );
        });

        console.log(chalk.cyan(line("╚", "╩", "╝", "═")));
      }

      console.log(chalk.dim('\n  Uso: bun run wspp 3 "mensaje" · bun run wspp "nombre" "mensaje"\n'));
    }

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(chalk.yellow("\n⚠️"), error.message);
  } finally {
    await closeBrowser(browser);
  }
}

wsppContacts();
