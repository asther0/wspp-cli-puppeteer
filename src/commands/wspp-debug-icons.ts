import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { extractContacts } from "../utils/contacts";
import { searchAndSelectContact } from "../utils/sender";
import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const side = document.querySelector("#side");
    if (!side) return false;
    return !!(side.querySelector('input, [role="textbox"], [contenteditable="true"], [role="listitem"], span[title]'));
  });
}

async function debugIcons() {
  console.log(chalk.cyan("\n  🔍 Debug: descubriendo selectores de WhatsApp Web\n"));

  const spinner = ora("Iniciando...").start();
  const browser = await launchBrowser(true);

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await delay(5000);

    let loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      spinner.text = "Cargando sesión...";
      for (let i = 0; i < 15; i++) {
        await delay(1000);
        if (await isLoggedIn(page)) { loggedIn = true; break; }
      }
    }

    if (!loggedIn) {
      spinner.fail("No hay sesión. Ejecuta: bun run wspp:login");
      return;
    }
    spinner.succeed(chalk.green("Sesión activa"));

    // Open first chat
    spinner.start("Abriendo primer chat...");
    const contacts = await extractContacts(page);
    if (contacts.length === 0) {
      spinner.fail("No hay contactos");
      return;
    }
    await searchAndSelectContact(page, contacts[0].name);
    spinner.succeed(chalk.green(`Chat abierto: ${contacts[0].name}`));

    // Step 1: List all icons in footer BEFORE clicking attach
    console.log(chalk.cyan("\n  ─── Iconos en footer (antes de adjuntar) ───"));
    const footerIcons = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return [];
      const icons = footer.querySelectorAll("span[data-icon]");
      return Array.from(icons).map((el) => el.getAttribute("data-icon") || "");
    });
    footerIcons.forEach((icon) => console.log(chalk.white(`    span[data-icon="${icon}"]`)));

    // Step 2: List all buttons in footer
    console.log(chalk.cyan("\n  ─── Botones en footer ───"));
    const footerButtons = await page.evaluate(() => {
      const footer = document.querySelector("footer");
      if (!footer) return [];
      const buttons = footer.querySelectorAll("button");
      return Array.from(buttons).map((btn) => ({
        ariaLabel: btn.getAttribute("aria-label") || "",
        title: btn.getAttribute("title") || "",
        dataIcon: btn.querySelector("span[data-icon]")?.getAttribute("data-icon") || "",
      }));
    });
    footerButtons.forEach((btn) => {
      const parts = [
        btn.dataIcon && `data-icon="${btn.dataIcon}"`,
        btn.ariaLabel && `aria-label="${btn.ariaLabel}"`,
        btn.title && `title="${btn.title}"`,
      ].filter(Boolean);
      console.log(chalk.white(`    button: ${parts.join(", ")}`));
    });

    // Step 3: Try clicking attach button candidates
    console.log(chalk.cyan("\n  ─── Probando botón adjuntar ───"));
    const attachCandidates = ["plus-rounded", "plus", "attach-menu-plus", "clip", "attach", "ptt"];

    let attachClicked = false;
    for (const icon of attachCandidates) {
      const found = await page.evaluate((iconName: string) => {
        const el = document.querySelector(`span[data-icon="${iconName}"]`);
        return !!el;
      }, icon);
      const status = found ? chalk.green("✓ EXISTE") : chalk.gray("✗ no");
      console.log(`    ${status}  span[data-icon="${icon}"]`);

      if (found && !attachClicked) {
        await page.evaluate((iconName: string) => {
          const el = document.querySelector(`span[data-icon="${iconName}"]`);
          const btn = el?.closest("button") || el?.parentElement;
          if (btn) (btn as HTMLElement).click();
        }, icon);
        attachClicked = true;
        console.log(chalk.green(`    → Clickeado: ${icon}`));
        await delay(1500);
      }
    }

    if (!attachClicked) {
      // Try aria-label fallback
      const labelClick = await page.evaluate(() => {
        const btns = document.querySelectorAll("footer button, [data-tab] button");
        for (const btn of btns) {
          const label = btn.getAttribute("aria-label") || btn.getAttribute("title") || "";
          if (/adjunt|attach|plus|\+/i.test(label)) {
            (btn as HTMLElement).click();
            return label;
          }
        }
        return null;
      });
      if (labelClick) {
        console.log(chalk.green(`    → Clickeado por aria-label: "${labelClick}"`));
        await delay(1500);
      }
    }

    // Step 4: List all icons AFTER clicking attach (menu should be open)
    console.log(chalk.cyan("\n  ─── Iconos visibles (menú abierto) ───"));
    const allIcons = await page.evaluate(() => {
      const icons = document.querySelectorAll("span[data-icon]");
      return Array.from(icons).map((el) => el.getAttribute("data-icon") || "");
    });
    const newIcons = allIcons.filter((i) => !footerIcons.includes(i) && i);
    if (newIcons.length > 0) {
      console.log(chalk.yellow("    Nuevos (del menú de adjuntar):"));
      newIcons.forEach((icon) => console.log(chalk.bold.white(`    ★ span[data-icon="${icon}"]`)));
    } else {
      console.log(chalk.yellow("    No aparecieron iconos nuevos. El menú puede no haberse abierto."));
      console.log(chalk.gray("    Todos los iconos en la página:"));
      allIcons.forEach((icon) => console.log(chalk.gray(`      ${icon}`)));
    }

    // Step 5: List file inputs
    console.log(chalk.cyan("\n  ─── Inputs de archivo ───"));
    const fileInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="file"]');
      return Array.from(inputs).map((input) => ({
        accept: input.getAttribute("accept") || "(sin accept)",
        id: input.getAttribute("id") || "",
        multiple: input.hasAttribute("multiple"),
      }));
    });
    if (fileInputs.length > 0) {
      fileInputs.forEach((fi) => {
        console.log(chalk.white(`    input[type="file"] accept="${fi.accept}" ${fi.multiple ? "multiple" : ""}`));
      });
    } else {
      console.log(chalk.gray("    Ninguno encontrado (normal si el menú no se abrió)"));
    }

    // Step 6: List menu items
    console.log(chalk.cyan("\n  ─── Items del menú ───"));
    const menuItems = await page.evaluate(() => {
      const items = document.querySelectorAll('[role="button"], [role="menuitem"], li[role]');
      return Array.from(items).slice(-20).map((item) => ({
        text: (item as HTMLElement).innerText?.trim().substring(0, 50) || "",
        ariaLabel: item.getAttribute("aria-label") || "",
        dataIcon: item.querySelector("span[data-icon]")?.getAttribute("data-icon") || "",
      }));
    });
    menuItems
      .filter((m) => m.text || m.dataIcon)
      .forEach((m) => {
        const parts = [
          m.dataIcon && `icon="${m.dataIcon}"`,
          m.text && `"${m.text}"`,
          m.ariaLabel && `aria="${m.ariaLabel}"`,
        ].filter(Boolean);
        console.log(chalk.white(`    ${parts.join(" · ")}`));
      });

    console.log(chalk.cyan("\n  ─── Fin del debug ───\n"));

    await page.screenshot({ path: "wspp-debug-attach.png" });
    console.log(chalk.gray("  Screenshot: wspp-debug-attach.png\n"));

    await delay(2000);
  } finally {
    await closeBrowser(browser);
  }
}

debugIcons();
