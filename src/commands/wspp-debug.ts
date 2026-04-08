import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser } from "../utils/browser";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function wsppDebug() {
  const contactName = process.argv[2] || "Lywinecito";
  const message = process.argv.slice(3).join(" ") || "Hola desde wspp cli";

  console.log(chalk.bold.green("\n🔍 WSPP-CLI DEBUG - SCREENSHOTS EN CADA PASO\n"));
  console.log(chalk.cyan("  Para:"), contactName);
  console.log(chalk.cyan("  Mensaje:"), message);
  console.log();

  const spinner = ora("Iniciando...").start();
  const browser = await launchBrowser();

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });
    await delay(5000);

    // QR
    let qrDetected = false;
    try {
      await page.waitForSelector('canvas[aria-label*="Scan"]', { timeout: 3000 });
      qrDetected = true;
    } catch {}

    if (qrDetected) {
      spinner.warn(chalk.yellow("📸 Escanea el QR (90s)"));
      for (let i = 0; i < 90; i++) {
        await delay(1000);
        const qrStill = await page.$('canvas[aria-label*="Scan"]');
        if (!qrStill) { spinner.succeed(chalk.green("✓ QR escaneado")); break; }
        if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
      }
      console.log(chalk.gray("  Esperando carga completa (20s)..."));
      await delay(20000);
    } else {
      spinner.succeed(chalk.green("✓ Ya autenticado"));
      await delay(8000);
    }

    // ===== SCREENSHOT 1: Estado después de auth =====
    await page.screenshot({ path: "step1-after-auth.png" });
    console.log(chalk.yellow("\n📸 step1-after-auth.png"));

    // Analizar todos los role="textbox"
    const textboxInfo = await page.evaluate(() => {
      const textboxes = document.querySelectorAll('[role="textbox"]');
      return Array.from(textboxes).map((el, i) => ({
        index: i,
        tag: el.tagName,
        dataTab: el.getAttribute('data-tab'),
        ariaLabel: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        placeholder: el.getAttribute('data-placeholder') || el.getAttribute('placeholder'),
        parentTag: el.parentElement?.tagName,
        inFooter: !!el.closest('footer'),
        inSide: !!el.closest('#side'),
        text: el.textContent?.substring(0, 30) || '',
      }));
    });

    console.log(chalk.bold.cyan(`\n📊 TEXTBOXES [role="textbox"]: ${textboxInfo.length}\n`));
    textboxInfo.forEach((tb) => {
      console.log(chalk.cyan(`  [${tb.index}]`), `data-tab="${tb.dataTab}"`, `inSide=${tb.inSide}`, `inFooter=${tb.inFooter}`);
      console.log(chalk.gray(`      aria="${tb.ariaLabel}" title="${tb.title}" placeholder="${tb.placeholder}"`));
      console.log(chalk.gray(`      text="${tb.text}"`));
      console.log();
    });

    // ===== PASO 1: Click en búsqueda =====
    spinner.start("PASO 1: Click en barra de búsqueda...");

    const searchResult = await page.evaluate(() => {
      // Intentar con el textbox del side panel
      const sideTextbox = document.querySelector('#side [role="textbox"]');
      if (sideTextbox) {
        (sideTextbox as HTMLElement).click();
        (sideTextbox as HTMLElement).focus();
        return "side-textbox";
      }

      // Buscar por aria-label/title que contenga "Buscar"
      const allTextboxes = document.querySelectorAll('[role="textbox"]');
      for (const tb of allTextboxes) {
        const aria = tb.getAttribute('aria-label') || '';
        const title = tb.getAttribute('title') || '';
        if (aria.includes('Buscar') || aria.includes('Search') || title.includes('Buscar')) {
          (tb as HTMLElement).click();
          (tb as HTMLElement).focus();
          return `found-by-aria: ${aria}`;
        }
      }

      // Buscar por data-tab
      const tabTextbox = document.querySelector('[role="textbox"][data-tab]');
      if (tabTextbox) {
        (tabTextbox as HTMLElement).click();
        (tabTextbox as HTMLElement).focus();
        return `data-tab: ${tabTextbox.getAttribute('data-tab')}`;
      }

      // Último recurso: primer textbox
      if (allTextboxes.length > 0) {
        (allTextboxes[0] as HTMLElement).click();
        (allTextboxes[0] as HTMLElement).focus();
        return "first-textbox-fallback";
      }

      return null;
    });

    console.log(chalk.cyan("  Resultado búsqueda:"), searchResult || "NO ENCONTRADO");

    if (!searchResult) throw new Error("No se encontró barra de búsqueda");

    await delay(1000);
    await page.screenshot({ path: "step2-search-clicked.png" });
    console.log(chalk.yellow("📸 step2-search-clicked.png"));

    // ===== PASO 2: Escribir nombre =====
    spinner.text = `PASO 2: Escribiendo "${contactName}"...`;
    await page.keyboard.type(contactName, { delay: 150 });
    await delay(4000);

    await page.screenshot({ path: "step3-name-typed.png" });
    console.log(chalk.yellow("📸 step3-name-typed.png"));

    // ===== PASO 3: Seleccionar contacto =====
    spinner.text = "PASO 3: Seleccionando contacto...";

    const contactResult = await page.evaluate((name: string) => {
      const spans = document.querySelectorAll('span[title]');
      for (const span of spans) {
        const title = span.getAttribute('title') || '';
        if (title.toLowerCase().includes(name.toLowerCase())) {
          const clickTarget = span.closest('[role="listitem"]') || span.closest('[data-testid]') || span;
          (clickTarget as HTMLElement).click();
          return `found: "${title}"`;
        }
      }

      const firstItem = document.querySelector('[role="listitem"]');
      if (firstItem) {
        (firstItem as HTMLElement).click();
        return "clicked-first-listitem";
      }

      return null;
    }, contactName);

    console.log(chalk.cyan("  Resultado contacto:"), contactResult || "NO ENCONTRADO");

    if (!contactResult) {
      await page.keyboard.press("Enter");
      console.log(chalk.gray("  Fallback: presionando Enter"));
    }

    await delay(4000);
    await page.screenshot({ path: "step4-contact-selected.png" });
    console.log(chalk.yellow("📸 step4-contact-selected.png"));

    // ===== PASO 4: Escribir mensaje =====
    spinner.text = "PASO 4: Buscando cuadro de mensaje...";

    const msgResult = await page.evaluate(() => {
      const footer = document.querySelector('footer');
      if (footer) {
        const textbox = footer.querySelector('[role="textbox"]');
        if (textbox) {
          (textbox as HTMLElement).click();
          (textbox as HTMLElement).focus();
          return `footer-textbox data-tab="${textbox.getAttribute('data-tab')}"`;
        }
      }

      const main = document.querySelector('main');
      if (main) {
        const textbox = main.querySelector('[role="textbox"]');
        if (textbox) {
          (textbox as HTMLElement).click();
          (textbox as HTMLElement).focus();
          return `main-textbox data-tab="${textbox.getAttribute('data-tab')}"`;
        }
      }

      const allTb = document.querySelectorAll('[role="textbox"]');
      if (allTb.length > 1) {
        const last = allTb[allTb.length - 1];
        (last as HTMLElement).click();
        (last as HTMLElement).focus();
        return `last-of-${allTb.length} data-tab="${last.getAttribute('data-tab')}"`;
      }

      return null;
    });

    console.log(chalk.cyan("  Resultado msgbox:"), msgResult || "NO ENCONTRADO");

    if (!msgResult) throw new Error("No se encontró cuadro de mensaje");

    await delay(500);

    spinner.text = "PASO 4b: Escribiendo mensaje...";
    await page.keyboard.type(message, { delay: 80 });
    await delay(1500);

    await page.screenshot({ path: "step5-message-typed.png" });
    console.log(chalk.yellow("📸 step5-message-typed.png"));

    // ===== PASO 5: Enviar =====
    spinner.text = "PASO 5: Enviando...";
    await page.keyboard.press("Enter");
    await delay(3000);

    await page.screenshot({ path: "step6-after-send.png" });
    console.log(chalk.yellow("📸 step6-after-send.png"));

    spinner.succeed(chalk.bold.green("✓ Proceso completado"));

    console.log(chalk.bold.yellow("\n🔍 Revisa los screenshots para verificar cada paso\n"));
    await delay(5000);

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(error.message);
    await delay(3000);
  } finally {
    await closeBrowser(browser);
  }
}

wsppDebug();
