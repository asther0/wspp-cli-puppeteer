import chalk from "chalk";
import ora from "ora";
import { select, input, confirm, checkbox } from "@inquirer/prompts";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { extractContacts, type Contact } from "../utils/contacts";
import { sendMessage } from "../utils/sender";
import { showBanner, showSuccess, showError } from "../ui/banner";
import type { Page } from "puppeteer-core";
import type { Browser } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isLoggedIn(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const side = document.querySelector('#side');
    if (!side) return false;
    return !!(side.querySelector('input, [role="textbox"], [contenteditable="true"], [role="listitem"], span[title]'));
  });
}

async function initSession(): Promise<{ browser: Browser; page: Page }> {
  const spinner = ora("Conectando a WhatsApp Web...").start();
  const browser = await launchBrowser(true);
  const pages = await browser.pages();
  const page = pages[0];

  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
  await delay(5000);

  let loaded = false;
  for (let i = 0; i < 60; i++) {
    if (await isLoggedIn(page)) { loaded = true; break; }
    await delay(1000);
    if (i > 0 && i % 10 === 0) spinner.text = `Cargando (${i}s)...`;
  }

  if (!loaded) {
    await closeBrowser(browser);
    throw new Error("No se pudo conectar. Ejecuta: bun run wspp:login");
  }

  spinner.succeed(chalk.green("✓ Conectado a WhatsApp Web"));
  await delay(2000);
  return { browser, page };
}

async function handleSendSingle(page: Page, contacts: Contact[]) {
  const contactIdx = await select({
    message: "Selecciona un contacto:",
    choices: contacts.map((c, i) => ({
      name: `${String(i + 1).padStart(2)}. ${c.name}${c.phone ? chalk.gray(` (${c.phone})`) : ""}`,
      value: i,
    })),
  });

  const contact = contacts[contactIdx];
  const message = await input({ message: "Escribe tu mensaje:" });

  if (!message.trim()) {
    showError("Mensaje vacío, operación cancelada.");
    return;
  }

  const ok = await confirm({
    message: `Enviar "${message}" a ${contact.name}?`,
  });

  if (!ok) {
    console.log(chalk.gray("\n  Cancelado.\n"));
    return;
  }

  const spinner = ora(`Enviando a ${contact.name}...`).start();
  try {
    await sendMessage(page, contact.name, message);
    spinner.succeed(chalk.green(`✓ Enviado a ${contact.name}`));
    showSuccess("MENSAJE ENVIADO", {
      "📤 Para": contact.name,
      "💬 Mensaje": `"${message}"`,
      "🕐 Hora": new Date().toLocaleTimeString("es-ES"),
    });
  } catch (err: any) {
    spinner.fail(chalk.red("Error al enviar"));
    showError(err.message);
  }
}

async function handleSendBulk(page: Page, contacts: Contact[]) {
  const selected = await checkbox({
    message: "Selecciona contactos (espacio para marcar, enter para confirmar):",
    choices: contacts.map((c, i) => ({
      name: `${c.name}${c.phone ? chalk.gray(` (${c.phone})`) : ""}`,
      value: i,
    })),
  });

  if (selected.length === 0) {
    showError("No seleccionaste contactos.");
    return;
  }

  const message = await input({ message: "Escribe tu mensaje:" });
  if (!message.trim()) {
    showError("Mensaje vacío, operación cancelada.");
    return;
  }

  const names = selected.map(i => contacts[i].name).join(", ");
  const ok = await confirm({
    message: `Enviar "${message}" a ${selected.length} contactos (${names})?`,
  });

  if (!ok) {
    console.log(chalk.gray("\n  Cancelado.\n"));
    return;
  }

  let success = 0;
  const failed: string[] = [];

  for (let i = 0; i < selected.length; i++) {
    const contact = contacts[selected[i]];
    const spinner = ora(`[${i + 1}/${selected.length}] Enviando a ${contact.name}...`).start();
    try {
      await sendMessage(page, contact.name, message);
      spinner.succeed(chalk.green(`✓ Enviado a ${contact.name}`));
      success++;
      if (i < selected.length - 1) await delay(3000);
    } catch (err: any) {
      spinner.fail(chalk.red(`✖ Error con ${contact.name}: ${err.message}`));
      failed.push(contact.name);
    }
  }

  console.log(chalk.cyan("\n  ─── Resumen ───"));
  console.log(chalk.green(`  ✓ Enviados: ${success}`));
  if (failed.length > 0) {
    console.log(chalk.red(`  ✖ Fallidos: ${failed.length} (${failed.join(", ")})`));
  }
  console.log();
}

