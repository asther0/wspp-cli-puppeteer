import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser } from "../utils/browser";

async function whatsappAuto() {
  const contactName = process.argv[2];
  const message = process.argv.slice(3).join(" ");

  if (!contactName || !message) {
    console.log(chalk.red("\n❌ Faltan parámetros"));
    console.log(chalk.yellow('\n📝 Uso: bun run whatsapp:auto "Contacto" "Mensaje"\n'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n📱 WSPP-CLI - ENVÍO AUTOMÁTICO\n"));
  console.log(chalk.cyan("  Para:"), contactName);
  console.log(chalk.cyan("  Mensaje:"), message);
  console.log();

  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const pages = await browser.pages();
    const page = pages[0];

    // Deshabilitar timeout por defecto
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Manejo del QR
    const hasQR = await page.$('canvas[aria-label*="Scan"]');
    if (hasQR) {
      spinner.warn(chalk.yellow("📸 Escanea el QR"));
      console.log(chalk.gray("Esperando (máx 90s)...\n"));

      for (let i = 0; i < 90; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const qrGone = !(await page.$('canvas[aria-label*="Scan"]'));
        if (qrGone) {
          spinner.succeed(chalk.green("✓ Autenticado"));
          break;
        }
        if (i % 15 === 0 && i > 0) console.log(chalk.gray(`  ${i}s...`));
      }

      await new Promise((resolve) => setTimeout(resolve, 10000)); // Esperar carga completa
    } else {
      spinner.succeed(chalk.green("✓ Ya autenticado"));
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    spinner.start("Buscando barra de búsqueda...");

    // Método usando XPath y clicks en posiciones
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    // Buscar usando XPath para ser más robusto
    await page.waitForXPath('//*[@contenteditable="true"]', { timeout: 10000 });

    spinner.text = "Ingresando nombre del contacto...";

    // Obtener todos los elementos editables
    const editableElements = await page.$x('//*[@contenteditable="true"]');

    if (editableElements.length === 0) {
      throw new Error("No se encontraron campos editables");
    }

    // El primer campo editable es generalmente la búsqueda
    const searchBox = editableElements[0];
    await searchBox.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Limpiar cualquier texto previo
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Escribir el nombre del contacto
    await searchBox.type(contactName, { delay: 100 });
    await new Promise((resolve) => setTimeout(resolve, 3000));

    spinner.text = "Abriendo conversación...";

    // Buscar el resultado usando múltiples métodos
    let chatOpened = false;

    // Método 1: Buscar por XPath
    try {
      const chatElements = await page.$x('//div[@role="listitem"]');
      if (chatElements.length > 0) {
        await chatElements[0].click();
        chatOpened = true;
      }
    } catch (e) {
      // Continuar con otros métodos
    }

    // Método 2: Buscar por selector de data-testid
    if (!chatOpened) {
      try {
        const chat = await page.$('[data-testid^="cell-frame"]');
        if (chat) {
          await chat.click();
          chatOpened = true;
        }
      } catch (e) {
        // Continuar
      }
    }

    if (!chatOpened) {
      throw new Error(`No se encontró el contacto "${contactName}"`);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));

    spinner.text = "Escribiendo mensaje...";

    // Buscar el cuadro de mensaje usando múltiples estrategias
    const messageElements = await page.$x('//*[@contenteditable="true"]');

    if (messageElements.length < 2) {
      throw new Error("No se encontró el cuadro de mensaje");
    }

    // El último campo editable es el cuadro de mensaje
    const messageBox = messageElements[messageElements.length - 1];
    await messageBox.click();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Escribir el mensaje
    await messageBox.type(message, { delay: 50 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    spinner.text = "Enviando...";

    // Enviar con Enter
    await page.keyboard.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    spinner.succeed(chalk.green("✓ MENSAJE ENVIADO AUTOMÁTICAMENTE"));

    console.log(chalk.bold.green("\n✅ ÉXITO - WSPP-CLI FUNCIONANDO\n"));
    console.log(chalk.cyan("  📤 Para:"), contactName);
    console.log(chalk.cyan("  💬 Mensaje:"), `"${message}"`);
    console.log(chalk.cyan("  🕐 Hora:"), new Date().toLocaleTimeString("es-ES"));

    console.log(chalk.yellow("\n⏳ Navegador abierto 5s para verificar...\n"));
    await new Promise((resolve) => setTimeout(resolve, 5000));

  } catch (error: any) {
    spinner.fail(chalk.red("✖ Error en automatización"));
    console.error(chalk.gray("\n💥 Detalle:"), error.message);

    console.log(chalk.yellow("\n🔧 Soluciones:"));
    console.log(chalk.gray("  • Verifica el nombre exacto del contacto"));
    console.log(chalk.gray("  • Asegúrate de tener chat previo con ese contacto"));
    console.log(chalk.gray("  • WhatsApp Web puede haber actualizado su estructura\n"));

    await new Promise((resolve) => setTimeout(resolve, 5000));
  } finally {
    await closeBrowser(browser);
  }
}

whatsappAuto();
