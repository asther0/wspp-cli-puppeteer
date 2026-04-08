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

    // Esperar hasta 60s a que cargue
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
      // Buscar contacto específico
      spinner.text = `Buscando "${keyword}"...`;

      const searchInput = await page.$('#side input');
      if (!searchInput) throw new Error("No se encontró la barra de búsqueda");

      await searchInput.click();
      await delay(500);
      await page.keyboard.type(keyword, { delay: 80 });
      await delay(3000);
    }

    // Debug screenshot
    await page.screenshot({ path: "wspp-contacts-state.png" });

    // Extraer contactos visibles
    spinner.text = "Extrayendo contactos...";

    const contacts = await page.evaluate(() => {
      const results: Array<{ name: string; lastMsg: string; time: string }> = [];
      const seen = new Set<string>();

      // Buscar todos los elementos que parecen ser nombres de chat
      // WhatsApp usa spans con title, o spans dentro de ciertos contenedores
      const chatRows = document.querySelectorAll('[role="listitem"], [data-testid^="cell-frame-container"]');

      chatRows.forEach((row) => {
        // Buscar el nombre del chat - puede ser span[title] o el primer texto prominente
        const nameSpan = row.querySelector('span[title]')
          || row.querySelector('[data-testid^="cell-frame-title"] span')
          || row.querySelector('span[dir="auto"]');

        const name = nameSpan?.getAttribute('title')
          || nameSpan?.textContent?.trim()
          || '';

        if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;
        seen.add(name);

        // Buscar último mensaje
        const msgEl = row.querySelector('[data-testid^="last-msg"] span')
          || row.querySelector('span[title]:nth-of-type(2)')
          || row.querySelectorAll('span[dir="auto"]')[1];

        const lastMsg = (msgEl?.textContent?.trim() || '').substring(0, 45);

        // Buscar hora
        const allSmallText = row.querySelectorAll('span');
        let time = '';
        allSmallText.forEach((s) => {
          const t = s.textContent?.trim() || '';
          if (t.match(/^\d{1,2}:\d{2}|yesterday|ayer|AM|PM|\d{1,2}\/\d{1,2}/i)) {
            time = t;
          }
        });

        results.push({ name, lastMsg, time });
      });

      // Si no encontró por listitem, buscar directamente todos los span[title] en #side
      if (results.length === 0) {
        const side = document.querySelector('#side');
        if (side) {
          const allSpans = side.querySelectorAll('span[title], span[dir="auto"]');
          allSpans.forEach((span) => {
            const text = span.getAttribute('title') || span.textContent?.trim() || '';
            if (text && !seen.has(text) && text.length > 1 && text.length < 50
                && !text.startsWith('http') && !text.includes('Buscar')
                && !text.includes('Search')) {
              seen.add(text);
              results.push({ name: text, lastMsg: '', time: '' });
            }
          });
        }
      }

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
