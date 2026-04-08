import chalk from "chalk";
import ora from "ora";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function whatsappSendMessageV2() {
  const contactName = process.argv[2];
  const message = process.argv.slice(3).join(" ");

  if (!contactName || !message) {
    console.log(chalk.red("\n❌ Uso incorrecto"));
    console.log(chalk.yellow('\n📝 Uso: bun run whatsapp:send2 "Nombre del Contacto" "Mensaje"\n'));
    console.log(chalk.gray('   Ejemplo: bun run whatsapp:send2 "Juan Pérez" "Hola desde Puppeteer!"\n'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan("\n📤 ENVIAR MENSAJE DE WHATSAPP V2\n"));
  console.log(chalk.cyan("  Destinatario:"), contactName);
  console.log(chalk.cyan("  Mensaje:"), message);
  console.log();

  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = "Navegando a WhatsApp Web...";

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    spinner.text = "Esperando a que WhatsApp Web cargue...";
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Verificar si hay QR
    const hasQR = await page.$('canvas[aria-label*="Scan"]');

    if (hasQR) {
      spinner.warn(chalk.yellow("📸 CÓDIGO QR VISIBLE"));
      console.log(chalk.bold.cyan("\n⏳ ESPERANDO... (hasta 90 segundos)\n"));
      console.log(chalk.white("  Por favor escanea el QR con tu teléfono"));
      console.log(chalk.gray("  El script continuará automáticamente después del escaneo\n"));

      // Esperar a que desaparezca el QR (señal de que se logueó)
      let loggedIn = false;
      const maxAttempts = 90; // 90 intentos = 90 segundos

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const qrStillThere = await page.$('canvas[aria-label*="Scan"]');

        if (!qrStillThere) {
          loggedIn = true;
          break;
        }

        // Mostrar progreso cada 10 segundos
        if (i > 0 && i % 10 === 0) {
          console.log(chalk.gray(`  ... ${i} segundos transcurridos`));
        }
      }

      if (loggedIn) {
        spinner.succeed(chalk.green("✓ QR escaneado exitosamente"));
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Esperar que cargue todo
      } else {
        throw new Error("Tiempo de espera agotado para escanear QR");
      }
    } else {
      spinner.succeed(chalk.green("✓ Ya estás autenticado"));
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    spinner.start(`Buscando contacto: "${contactName}"...`);

    // Usar URL directa para abrir chat
    const encodedName = encodeURIComponent(contactName);
    const chatUrl = `https://web.whatsapp.com/send?phone=&text=&app_absent=0`;

    // Buscar usando el cuadro de búsqueda
    await page.click('div[contenteditable="true"][data-tab="3"]');
    await new Promise((resolve) => setTimeout(resolve, 500));

    await page.keyboard.type(contactName, { delay: 100 });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    spinner.text = "Abriendo chat...";

    // Click en el primer resultado
    const firstChat = await page.$('[data-testid^="cell-frame-container"]');
    if (!firstChat) {
      throw new Error(`No se encontró el contacto "${contactName}". Verifica que el nombre sea exacto.`);
    }

    await firstChat.click();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    spinner.text = "Escribiendo mensaje...";

    // Buscar el cuadro de texto del mensaje
    const messageBox = await page.$('div[contenteditable="true"][data-tab="10"]');
    if (!messageBox) {
      throw new Error("No se pudo encontrar el cuadro de mensaje");
    }

    await messageBox.click();
    await page.keyboard.type(message, { delay: 50 });
    await new Promise((resolve) => setTimeout(resolve, 800));

    spinner.text = "Enviando mensaje...";
    await page.keyboard.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    spinner.succeed(chalk.green("✓ MENSAJE ENVIADO EXITOSAMENTE"));

    console.log(chalk.bold.green("\n✅ ÉXITO\n"));
    console.log(chalk.cyan("  A:"), contactName);
    console.log(chalk.cyan("  Mensaje:"), `"${message}"`);
    console.log(chalk.cyan("  Hora:"), new Date().toLocaleTimeString("es-ES"));

    console.log(chalk.yellow("\n⏳ Navegador permanecerá abierto 5 segundos para verificar...\n"));
    await new Promise((resolve) => setTimeout(resolve, 5000));

  } catch (error: any) {
    spinner.fail(chalk.red("✖ Error al enviar mensaje"));
    console.error(chalk.gray("\nDetalles:"), error.message);
    console.log(chalk.yellow("\n💡 Tips:"));
    console.log(chalk.gray("  - Verifica que el nombre del contacto sea exacto"));
    console.log(chalk.gray("  - Asegúrate de tener conversaciones recientes con ese contacto"));
    console.log(chalk.gray("  - Intenta buscar el contacto manualmente primero\n"));
  } finally {
    await closeBrowser(browser);
  }
}

whatsappSendMessageV2();
