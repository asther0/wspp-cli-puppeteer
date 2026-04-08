import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { extractContacts } from "../utils/contacts";
import { sendMessage, sendMessageByPhone } from "../utils/sender";
import { sendBulkMessages, sendCsvMessages } from "../utils/bulk-sender";
import { parseCsv } from "../utils/csv-parser";
import { showBanner } from "../ui/banner";
import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const side = document.querySelector('#side');
    if (!side) return false;
    return !!(side.querySelector('input, [role="textbox"], [contenteditable="true"], [role="listitem"], span[title]'));
  });
}

async function waitForLogin(page: Page, spinner: ReturnType<typeof ora>): Promise<void> {
  spinner.warn(chalk.yellow("📸 Escanea el QR con tu teléfono"));
  console.log(chalk.gray("  Completa TODOS los pasos de vinculación\n"));

  for (let i = 0; i < 120; i++) {
    await delay(1000);
    if (await isLoggedIn(page)) {
      spinner.succeed(chalk.green("Login completado"));
      return;
    }
    if (i > 0 && i % 15 === 0) console.log(chalk.gray(`  ${i}s...`));
  }

  throw new Error("Timeout esperando login.");
}

async function parseArgs() {
  const args = process.argv.slice(2);

  // Extract --at flag
  let scheduleTime: string | null = null;
  const atIdx = args.indexOf("--at");
  if (atIdx !== -1 && args[atIdx + 1]) {
    scheduleTime = args[atIdx + 1];
    args.splice(atIdx, 2);
  }

  // Extract --csv flag
  let csvPath: string | null = null;
  const csvIdx = args.indexOf("--csv");
  if (csvIdx !== -1 && args[csvIdx + 1]) {
    csvPath = args[csvIdx + 1];
    args.splice(csvIdx, 2);
  }

  // Extract --file flag
  let filePath: string | null = null;
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    filePath = args[fileIdx + 1];
    args.splice(fileIdx, 2);
  }

  // Extract --dry-run flag
  let dryRun = false;
  const dryIdx = args.indexOf("--dry-run");
  if (dryIdx !== -1) {
    dryRun = true;
    args.splice(dryIdx, 1);
  }

  const firstArg = args[0] || "";
  let message = csvPath ? args.join(" ") : args.slice(1).join(" ");

  // Read message from file (overrides CLI message)
  if (filePath) {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      console.log(chalk.red(`\n  ❌ Archivo no encontrado: ${filePath}\n`));
      process.exit(1);
    }
    message = (await file.text()).trimEnd();
  }

  // Detect bulk: "José,María" (commas) or "2 3 4 5" (PowerShell expands commas for digits)
  const allDigitsWithSpaces = /^\d+(\s+\d+)+$/.test(firstArg.trim());
  const isBulk = !csvPath && (firstArg.includes(",") || allDigitsWithSpaces);
  const targets = isBulk
    ? (allDigitsWithSpaces && !firstArg.includes(",")
        ? firstArg.split(/\s+/)
        : firstArg.split(",")
      ).map(t => t.trim()).filter(Boolean)
    : [];
  // Phone: starts with + and has 7+ digits
  const isPhone = !isBulk && !csvPath && /^\+\d{7,}$/.test(firstArg.replace(/[\s\-()]/g, ''));
  const isPositional = !isBulk && !csvPath && !isPhone && /^\d+$/.test(firstArg);

  return { firstArg, message, isBulk, targets, isPositional, isPhone, scheduleTime, csvPath, dryRun };
}

