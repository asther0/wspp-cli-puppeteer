import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser } from "../utils/browser";

async function whatsappSendViaURL() {
  const contactName = process.argv[2];
  const message = process.argv.slice(3).join(" ");

  if (!contactName || !message) {
    console.log(chalk.red("\n❌ Uso incorrecto"));
    console.log(chalk.yellow('\n📝 Uso: bun run whatsapp:url "Nombre del Contacto" "Mensaje"\n'));
    console.log(chalk.gray('   Ejemplo: bun run whatsapp:url "Juan Pérez" "Hola!"\n'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n📤 ENVIAR MENSAJE VÍA URL DE WHATSAPP\n"));
  console.log(chalk.cyan("  Destinatario:"), contactName);
  console.log(chalk.cyan("  Mensaje:"), message);
  console.log();

  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    // Crear una nueva página
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Navegando a WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    spinner.text = "Esperando carga inicial...";
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Verificar QR
    const hasQR = await page.$('canvas[aria-label*="Scan"]');

    if (hasQR) {
      spinner.warn(chalk.yellow("📸 ESCANEA EL QR"));
      console.log(chalk.gray("\nEsperando hasta 90 segundos...\n"));

      let attempts = 0;
      while (attempts < 90) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const qrGone = !(await page.$('canvas[aria-label*="Scan"]'));

        if (qrGone) {
          spinner.succeed(chalk.green("✓ Autenticado"));
          break;
        }

        attempts++;
        if (attempts % 15 === 0) {
          console.log(chalk.gray(`  ${attempts}s...`));
        }
      }

      if (attempts >= 90) {
        throw new Error("Timeout esperando escaneo del QR");
      }

      await new Promise((resolve) => setTimeout(resolve, 8000)); // Esperar que cargue todo
    } else {
      spinner.succeed(chalk.green("✓ Ya autenticado"));
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    spinner.start("Preparando envío de mensaje...");

    // Método alternativo: Usar la API de URL de WhatsApp
    // WhatsApp Web tiene una URL especial que abre directamente un chat con texto
    const encodedMessage = encodeURIComponent(message);

    // Primero, buscar el número o usar el nombre del contacto
    // Para simplificar, vamos a usar el método de búsqueda en la interfaz

    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    spinner.text = `Buscando "${contactName}"...`;

    // Intentar diferentes formas de encontrar el cuadro de búsqueda
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Método 1: Intentar hacer click en el área de búsqueda
    try {
      // Buscar por el título "Buscar o comenzar un chat nuevo"
      const searchButton = await page.$('[title*="Buscar"], [aria-label*="Buscar"], [data-testid*="search"]');

      if (searchButton) {
        await searchButton.click();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Escribir en cualquier campo editable que aparezca
      const editableFields = await page.$$('[contenteditable="true"]');

      if (editableFields.length > 0) {
        // Usar el primer campo editable (generalmente es la búsqueda)
        await editableFields[0].click();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await page.keyboard.type(contactName, { delay: 100 });
        await new Promise((resolve) => setTimeout(resolve, 3000));

        spinner.text = "Abriendo chat...";

        // Buscar y hacer click en el resultado
        const chatResult = await page.$('[data-testid^="cell-frame"]');

        if (!chatResult) {
          throw new Error(`No se encontró el contacto "${contactName}"`);
        }

        await chatResult.click();
        await new Promise((resolve) => setTimeout(resolve, 3000));

        spinner.text = "Escribiendo mensaje...";

        // Buscar el cuadro de mensaje
        const messageFields = await page.$$('[contenteditable="true"]');

        if (messageFields.length > 0) {
          // El último campo editable suele ser el cuadro de mensaje
          const messageBox = messageFields[messageFields.length - 1];
          await messageBox.click();
          await new Promise((resolve) => setTimeout(resolve, 500));

          await page.keyboard.type(message, { delay: 50 });
          await new Promise((resolve) => setTimeout(resolve, 1000));

          spinner.text = "Enviando...";
          await page.keyboard.press("Enter");
          await new Promise((resolve) => setTimeout(resolve, 3000));

          spinner.succeed(chalk.green("✓ MENSAJE ENVIADO"));

          console.log(chalk.bold.green("\n✅ ÉXITO\n"));
          console.log(chalk.cyan("  Para:"), contactName);
          console.log(chalk.cyan("  Mensaje:"), `"${message}"`);
          console.log(chalk.cyan("  Hora:"), new Date().toLocaleTimeString("es-ES"));

          console.log(chalk.yellow("\n⏳ Verifica en el navegador...\n"));
          await new Promise((resolve) => setTimeout(resolve, 5000));
        } else {
          throw new Error("No se encontró el cuadro de mensaje");
        }
      } else {
        throw new Error("No se encontraron campos editables");
      }
    } catch (error: any) {
      throw new Error(`Error en la automatización: ${error.message}`);
    }
  } catch (error: any) {
    spinner.fail(chalk.red("✖ Error"));
    console.error(chalk.gray("\nDetalles:"), error.message);
    console.log(chalk.yellow("\n💡 Sugerencias:"));
    console.log(chalk.gray("  - Verifica que WhatsApp Web esté completamente cargado"));
    console.log(chalk.gray("  - Usa el nombre exacto del contacto"));
    console.log(chalk.gray("  - Asegúrate de tener una conversación previa con ese contacto\n"));
  } finally {
    await closeBrowser(browser);
  }
}

whatsappSendViaURL();
