import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { showBanner } from "../ui/banner";
import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function wsppLogin() {
  showBanner();

  if (hasSession()) {
    console.log(chalk.yellow("  Ya existe una sesión guardada."));
    console.log(chalk.gray("  Si necesitas re-vincular, borra la carpeta .wspp-session\n"));
  }

  const spinner = ora("Abriendo navegador (visible para QR)...").start();

  // Forzar visible para el QR
  const browser = await launchBrowser(true, true);

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Navegando a WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await delay(3000);

    const alreadyLoggedIn = await page.evaluate(() => {
      const side = document.querySelector('#side');
      return !!(side?.querySelector('input, span[title]'));
    });

    if (alreadyLoggedIn) {
      spinner.succeed(chalk.green("✓ Ya estás autenticado"));
      console.log(chalk.gray("  La sesión está guardada en .wspp-session/\n"));
    } else {
      spinner.warn(chalk.yellow("📸 Escanea el QR con tu teléfono"));
      console.log(chalk.gray("  La sesión se guardará automáticamente\n"));

      for (let i = 0; i < 120; i++) {
        await delay(1000);
        const loggedIn = await page.evaluate(() => {
          const side = document.querySelector('#side');
          return !!(side?.querySelector('input, span[title]'));
        });

        if (loggedIn) {
          spinner.succeed(chalk.green("✓ Login exitoso - Sesión guardada"));
          break;
        }

        if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
      }
    }

    console.log(chalk.bold.green("\n✅ LISTO\n"));
    console.log(chalk.cyan("  Ahora puedes usar:"));
    console.log(chalk.gray('   bun run wspp "Contacto" "Mensaje"  → Enviar mensaje'));
    console.log(chalk.gray('   bun run wspp:contacts              → Ver contactos'));
    console.log(chalk.gray('   bun run wspp:i                     → Modo interactivo\n'));

    await delay(3000);

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(error.message);
  } finally {
    await closeBrowser(browser);
  }
}

wsppLogin();