async function wsppCli() {
  const { firstArg, message, isBulk, targets, isPositional, isPhone, scheduleTime, csvPath, dryRun } = await parseArgs();

  // CSV mode: only needs --csv flag (message is optional template)
  if (csvPath) {
    showBanner();
    const csv = await parseCsv(csvPath);

    if (csv.errors.length > 0) {
      csv.errors.forEach((e) => console.log(chalk.yellow(`  ⚠ ${e}`)));
    }

    console.log(chalk.cyan("  📄 CSV:"), csvPath);
    console.log(chalk.cyan("  📨 Destinatarios:"), `${csv.rows.length} filas válidas`);
    if (message) console.log(chalk.cyan("  💬 Template:"), message);
    if (scheduleTime) console.log(chalk.cyan("  ⏰ Programado:"), scheduleTime);
    if (dryRun) console.log(chalk.yellow("  🧪 Modo dry-run (no se envía nada)"));
    console.log();
    console.log(chalk.gray("  ⚠ Usa --dry-run primero para verificar. Envía en tandas de <50."));
    console.log(chalk.gray("  ⚠ Delays aleatorios (3-7s) activos. Más info: README.md → Anti-ban\n"));

    // Dry-run: show what would be sent and exit
    if (dryRun) {
      const { renderTemplate } = await import("../utils/template-engine");
      console.log(chalk.cyan("  ─── Preview ───\n"));
      for (let i = 0; i < csv.rows.length; i++) {
        const row = csv.rows[i];
        const label = row.name || row.phone || `Fila ${i + 2}`;
        const rawMsg = row.message || message || "(sin mensaje)";
        const vars: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          if (v) vars[k] = v;
        }
        const rendered = renderTemplate(rawMsg, vars);
        const via = row.phone ? chalk.gray(`(${row.phone})`) : chalk.gray("(nombre)");
        console.log(chalk.white(`  ${i + 1}. ${label} ${via}`));
        console.log(chalk.gray(`     → ${rendered}\n`));
      }
      console.log(chalk.green(`  ✓ ${csv.rows.length} mensajes listos. Quita --dry-run para enviar.\n`));
      process.exit(0);
    }

    if (!message && !csv.headers.includes("message")) {
      console.log(chalk.red("  ❌ Falta el mensaje. Usa un template o agrega columna 'message' al CSV.\n"));
      console.log(chalk.gray('     bun run wspp --csv archivo.csv "Hola {{name}}"'));
      process.exit(1);
    }

    // Continue to browser launch below (csvPath is set)

  } else if (!firstArg || !message) {
    showBanner();
    console.log(chalk.red("  ❌ Faltan parámetros\n"));
    console.log(chalk.yellow("  📝 Uso:"));
    console.log(chalk.gray('     bun run wspp "Contacto" "Mensaje"         → por nombre'));
    console.log(chalk.gray('     bun run wspp 3 "Mensaje"                  → por posición (#)'));
    console.log(chalk.gray('     bun run wspp +51987654321 "Mensaje"       → por teléfono'));
    console.log(chalk.gray('     bun run wspp "1,3,5" "Mensaje"            → masivo por #'));
    console.log(chalk.gray('     bun run wspp "Juan,María" "Mensaje"       → masivo por nombre'));
    console.log(chalk.gray('     bun run wspp "+51...,+56..." "Mensaje"    → masivo por tel'));
    console.log(chalk.gray('     bun run wspp --csv contactos.csv "Hola"   → masivo desde CSV'));
    console.log(chalk.gray('     bun run wspp 3 --file msg.txt            → mensaje desde archivo'));
    console.log(chalk.gray('     bun run wspp 3 "Msg" --at 08:00          → programado'));
    console.log(chalk.gray('     bun run wspp:contacts                     → ver contactos'));
    console.log(chalk.gray('     bun run wspp:i                            → modo interactivo\n'));
    process.exit(1);
  } else {
    showBanner();

    if (isBulk) {
      console.log(chalk.cyan("  📨 Envío masivo:"), `${targets.length} destinatarios`);
      console.log(chalk.gray("  ⚠ Delays aleatorios (3-7s) activos. Más info: README.md → Anti-ban"));
    } else if (isPhone) {
      console.log(chalk.cyan("  📞 Para:"), firstArg);
    } else if (isPositional) {
      console.log(chalk.cyan("  📱 Para:"), `contacto #${firstArg}`);
    } else {
      console.log(chalk.cyan("  📱 Para:"), firstArg);
    }
    console.log(chalk.cyan("  💬 Mensaje:"), message);
    if (scheduleTime) {
      console.log(chalk.cyan("  ⏰ Programado:"), scheduleTime);
    }
    console.log();
  }

  const sessionExists = hasSession();
  const mode = sessionExists ? "headless (background)" : "visible (QR)";
  const spinner = ora(`Iniciando [${mode}]...`).start();
  const browser = await launchBrowser(true);

  try {
    const pages = await browser.pages();
    const page = pages[0];

    spinner.text = "Abriendo WhatsApp Web...";
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await delay(5000);

    if (await isLoggedIn(page)) {
      spinner.succeed(chalk.green("Sesión activa"));
    } else {
      await waitForLogin(page, spinner);
    }

    await delay(3000);

    // Handle scheduled messages
    if (scheduleTime) {
      const { waitUntil, parseScheduleTime } = await import("../utils/scheduler");
      const targetTime = parseScheduleTime(scheduleTime);
      console.log(chalk.cyan("  ⏰ Enviará a las:"), targetTime.toLocaleString("es-ES"));
      console.log();
      await waitUntil(targetTime);
    }

    // CSV mode
    if (csvPath) {
      const csv = await parseCsv(csvPath);
      if (csv.errors.length > 0) {
        csv.errors.forEach((e) => console.log(chalk.yellow(`  ⚠ ${e}`)));
      }

      console.log();
      const result = await sendCsvMessages(page, csv.rows, message);

      console.log(chalk.cyan("\n  ─── Resumen CSV ───"));
      console.log(chalk.green(`  ✓ Enviados: ${result.success}`));
      if (result.failed.length > 0) {
        console.log(chalk.red(`  ✖ Fallidos: ${result.failed.length} (${result.failed.join(", ")})`));
      }
      console.log();

    // Bulk mode
    } else if (isBulk) {
      // Only load contacts if any target is a position number
      const hasPositions = targets.some(t => /^\d+$/.test(t));
      let contacts: Awaited<ReturnType<typeof extractContacts>> = [];
      if (hasPositions) {
        spinner.start("Obteniendo contactos...");
        contacts = await extractContacts(page);
        spinner.succeed(chalk.green(`${contacts.length} contactos cargados`));
      }

      console.log();
      const result = await sendBulkMessages(page, targets, message, contacts);

      console.log(chalk.cyan("\n  ─── Resumen ───"));
      console.log(chalk.green(`  ✓ Enviados: ${result.success}`));
      if (result.failed.length > 0) {
        console.log(chalk.red(`  ✖ Fallidos: ${result.failed.length} (${result.failed.join(", ")})`));
      }
      console.log();

    } else {
      // Single mode
      let contactName: string;

      if (isPhone) {
        contactName = firstArg;
        spinner.start(`Enviando a ${firstArg}...`);
        await sendMessageByPhone(page, firstArg, message);
      } else if (isPositional) {
        const pos = parseInt(firstArg, 10);
        spinner.start("Obteniendo lista de contactos...");
        const contacts = await extractContacts(page);

        if (pos < 1 || pos > contacts.length) {
          throw new Error(`Posición #${pos} inválida. Solo hay ${contacts.length} contactos. Usa: bun run wspp:contacts`);
        }

        contactName = contacts[pos - 1].name;
        spinner.succeed(chalk.green(`Contacto #${pos}: ${contactName}`));

        spinner.start(`Enviando a "${contactName}"...`);
        await sendMessage(page, contactName, message);
      } else {
        contactName = firstArg;

        spinner.start(`Enviando a "${contactName}"...`);
        await sendMessage(page, contactName, message);
      }

      await page.screenshot({ path: "wspp-sent.png" });
      spinner.succeed(chalk.bold.green("MENSAJE ENVIADO"));
      console.log(chalk.dim(`  📤 ${contactName} · 🕐 ${new Date().toLocaleTimeString("es-ES")}`));
    }

    await delay(3000);

  } catch (error: any) {
    spinner.fail(chalk.red("Error"));
    console.error(chalk.yellow("\n⚠️"), error.message);

    try {
      const pages = await browser.pages();
      await pages[0].screenshot({ path: "wspp-error.png" });
      console.log(chalk.gray("  Screenshot de error: wspp-error.png\n"));
    } catch {}

    await delay(3000);
  } finally {
    await closeBrowser(browser);
  }
}

wsppCli();
