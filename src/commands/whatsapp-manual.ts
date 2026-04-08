import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser } from "../utils/browser";

async function whatsappManual() {
  const contactName = process.argv[2] || "";
  const message = process.argv.slice(3).join(" ") || "";

  console.log(chalk.bold.cyan("\n📱 WHATSAPP WEB - MODO ASISTIDO\n"));

  if (contactName && message) {
    console.log(chalk.cyan("  Contacto sugerido:"), contactName);
    console.log(chalk.cyan("  Mensaje sugerido:"), message);
  }

  console.log(chalk.gray("\nEste modo abre WhatsApp Web y te permite enviar mensajes manualmente"));
  console.log(chalk.gray("pero con asistencia para mantener la sesión activa.\n"));

  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Navegando a WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    spinner.text = "Cargando...";
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const hasQR = await page.$('canvas[aria-label*="Scan"]');

    if (hasQR) {
      spinner.info(chalk.yellow("📸 CÓDIGO QR DETECTADO"));
      console.log(chalk.bold.cyan("\n🔑 POR FAVOR ESCANEA EL QR\n"));
      console.log(chalk.gray("Esperando hasta 90 segundos...\n"));

      let attempts = 0;
      while (attempts < 90) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const qrStillExists = await page.$('canvas[aria-label*="Scan"]');

        if (!qrStillExists) {
          spinner.succeed(chalk.green("✓ QR escaneado - Autenticado"));
          break;
        }

        attempts++;
        if (attempts % 15 === 0) {
          console.log(chalk.gray(`  ${attempts} segundos...`));
        }
      }

      if (attempts >= 90) {
        throw new Error("Tiempo de espera agotado");
      }

      await new Promise((resolve) => setTimeout(resolve, 8000));
    } else {
      spinner.succeed(chalk.green("✓ Ya estás autenticado"));
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    console.log(chalk.bold.green("\n✅ WHATSAPP WEB LISTO\n"));

    if (contactName && message) {
      console.log(chalk.bold.yellow("📋 INSTRUCCIONES PARA ENVIAR TU MENSAJE:\n"));
      console.log(chalk.white(`  1. Busca el contacto: "${contactName}"`));
      console.log(chalk.white(`  2. Escribe el mensaje: "${message}"`));
      console.log(chalk.white("  3. Presiona Enter para enviar\n"));
    } else {
      console.log(chalk.yellow("💬 Puedes usar WhatsApp Web normalmente\n"));
    }

    console.log(chalk.cyan("⏰ El navegador permanecerá abierto por 2 minutos"));
    console.log(chalk.gray("   Tiempo suficiente para enviar tu mensaje\n"));

    // Mostrar countdown
    for (let i = 120; i > 0; i -= 10) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      if (i > 10) {
        console.log(chalk.gray(`   ${i - 10} segundos restantes...`));
      }
    }

    console.log(chalk.green("\n✓ Sesión finalizada\n"));
  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(chalk.gray("\nDetalles:"), error.message);
  } finally {
    await closeBrowser(browser);
  }
}

whatsappManual();
