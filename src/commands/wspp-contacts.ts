import chalk from "chalk";
import ora from "ora";
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

      return results.slice(0, 25);
    });

    // Filter out non-contact entries
    const NOISE = [
      "you", "aún no", "hola desde", "http", "buscar", "search",
      "chats", "loading", "waiting for", "this may take", "pollito",
      "convertido", "omg", "no hay mensajes",
    ];
    const filtered = contacts
      .map(c => c.name)
      .filter(name => {
        const lower = name.toLowerCase();
        if (NOISE.some(n => lower.includes(n))) return false;
        if (name.length <= 1) return false;
        if (/^\d{1,2}:\d{2}/.test(name)) return false;
        if (/^(AM|PM)$/i.test(name)) return false;
        if (/^[\p{Emoji}\s✅👍🏻]+$/u.test(name)) return false;
        // Filter out messages: if it looks like a sentence (lowercase start + spaces + long)
        if (/^[a-záéíóúñ]/.test(name) && name.includes(' ') && name.length > 25) return false;
        // Filter WhatsApp invisible chars + short junk
        if (/^[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/.test(name) && name.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g, '').length < 3) return false;
        return true;
      })
      .slice(0, 10);

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
      console.log(chalk.gray(`   bun run wspp "${filtered[0]}" "Tu mensaje aquí"\n`));
    }

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(chalk.yellow("\n⚠️"), error.message);
  } finally {
    await closeBrowser(browser);
  }
}

wsppContacts();
