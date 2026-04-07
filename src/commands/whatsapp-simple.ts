import chalk from "chalk";
import ora from "ora";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function whatsappSimple() {
  console.log(chalk.bold.cyan("\n📱 WHATSAPP WEB - DEMO SIMPLE\n"));
  console.log(chalk.gray("Este demo abre WhatsApp Web y mantiene el navegador abierto\n"));

  const spinner = ora("Iniciando navegador Chrome...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = "Navegando a WhatsApp Web...";

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    spinner.text = "Detectando estado de sesión...";

    // Verificar si hay QR o ya está logueado
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const hasQR = await page.$('canvas[aria-label*="Scan"]');

    if (hasQR) {
      spinner.info(chalk.yellow("📸 CÓDIGO QR DETECTADO"));
      console.log(chalk.bold.cyan("\n🔑 INSTRUCCIONES PARA ESCANEAR:\n"));
      console.log(chalk.white("  1. Abre WhatsApp en tu teléfono"));
      console.log(chalk.white("  2. Ve a Configuración → Dispositivos vinculados"));
      console.log(chalk.white("  3. Toca 'Vincular dispositivo'"));
      console.log(chalk.white("  4. Escanea el QR que aparece en el navegador"));
      console.log();

      spinner.start("Esperando escaneo del QR...");

      // Esperar hasta 60 segundos a que se escanee
      try {
        await page.waitForSelector('div[data-testid="conversation-panel-wrapper"]', {
          timeout: 60000,
        });
        spinner.succeed(chalk.green("✓ QR escaneado exitosamente"));
      } catch {
        spinner.warn(chalk.yellow("⏱️  Tiempo de espera agotado"));
      }
    } else {
      // Ya está logueado
      spinner.succeed(chalk.green("✓ Ya estás autenticado en WhatsApp Web"));
    }

    // Información adicional
    const pageTitle = await page.title();
    const currentUrl = page.url();

    console.log(chalk.bold.yellow("\n✅ WHATSAPP WEB ACTIVO\n"));
    console.log(chalk.cyan("  URL:"), currentUrl);
    console.log(chalk.cyan("  Título:"), pageTitle);
    console.log(chalk.cyan("  Timestamp:"), new Date().toLocaleString("es-ES"));

    console.log(chalk.bold.green("\n🎉 DEMO EXITOSO - wspp-cli funcionando con Puppeteer\n"));
    console.log(chalk.yellow("⏳ El navegador permanecerá abierto por 20 segundos..."));
    console.log(chalk.gray("   Puedes interactuar manualmente con WhatsApp Web\n"));

    await new Promise((resolve) => setTimeout(resolve, 20000));

    console.log(chalk.gray("Cerrando navegador..."));
  } catch (error) {
    spinner.fail(chalk.red("Error durante la automatización"));
    console.error(error);
  } finally {
    await closeBrowser(browser);
    console.log(chalk.green("\n✓ Sesión finalizada\n"));
  }
}

whatsappSimple();
