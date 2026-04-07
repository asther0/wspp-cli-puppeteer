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
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extraer información de chats
    const chatsInfo = await page.evaluate(() => {
      const chatElements = document.querySelectorAll('div[role="listitem"]');
      const chats: Array<{ name: string; lastMessage: string }> = [];

      chatElements.forEach((chat, index) => {
        if (index >= 5) return; // Solo los primeros 5

        const nameElement = chat.querySelector('span[dir="auto"][title]');
        const messageElement = chat.querySelector('span.selectable-text');

        chats.push({
          name: nameElement?.getAttribute("title") || "Sin nombre",
          lastMessage:
            messageElement?.textContent?.substring(0, 50) || "Sin mensajes",
        });
      });

      return chats;
    });

    spinner.succeed(chalk.green("✓ Chats cargados"));

    // Mostrar resultados
    console.log(chalk.bold.yellow("\n💬 TUS ÚLTIMOS 5 CHATS:\n"));

    chatsInfo.forEach((chat, index) => {
      console.log(chalk.cyan(`${index + 1}. ${chat.name}`));
      console.log(chalk.gray(`   ${chat.lastMessage}...\n`));
    });

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
