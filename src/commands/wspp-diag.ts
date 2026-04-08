import chalk from "chalk";
import { launchBrowser, closeBrowser } from "../utils/browser";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function diagnose() {
  console.log(chalk.bold.yellow("\n🔬 DIAGNÓSTICO WSPP - Screenshots cada 15s\n"));

  const browser = await launchBrowser(true);

  try {
    const pages = await browser.pages();
    const page = pages[0];

    console.log(chalk.gray("Abriendo WhatsApp Web..."));
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

    for (let i = 0; i < 8; i++) {
      const seconds = i * 15;
      await delay(i === 0 ? 5000 : 15000);

      const filename = `diag-${seconds}s.png`;
      await page.screenshot({ path: filename });

      const state = await page.evaluate(() => {
        return {
          hasSide: !!document.querySelector('#side'),
          hasQR: !!document.querySelector('canvas'),
          hasMain: !!document.querySelector('main'),
          hasFooter: !!document.querySelector('footer'),
          inputs: document.querySelectorAll('input').length,
          textareas: document.querySelectorAll('textarea').length,
          editables: document.querySelectorAll('[contenteditable="true"]').length,
          textboxes: document.querySelectorAll('[role="textbox"]').length,
          listItems: document.querySelectorAll('[role="listitem"]').length,
          spanTitles: document.querySelectorAll('span[title]').length,
          title: document.title,
        };
      });

      console.log(chalk.cyan(`\n[${seconds}s] ${filename}`));
      console.log(chalk.gray(`  title="${state.title}" side=${state.hasSide} qr=${state.hasQR} main=${state.hasMain} footer=${state.hasFooter}`));
      console.log(chalk.gray(`  inputs=${state.inputs} textareas=${state.textareas} editables=${state.editables} textboxes=${state.textboxes}`));
      console.log(chalk.gray(`  listItems=${state.listItems} spanTitles=${state.spanTitles}`));
    }

    console.log(chalk.green("\n✓ Diagnóstico completo. Revisa los screenshots diag-*.png\n"));
  } catch (error: any) {
    console.error(chalk.red("Error:"), error.message);
  } finally {
    await closeBrowser(browser);
  }
}

diagnose();
