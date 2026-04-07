import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function scrapeDemo() {
  const spinner = ora("Iniciando navegador...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);
    spinner.text = "Navegando a GitHub Trending...";

    await page.goto("https://github.com/trending", {
      waitUntil: "networkidle2",
    });

    spinner.text = "Extrayendo información de repositorios...";

    const repos = await page.evaluate(() => {
      const articles = document.querySelectorAll("article.Box-row");
      const results: Array<{ name: string; description: string; stars: string }> = [];

      articles.forEach((article, index) => {
        if (index >= 5) return; // Solo los primeros 5

        const nameElement = article.querySelector("h2 a");
        const descElement = article.querySelector("p");
        const starsElement = article.querySelector(
          'span.d-inline-block.float-sm-right'
        );

        results.push({
          name: nameElement?.textContent?.trim() || "N/A",
          description: descElement?.textContent?.trim() || "Sin descripción",
          stars: starsElement?.textContent?.trim() || "0",
        });
      });

      return results;
    });

    spinner.succeed(chalk.green("✓ Scraping completado"));

    const table = new Table({
      head: [
        chalk.cyan("Repositorio"),
        chalk.cyan("Descripción"),
        chalk.cyan("Stars"),
      ],
      colWidths: [30, 50, 15],
      wordWrap: true,
    });

    repos.forEach((repo) => {
      table.push([repo.name, repo.description, repo.stars]);
    });

    console.log("\n" + chalk.bold("🔥 Trending Repositories en GitHub:\n"));
    console.log(table.toString());
  } catch (error) {
    spinner.fail(chalk.red("Error durante el scraping"));
    console.error(error);
  } finally {
    await closeBrowser(browser);
  }
}

scrapeDemo();
