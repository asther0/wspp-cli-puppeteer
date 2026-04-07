import chalk from "chalk";
import ora from "ora";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function whatsappSendMessage() {
  const contactName = process.argv[2];
  const message = process.argv.slice(3).join(" ");

  if (!contactName || !message) {
    console.log(chalk.red("\n❌ Uso incorrecto"));
    console.log(chalk.yellow('\n📝 Uso: bun run whatsapp:send "Nombre del Contacto" "Mensaje"\n'));
    console.log(chalk.gray('   Ejemplo: bun run whatsapp:send "Juan Pérez" "Hola desde Puppeteer!"\n'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n📤 ENVIAR MENSAJE DE WHATSAPP\n"));
  console.log(chalk.cyan("  Destinatario:"), contactName);
  console.log(chalk.cyan("  Mensaje:"), message);
  console.log();

  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = "Navegando a WhatsApp Web...";

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    spinner.text = "Verificando sesión...";

    // Esperar a que cargue (o mostrar QR)
    try {
      await page.waitForSelector('canvas[aria-label="Scan this QR code to link a device!"]', {
        timeout: 5000,
      });

      spinner.info(chalk.yellow("📸 ESCANEA EL CÓDIGO QR PRIMERO"));
      console.log(chalk.gray("   Ejecuta primero: bun run whatsapp\n"));

      await page.waitForSelector('div[data-testid="conversation-panel-wrapper"]', {
        timeout: 60000,
      });
    } catch {
      // Ya logueado
    }

    spinner.text = `Buscando contacto: ${contactName}...`;

    // Buscar el contacto
    await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', {
      timeout: 10000,
    });

    await page.click('div[contenteditable="true"][data-tab="3"]');
    await page.type('div[contenteditable="true"][data-tab="3"]', contactName);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Hacer clic en el primer resultado
    spinner.text = "Seleccionando chat...";
    await page.waitForSelector('div[role="listitem"]', { timeout: 5000 });
    await page.click('div[role="listitem"]');

    await new Promise((resolve) => setTimeout(resolve, 1000));

    spinner.text = "Escribiendo mensaje...";

    // Escribir el mensaje
    await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', {
      timeout: 5000,
    });

    await page.click('div[contenteditable="true"][data-tab="10"]');
    await page.type('div[contenteditable="true"][data-tab="10"]', message);

    spinner.text = "Enviando mensaje...";

    // Enviar el mensaje (presionar Enter)
    await page.keyboard.press("Enter");

    await new Promise((resolve) => setTimeout(resolve, 2000));

    spinner.succeed(chalk.green("✓ Mensaje enviado exitosamente"));

    console.log(chalk.bold.green("\n✅ MENSAJE ENVIADO\n"));
    console.log(chalk.cyan("  A:"), contactName);
    console.log(chalk.cyan("  Contenido:"), message);

    console.log(chalk.yellow("\n⏳ Navegador permanecerá abierto 5 segundos...\n"));
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    spinner.fail(chalk.red("Error al enviar mensaje"));
    console.error(chalk.gray("\nDetalles del error:"));
    console.error(error);
    console.log(
      chalk.yellow(
        "\n💡 Tip: Asegúrate de que el nombre del contacto coincida exactamente con WhatsApp\n"
      )
    );
  } finally {
    await closeBrowser(browser);
  }
}

whatsappSendMessage();
