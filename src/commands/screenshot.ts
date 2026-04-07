import chalk from "chalk";
import ora from "ora";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function screenshotDemo() {
  const url = process.argv[2] || "https://example.com";
  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = `Navegando a ${url}...`;

    await page.goto(url, { waitUntil: "networkidle2" });

    spinner.text = "Tomando screenshot...";

    const timestamp = Date.now();
    const filename = `screenshot-${timestamp}.png`;

    await page.screenshot({
      path: filename,
      fullPage: true,
    });

    spinner.succeed(chalk.green(`✓ Screenshot guardado: ${filename}`));

    console.log(chalk.cyan(`\n📸 Captura de pantalla de: ${url}`));
    console.log(chalk.gray(`   Archivo: ${filename}`));
    console.log(
      chalk.gray(`   Ubicación: ${process.cwd()}\\${filename}\n`)
    );
  } catch (error) {
    spinner.fail(chalk.red("Error al tomar screenshot"));
    console.error(error);
  } finally {
    await closeBrowser(browser);
  }
}

screenshotDemo();
