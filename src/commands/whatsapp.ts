import chalk from "chalk";
import ora from "ora";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function whatsappDemo() {
  console.log(chalk.bold.cyan("\n📱 WHATSAPP WEB AUTOMATION (wspp-cli + Puppeteer)\n"));

  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = "Navegando a WhatsApp Web...";

    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    spinner.text = "Esperando escaneo de QR...";

    // Esperar a que aparezca el QR o que ya esté logueado
    try {
      await page.waitForSelector('canvas[aria-label="Scan this QR code to link a device!"]', {
        timeout: 5000,
      });

      spinner.info(chalk.yellow("📸 ESCANEA EL CÓDIGO QR CON TU TELÉFONO"));
      console.log(chalk.gray("   Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo\n"));

      // Esperar a que se complete el login (desaparece el QR)
      await page.waitForSelector('div[data-testid="conversation-panel-wrapper"]', {
        timeout: 60000,
      });

      spinner.succeed(chalk.green("✓ Login exitoso"));
    } catch {
      // Ya estaba logueado
      spinner.succeed(chalk.green("✓ Ya estabas autenticado"));
    }

    // Esperar que cargue la interfaz
    spinner.start("Cargando chats...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Extraer información de chats
    const chatsInfo = await page.evaluate(() => {
      const chatElements = document.querySelectorAll('[data-testid^="cell-frame-container"]');
      const chats: Array<{ name: string; lastMessage: string }> = [];

      chatElements.forEach((chat, index) => {
        if (index >= 5) return; // Solo los primeros 5

        // Buscar el nombre del chat
        const nameElement = chat.querySelector('[data-testid^="cell-frame-title"]');

        // Buscar el último mensaje
        const messageElement = chat.querySelector('[data-testid^="last-msg"]');

        if (nameElement || messageElement) {
          chats.push({
            name: nameElement?.textContent?.trim() || "Chat #" + (index + 1),
            lastMessage:
              messageElement?.textContent?.trim().substring(0, 60) || "...",
          });
        }
      });

      return chats;
    });

    spinner.succeed(chalk.green(`✓ Chats cargados (${chatsInfo.length} encontrados)`));

    // Mostrar resultados
    if (chatsInfo.length > 0) {
      console.log(chalk.bold.yellow("\n💬 TUS ÚLTIMOS CHATS:\n"));

      chatsInfo.forEach((chat, index) => {
        console.log(chalk.cyan(`${index + 1}. ${chat.name}`));
        console.log(chalk.gray(`   ${chat.lastMessage}...\n`));
      });
    } else {
      console.log(chalk.yellow("\n⚠️  No se pudieron extraer los chats (interfaz de WhatsApp puede haber cambiado)"));
      console.log(chalk.gray("   Pero la sesión está activa y funcional\n"));
    }

    // Obtener información de la sesión
    const userInfo = await page.evaluate(() => {
      const profileElement = document.querySelector('img[alt="Foto de perfil"]');
      return {
        hasProfile: !!profileElement,
        timestamp: new Date().toLocaleString(),
      };
    });

    console.log(chalk.bold.green("✅ SESIÓN ACTIVA\n"));
    console.log(chalk.cyan("  Perfil cargado:"), userInfo.hasProfile ? "✓" : "✗");
    console.log(chalk.cyan("  Timestamp:"), userInfo.timestamp);

    console.log(
      chalk.bold.yellow(
        "\n⏳ Navegador permanecerá abierto por 30 segundos para que explores..."
      )
    );
    console.log(chalk.gray("   Puedes enviar mensajes manualmente desde el navegador\n"));

    await new Promise((resolve) => setTimeout(resolve, 30000));
  } catch (error) {
    spinner.fail(chalk.red("Error durante la automatización de WhatsApp"));
    console.error(error);
  } finally {
    await closeBrowser(browser);
  }
}

whatsappDemo();
