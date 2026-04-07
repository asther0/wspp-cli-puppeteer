import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser } from "../utils/browser";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForQR(page: any): Promise<boolean> {
  try {
    await page.waitForSelector('canvas[aria-label*="Scan"]', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForAuth(page: any, spinner: any): Promise<void> {
  spinner.warn(chalk.yellow("📸 Escanea el QR (90s)"));

  for (let i = 0; i < 90; i++) {
    await delay(1000);
    const qrStill = await page.$('canvas[aria-label*="Scan"]');
    if (!qrStill) {
      spinner.succeed(chalk.green("✓ Autenticado"));
      return;
    }
    if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
  }

  throw new Error("Tiempo agotado esperando escaneo del QR");
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
  const browser = await launchBrowser();

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });
    await delay(5000);

    // QR
    if (await waitForQR(page)) {
      await waitForAuth(page, spinner);
      console.log(chalk.gray("  Esperando carga completa (20s)..."));
      await delay(20000);
    } else {
      spinner.succeed(chalk.green("✓ Ya autenticado"));
      await delay(8000);
    }

    // ===== PASO 1: Click en barra de búsqueda =====
    spinner.start("Buscando contacto...");

    // WhatsApp Web usa un div con role="textbox" o un placeholder visible
    // Hacer click en el área de búsqueda "Buscar un chat o iniciar uno nuevo"
    const searchClicked = await page.evaluate(() => {
      // Buscar por placeholder o texto
      const searchArea = document.querySelector('div[role="textbox"]')
        || document.querySelector('p.selectable-text[data-tab]')?.closest('[role="textbox"]')
        || document.querySelector('#side div[tabindex]');

      if (searchArea) {
        (searchArea as HTMLElement).click();
        return true;
      }

      // Fallback: buscar por el texto "Buscar"
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.getAttribute('title')?.includes('Buscar') ||
            el.getAttribute('aria-label')?.includes('Buscar')) {
          (el as HTMLElement).click();
          return true;
        }
      }

      return false;
    });

    if (!searchClicked) {
      throw new Error("No se encontró la barra de búsqueda");
    }

    await delay(1000);

    // ===== PASO 2: Escribir nombre del contacto =====
    spinner.text = `Escribiendo "${contactName}"...`;
    await page.keyboard.type(contactName, { delay: 150 });
    await delay(4000);

    // ===== PASO 3: Seleccionar contacto =====
    spinner.text = "Seleccionando contacto...";

    // Buscar el contacto en los resultados haciendo click
    const contactFound = await page.evaluate((name: string) => {
      // Buscar span con el nombre del contacto
      const spans = document.querySelectorAll('span[title]');
      for (const span of spans) {
        if (span.getAttribute('title')?.toLowerCase().includes(name.toLowerCase())) {
          (span.closest('[role="listitem"]') as HTMLElement)?.click()
            || (span.closest('[data-testid]') as HTMLElement)?.click()
            || (span as HTMLElement).click();
          return true;
        }
      }

      // Fallback: primer listitem
      const firstItem = document.querySelector('[role="listitem"]');
      if (firstItem) {
        (firstItem as HTMLElement).click();
        return true;
      }

      return false;
    }, contactName);

    if (!contactFound) {
      // Intentar con Enter
      await page.keyboard.press("Enter");
    }

    await delay(4000);

    // ===== PASO 4: Escribir mensaje =====
    spinner.text = "Escribiendo mensaje...";

    // Buscar el cuadro de mensaje (el footer del chat)
    const msgBoxClicked = await page.evaluate(() => {
      // Buscar el cuadro de mensaje por role textbox en el footer/panel principal
      const footer = document.querySelector('footer');
      if (footer) {
        const textbox = footer.querySelector('[role="textbox"]')
          || footer.querySelector('[contenteditable="true"]')
          || footer.querySelector('div[data-tab="10"]');

        if (textbox) {
          (textbox as HTMLElement).click();
          return "footer-textbox";
        }
      }

      // Buscar en el panel de conversación
      const panel = document.querySelector('[data-testid="conversation-panel-wrapper"]')
        || document.querySelector('main');

      if (panel) {
        const textbox = panel.querySelector('[role="textbox"]')
          || panel.querySelector('[contenteditable="true"]');

        if (textbox) {
          (textbox as HTMLElement).click();
          return "panel-textbox";
        }
      }

      // Fallback: buscar todos los textbox y usar el último
      const allTextboxes = document.querySelectorAll('[role="textbox"]');
      if (allTextboxes.length > 0) {
        const last = allTextboxes[allTextboxes.length - 1];
        (last as HTMLElement).click();
        return "last-textbox";
      }

      return null;
    });

    if (!msgBoxClicked) {
      throw new Error("No se encontró el cuadro de mensaje. El chat puede no haberse abierto.");
    }

    await delay(500);

    // Escribir el mensaje
    await page.keyboard.type(message, { delay: 80 });
    await delay(1000);

    // ===== PASO 5: Enviar =====
    spinner.text = "Enviando...";
    await page.keyboard.press("Enter");
    await delay(3000);

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
