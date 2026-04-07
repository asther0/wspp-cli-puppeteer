import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser } from "../utils/browser";

async function wsppDebug() {
  const contactName = process.argv[2] || "Lywinecito";
  const message = process.argv.slice(3).join(" ") || "Hola desde wspp cli";

  console.log(chalk.bold.green("\n🔍 WSPP-CLI DEBUG MODE\n"));
  console.log(chalk.cyan("  Para:"), contactName);
  console.log(chalk.cyan("  Mensaje:"), message);
  console.log();

  const spinner = ora("Iniciando...").start();
  const browser = await launchBrowser();

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // QR
    let qrDetected = false;
    try {
      await page.waitForSelector('canvas[aria-label*="Scan"]', { timeout: 3000 });
      qrDetected = true;
    } catch {}

    if (qrDetected) {
      spinner.warn(chalk.yellow("📸 Escanea el QR (90s)"));

      for (let i = 0; i < 90; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          await page.waitForSelector('canvas[aria-label*="Scan"]', { timeout: 100 });
        } catch {
          spinner.succeed(chalk.green("✓ QR escaneado"));
          break;
        }
        if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
      }

      console.log(chalk.yellow("\n⏳ Esperando carga completa de WhatsApp (20s)...\n"));
      await new Promise((resolve) => setTimeout(resolve, 20000));
    } else {
      spinner.succeed(chalk.green("✓ Ya autenticado"));
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }

    // DEBUG: Screenshot del estado actual
    await page.screenshot({ path: "debug-after-auth.png" });
    console.log(chalk.gray("📸 Screenshot guardado: debug-after-auth.png"));

    // DEBUG: Analizar la página
    const pageInfo = await page.evaluate(() => {
      const editables = document.querySelectorAll('[contenteditable="true"]');
      const allInputs = document.querySelectorAll('input, textarea');
      const roleListItems = document.querySelectorAll('[role="listitem"]');
      const sidePanel = document.querySelector('#side');
      const searchBox = document.querySelector('#side [contenteditable="true"]');

      // Buscar todos los posibles campos de entrada
      const editableInfo = Array.from(editables).map((el, i) => ({
        index: i,
        tag: el.tagName,
        dataTab: el.getAttribute('data-tab'),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        title: el.getAttribute('title'),
        parent: el.parentElement?.className?.substring(0, 60) || 'unknown',
        text: el.textContent?.substring(0, 30) || '',
      }));

      return {
        url: window.location.href,
        title: document.title,
        editableCount: editables.length,
        inputCount: allInputs.length,
        listItemCount: roleListItems.length,
        hasSidePanel: !!sidePanel,
        hasSearchBox: !!searchBox,
        editableDetails: editableInfo,
      };
    });

    console.log(chalk.bold.yellow("\n📊 DEBUG INFO:\n"));
    console.log(chalk.cyan("  URL:"), pageInfo.url);
    console.log(chalk.cyan("  Título:"), pageInfo.title);
    console.log(chalk.cyan("  #side panel:"), pageInfo.hasSidePanel ? "✓" : "✗");
    console.log(chalk.cyan("  Search box (#side):"), pageInfo.hasSearchBox ? "✓" : "✗");
    console.log(chalk.cyan("  Campos editables:"), pageInfo.editableCount);
    console.log(chalk.cyan("  Inputs/Textareas:"), pageInfo.inputCount);
    console.log(chalk.cyan("  List items:"), pageInfo.listItemCount);

    if (pageInfo.editableDetails.length > 0) {
      console.log(chalk.bold.yellow("\n📝 CAMPOS EDITABLES ENCONTRADOS:\n"));
      pageInfo.editableDetails.forEach((ed) => {
        console.log(chalk.cyan(`  [${ed.index}]`), `tag=${ed.tag}`, `data-tab="${ed.dataTab}"`, `role="${ed.role}"`);
        console.log(chalk.gray(`      aria-label="${ed.ariaLabel}" title="${ed.title}"`));
        console.log(chalk.gray(`      parent: ${ed.parent}`));
        console.log(chalk.gray(`      text: "${ed.text}"`));
        console.log();
      });

      // INTENTAR ENVIAR EL MENSAJE
      console.log(chalk.bold.green("\n🚀 INTENTANDO ENVIAR MENSAJE...\n"));

      spinner.start(`Buscando "${contactName}"...`);

      // Click en el primer editable (búsqueda)
      const searchEditable = pageInfo.editableDetails[0];
      const searchSelector = searchEditable.dataTab
        ? `[contenteditable="true"][data-tab="${searchEditable.dataTab}"]`
        : '#side [contenteditable="true"]';

      console.log(chalk.gray(`  Usando selector: ${searchSelector}`));

      await page.click(searchSelector);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Limpiar
      await page.keyboard.down("Control");
      await page.keyboard.press("A");
      await page.keyboard.up("Control");
      await page.keyboard.press("Backspace");
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Escribir contacto
      await page.keyboard.type(contactName, { delay: 150 });
      await new Promise((resolve) => setTimeout(resolve, 4000));

      await page.screenshot({ path: "debug-after-search.png" });
      console.log(chalk.gray("  📸 debug-after-search.png guardado"));

      // Seleccionar primer resultado con Enter
      spinner.text = "Seleccionando contacto...";
      await page.keyboard.press("Enter");
      await new Promise((resolve) => setTimeout(resolve, 4000));

      await page.screenshot({ path: "debug-after-select.png" });
      console.log(chalk.gray("  📸 debug-after-select.png guardado"));

      // Buscar de nuevo campos editables (debería haber cuadro de mensaje)
      const fieldsNow = await page.$$('[contenteditable="true"]');
      console.log(chalk.cyan(`\n  Campos editables ahora: ${fieldsNow.length}`));

      if (fieldsNow.length >= 2) {
        spinner.text = "Escribiendo mensaje...";

        // Último campo = cuadro de mensaje
        const msgBox = fieldsNow[fieldsNow.length - 1];
        await msgBox.click();
        await new Promise((resolve) => setTimeout(resolve, 500));

        await page.keyboard.type(message, { delay: 80 });
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await page.screenshot({ path: "debug-before-send.png" });
        console.log(chalk.gray("  📸 debug-before-send.png guardado"));

        spinner.text = "Enviando...";
        await page.keyboard.press("Enter");
        await new Promise((resolve) => setTimeout(resolve, 3000));

        await page.screenshot({ path: "debug-after-send.png" });
        console.log(chalk.gray("  📸 debug-after-send.png guardado"));

        spinner.succeed(chalk.bold.green("✓ MENSAJE ENVIADO"));

        console.log(chalk.green("\n✅ ÉXITO\n"));
        console.log(chalk.cyan("  📤 Para:"), contactName);
        console.log(chalk.cyan("  💬 Mensaje:"), `"${message}"`);
        console.log(chalk.cyan("  🕐 Hora:"), new Date().toLocaleTimeString("es-ES"));
      } else {
        spinner.fail("No se detectó cuadro de mensaje después de seleccionar contacto");
      }
    } else {
      console.log(chalk.red("\n❌ No se encontraron campos editables"));
      console.log(chalk.yellow("Revisa el screenshot debug-after-auth.png para ver el estado actual\n"));
    }

    console.log(chalk.yellow("\n⏳ Cerrando en 5s...\n"));
    await new Promise((resolve) => setTimeout(resolve, 5000));

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(error.message);
  } finally {
    await closeBrowser(browser);
  }
}

wsppDebug();
