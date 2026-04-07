import chalk from "chalk";
import ora from "ora";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function interactDemo() {
  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = "Navegando a formulario de ejemplo...";

    await page.goto("https://www.google.com/search?q=puppeteer", {
      waitUntil: "networkidle2",
    });

    spinner.text = "Interactuando con elementos...";

    // Tomar título de la página
    const title = await page.title();

    // Obtener información del navegador
    const userAgent = await page.evaluate(() => navigator.userAgent);

    // Simular scroll
    await page.evaluate(() => {
      window.scrollBy(0, 500);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Tomar dimensiones de la ventana
    const dimensions = await page.evaluate(() => {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        deviceScaleFactor: window.devicePixelRatio,
      };
    });

    spinner.succeed(chalk.green("✓ Interacciones completadas"));

    console.log("\n" + chalk.bold("🤖 Información de la sesión:\n"));
    console.log(chalk.cyan("Título:"), title);
    console.log(chalk.cyan("User Agent:"), userAgent);
    console.log(
      chalk.cyan("Dimensiones:"),
      `${dimensions.width}x${dimensions.height}`
    );
    console.log(
      chalk.cyan("Device Scale Factor:"),
      dimensions.deviceScaleFactor
    );

    console.log(
      chalk.yellow("\n⏳ Navegador permanecerá abierto por 5 segundos...")
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } catch (error) {
    spinner.fail(chalk.red("Error durante la interacción"));
    console.error(error);
  } finally {
    await closeBrowser(browser);
  }
}

interactDemo();