async function handleContacts(page: Page): Promise<Contact[]> {
  const spinner = ora("Extrayendo contactos...").start();
  const contacts = await extractContacts(page);
  spinner.succeed(chalk.green(`✓ ${contacts.length} contactos`));

  const nameW = Math.max(...contacts.map(c => c.name.length), 20) + 2;
  const phoneW = 18;
  const numW = 4;

  const line = (l: string, c1: string, c2: string, r: string, fill: string) =>
    l + fill.repeat(numW + 2) + c1 + fill.repeat(nameW + 2) + c2 + fill.repeat(phoneW + 2) + r;

  console.log(chalk.cyan("\n" + line("╔", "╦", "╦", "╗", "═")));
  console.log(
    chalk.cyan("║") + chalk.bold.white(" #".padEnd(numW + 2)) +
    chalk.cyan("║") + chalk.bold.white(" Contacto".padEnd(nameW + 2)) +
    chalk.cyan("║") + chalk.bold.white(" Teléfono".padEnd(phoneW + 2)) +
    chalk.cyan("║")
  );
  console.log(chalk.cyan(line("╠", "╬", "╬", "╣", "═")));

  contacts.forEach((c, i) => {
    const num = ` ${String(i + 1).padEnd(numW + 1)}`;
    const name = ` ${c.name.padEnd(nameW + 1)}`;
    const phone = ` ${(c.phone || "—").padEnd(phoneW + 1)}`;
    console.log(
      chalk.cyan("║") + chalk.white(num) +
      chalk.cyan("║") + chalk.green(name) +
      chalk.cyan("║") + chalk.gray(phone) +
      chalk.cyan("║")
    );
  });

  console.log(chalk.cyan(line("╚", "╩", "╩", "╝", "═")) + "\n");

  return contacts;
}

async function interactive() {
  showBanner();

  if (!hasSession()) {
    showError("No hay sesión. Ejecuta primero: bun run wspp:login");
    process.exit(1);
  }

  const { browser, page } = await initSession();

  // Load contacts on start
  let contacts = await extractContacts(page);

  try {
    let running = true;
    while (running) {
      const action = await select({
        message: "¿Qué deseas hacer?",
        choices: [
          { name: "📤  Enviar mensaje", value: "send" },
          { name: "📨  Envío masivo", value: "bulk" },
          { name: "📋  Ver contactos", value: "contacts" },
          { name: "🔄  Refrescar contactos", value: "refresh" },
          { name: "🚪  Salir", value: "exit" },
        ],
      });

      switch (action) {
        case "send":
          await handleSendSingle(page, contacts);
          break;
        case "bulk":
          await handleSendBulk(page, contacts);
          break;
        case "contacts":
          contacts = await handleContacts(page);
          break;
        case "refresh":
          const spinner = ora("Refrescando...").start();
          contacts = await extractContacts(page);
          spinner.succeed(chalk.green(`✓ ${contacts.length} contactos actualizados`));
          break;
        case "exit":
          running = false;
          break;
      }
    }
  } finally {
    console.log(chalk.gray("\n  Cerrando navegador...\n"));
    await closeBrowser(browser);
  }
}

interactive();
