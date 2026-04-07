import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { launchBrowser, createPage, closeBrowser } from "../utils/browser";

async function fullDemo() {
  console.log(chalk.bold.cyan("\n🚀 PUPPETEER DEMO - Automatización Web\n"));
  console.log(chalk.gray("Este demo ejecutará múltiples tareas automatizadas\n"));

  const spinner = ora("Iniciando navegador Chrome...").start();
  const browser = await launchBrowser();

  try {
    const page = await createPage(browser);

    // ==================== DEMO 1: Navegación básica ====================
    spinner.text = "Demo 1/4: Navegando a GitHub...";
    await page.goto("https://github.com", { waitUntil: "networkidle2" });

    const githubTitle = await page.title();
    spinner.succeed(chalk.green(`✓ Demo 1: Navegación exitosa - ${githubTitle}`));

    // ==================== DEMO 2: Extracción de datos ====================
    spinner.start("Demo 2/4: Extrayendo datos de GitHub Trending...");
    await page.goto("https://github.com/trending", { waitUntil: "networkidle2" });

    const trendingRepos = await page.evaluate(() => {
      const articles = document.querySelectorAll("article.Box-row");
      const repos: Array<{ name: string; stars: string }> = [];

      articles.forEach((article, index) => {
        if (index >= 3) return; // Top 3

        const nameElement = article.querySelector("h2 a");
        const starsElement = article.querySelector('span.d-inline-block.float-sm-right');

        repos.push({
          name: nameElement?.textContent?.trim().replace(/\s+/g, " ") || "N/A",
          stars: starsElement?.textContent?.trim() || "0",
        });
      });

      return repos;
    });

    spinner.succeed(chalk.green("✓ Demo 2: Datos extraídos correctamente"));

    // ==================== DEMO 3: Screenshot ====================
    spinner.start("Demo 3/4: Tomando screenshot...");
    await page.screenshot({
      path: "demo-screenshot.png",
      fullPage: false,
    });

    spinner.succeed(chalk.green("✓ Demo 3: Screenshot guardado como demo-screenshot.png"));

    // ==================== DEMO 4: Información del navegador ====================
    spinner.start("Demo 4/4: Recopilando información del navegador...");

    const browserInfo = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      cookiesEnabled: navigator.cookieEnabled,
    }));

    spinner.succeed(chalk.green("✓ Demo 4: Información recopilada"));

    // ==================== RESULTADOS ====================
    console.log(chalk.bold.yellow("\n📊 RESULTADOS DEL DEMO:\n"));

    // Tabla de repos trending
    const table = new Table({
      head: [chalk.cyan("Top 3 Trending Repos"), chalk.cyan("Stars Today")],
      colWidths: [40, 20],
    });

    trendingRepos.forEach((repo) => {
      table.push([repo.name, repo.stars]);
    });

    console.log(table.toString());

    // Información del navegador
    console.log(chalk.bold("\n🌐 Información del Navegador:\n"));
    console.log(chalk.cyan("  Platform:"), browserInfo.platform);
    console.log(chalk.cyan("  Language:"), browserInfo.language);
    console.log(chalk.cyan("  Viewport:"), browserInfo.viewport);
    console.log(chalk.cyan("  Cookies:"), browserInfo.cookiesEnabled ? "✓ Habilitadas" : "✗ Deshabilitadas");

    console.log(chalk.bold.green("\n✅ DEMO COMPLETADO EXITOSAMENTE\n"));

  } catch (error) {
    spinner.fail(chalk.red("Error durante el demo"));
    console.error(error);
  } finally {
    await closeBrowser(browser);
  }
}

fullDemo();
