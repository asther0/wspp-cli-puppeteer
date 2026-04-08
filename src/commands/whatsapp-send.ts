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
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verificar si hay QR o ya está logueado
    const hasQR = await page.$('canvas[aria-label*="Scan"]');

    if (hasQR) {
      spinner.warn(chalk.yellow("📸 CÓDIGO QR DETECTADO - Esperando escaneo..."));
      console.log(chalk.gray("   Por favor escanea el QR en el navegador que se acaba de abrir\n"));

      await page.waitForSelector('div[data-testid="conversation-panel-wrapper"]', {
        timeout: 90000,
      });

      spinner.succeed(chalk.green("✓ Autenticado exitosamente"));
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      spinner.succeed(chalk.green("✓ Ya estás autenticado"));
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    spinner.start(`Buscando contacto: ${contactName}...`);

    // Buscar el contacto usando el cuadro de búsqueda
    const searchSelector = 'div[contenteditable="true"][data-tab="3"]';

    try {
      await page.waitForSelector(searchSelector, { timeout: 10000 });
      await page.click(searchSelector);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Limpiar búsqueda anterior si hay
      await page.keyboard.down("Control");
      await page.keyboard.press("A");
      await page.keyboard.up("Control");
      await page.keyboard.press("Backspace");

      await page.type(searchSelector, contactName, { delay: 100 });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      spinner.text = "Seleccionando chat...";

      // Hacer clic en el primer resultado
      await page.waitForSelector('div[data-testid^="cell-frame-container"]', { timeout: 5000 });
      await page.click('div[data-testid^="cell-frame-container"]');
      await new Promise((resolve) => setTimeout(resolve, 1500));

      spinner.text = "Escribiendo mensaje...";

      // Escribir el mensaje en el cuadro de texto
      const messageBoxSelector = 'div[contenteditable="true"][data-tab="10"]';
      await page.waitForSelector(messageBoxSelector, { timeout: 5000 });
      await page.click(messageBoxSelector);
      await page.type(messageBoxSelector, message, { delay: 50 });

      spinner.text = "Enviando mensaje...";
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Enviar el mensaje (presionar Enter)
      await page.keyboard.press("Enter");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      throw new Error(`No se pudo encontrar o enviar mensaje al contacto: ${contactName}`);
    }

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
