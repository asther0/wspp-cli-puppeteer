import chalk from "chalk";
import ora from "ora";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function searchDemo() {
  const searchQuery = process.argv[2] || "puppeteer automation";
  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = `Buscando en Google: "${searchQuery}"...`;

    await page.goto("https://www.google.com", { waitUntil: "networkidle2" });

    // Aceptar cookies si aparece el modal
    try {
      await page.waitForSelector('button[id*="accept"], button[id*="L2AGLb"]', {
        timeout: 3000,
      });
      await page.click('button[id*="L2AGLb"]');
    } catch {
      // No hay modal de cookies
    }

    // Buscar
    await page.type('textarea[name="q"]', searchQuery);
    await page.keyboard.press("Enter");

    await page.waitForNavigation({ waitUntil: "networkidle2" });

    spinner.text = "Extrayendo resultados...";

    const results = await page.evaluate(() => {
      const items = document.querySelectorAll("div.g");
      const extracted: Array<{ title: string; url: string }> = [];

      items.forEach((item, index) => {
        if (index >= 5) return;

        const titleElement = item.querySelector("h3");
        const linkElement = item.querySelector("a");

        if (titleElement && linkElement) {
          extracted.push({
            title: titleElement.textContent || "Sin título",
            url: linkElement.href,
          });
        }
      });

      return extracted;
    });

    spinner.succeed(chalk.green("✓ Búsqueda completada"));

    console.log(
      "\n" + chalk.bold(`🔍 Resultados para: "${searchQuery}"\n`)
    );

    results.forEach((result, index) => {
      console.log(chalk.cyan(`${index + 1}. ${result.title}`));
      console.log(chalk.gray(`   ${result.url}\n`));
    });
  } catch (error) {
    spinner.fail(chalk.red("Error durante la búsqueda"));
    console.error(error);
  } finally {
    await closeBrowser(browser);
  }
}

searchDemo();
