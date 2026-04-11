import chalk from "chalk";
import ora from "ora";
import { launchBrowser, closeBrowser, hasSession } from "../utils/browser";
import { sendMessage, sendMessageByPhone } from "../utils/sender";
import { sendBulkMessages } from "../utils/bulk-sender";
import { extractContacts } from "../utils/contacts";
import { renderTemplate } from "../utils/template-engine";
import { showBanner } from "../ui/banner";
import type { Browser, Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Config ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function argValue(flag: string): string | null {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const PORT = parseInt(argValue("--port") ?? process.env.WSPP_PORT ?? "3000", 10);
const API_KEY = argValue("--key") ?? process.env.WSPP_API_KEY ?? "";

// ── Server state ──────────────────────────────────────────────────────────────
let browser: Browser | null = null;
let page: Page | null = null;
let ready = false;
let startedAt = 0;
let totalSent = 0;
let totalErrors = 0;

// ── Sequential request queue ──────────────────────────────────────────────────
// WhatsApp Web can't handle concurrent operations — every request goes through
// this queue so they execute one at a time.
let requestQueue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    requestQueue = requestQueue.then(async () => {
      try {
        resolve(await task());
      } catch (err) {
        reject(err);
      }
    });
  });
}

// ── Session helpers ───────────────────────────────────────────────────────────
async function isLoggedIn(p: Page): Promise<boolean> {
  return p.evaluate(() => {
    const side = document.querySelector("#side");
    if (!side) return false;
    return !!(
      side.querySelector(
        'input, [role="textbox"], [contenteditable="true"], [role="listitem"], span[title]',
      )
    );
  });
}

async function waitForQr(p: Page): Promise<void> {
  console.log(chalk.yellow("\n  📸 Sesión no encontrada — escanea el QR en el navegador"));
  console.log(chalk.gray("  Ejecuta primero: bun run wspp:login\n"));

  for (let i = 0; i < 120; i++) {
    await delay(1000);
    if (await isLoggedIn(p)) return;
    if (i > 0 && i % 20 === 0) console.log(chalk.gray(`  Esperando QR... ${i}s`));
  }
  throw new Error("Timeout esperando login por QR (120s)");
}

// ── Browser initialization ────────────────────────────────────────────────────
async function initBrowser(): Promise<void> {
  const spinner = ora("Iniciando navegador...").start();
  const sessionExists = hasSession();

  // Visible if no session (need QR), offscreen if session exists
  browser = await launchBrowser(true, !sessionExists, false);
  const pages = await browser.pages();
  page = pages[0];

  spinner.text = "Conectando a WhatsApp Web...";
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
  await delay(5000);

  // Give it up to 15s to auto-restore session
  let loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    spinner.text = "Restaurando sesión...";
    for (let i = 0; i < 15; i++) {
      await delay(1000);
      if (await isLoggedIn(page)) { loggedIn = true; break; }
    }
  }

  if (loggedIn) {
    spinner.succeed(chalk.green("Sesión activa — WhatsApp listo"));
  } else {
    spinner.warn(chalk.yellow("Sesión no encontrada"));
    await waitForQr(page);
    console.log(chalk.green("  ✓ Conectado por QR"));
  }

  startedAt = Date.now();
  ready = true;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function isAuthorized(req: Request): boolean {
  if (!API_KEY) return true; // Open mode (dev) — warn on startup
  const key = req.headers.get("X-API-Key") ?? req.headers.get("x-api-key") ?? "";
  return key === API_KEY;
}

// ── Response helpers ──────────────────────────────────────────────────────────
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleSend(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch {
    return json({ ok: false, error: "Body JSON inválido" }, 400);
  }

  const { to, message, vars } = body as {
    to?: string;
    message?: string;
    vars?: Record<string, string>;
  };

  if (!to) return json({ ok: false, error: "Campo requerido: to (nombre o +teléfono)" }, 400);
  if (!message) return json({ ok: false, error: "Campo requerido: message" }, 400);

  const rendered = vars ? renderTemplate(message, vars) : message;

  await enqueue(async () => {
    const isPhone = /^\+?\d{7,}$/.test(to.replace(/[\s\-()]/g, ""));
    if (isPhone) {
      await sendMessageByPhone(page!, to, rendered);
    } else {
      await sendMessage(page!, to, rendered);
    }
  });

  totalSent++;
  console.log(chalk.green(`  ✓ Enviado`), chalk.gray(`→ ${to} · ${new Date().toLocaleTimeString("es-ES")}`));
  return json({ ok: true, to, message: rendered, sentAt: new Date().toISOString() });
}

async function handleBulkSend(req: Request): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch {
    return json({ ok: false, error: "Body JSON inválido" }, 400);
  }

  const { targets, message, vars } = body as {
    targets?: string[];
    message?: string;
    vars?: Record<string, string>;
  };

  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    return json({ ok: false, error: "Campo requerido: targets (array de nombres o teléfonos)" }, 400);
  }
  if (!message) return json({ ok: false, error: "Campo requerido: message" }, 400);

  const rendered = vars ? renderTemplate(message, vars) : message;

  const result = await enqueue(async () => {
    return await sendBulkMessages(page!, targets, rendered, []);
  });

  totalSent += result.success;
  totalErrors += result.failed.length;
  console.log(
    chalk.green(`  ✓ Bulk enviado`),
    chalk.gray(`→ ${result.success}/${targets.length} · ${new Date().toLocaleTimeString("es-ES")}`),
  );

  return json({
    ok: true,
    sent: result.success,
    failed: result.failed,
    total: targets.length,
    sentAt: new Date().toISOString(),
  });
}

async function handleContacts(): Promise<Response> {
  const contacts = await enqueue(() => extractContacts(page!, 20));
  return json({ ok: true, count: contacts.length, contacts });
}

function handleHealth(): Response {
  return json({
    ok: true,
    status: ready ? "ready" : "initializing",
    session: hasSession(),
    uptime: ready ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    stats: { sent: totalSent, errors: totalErrors },
    timestamp: new Date().toISOString(),
  });
}

function handleNotFound(method: string, pathname: string): Response {
  return json(
    {
      ok: false,
      error: `Endpoint no encontrado: ${method} ${pathname}`,
      available: [
        "POST /send",
        "POST /send/bulk",
        "GET  /contacts",
        "GET  /health",
      ],
    },
    404,
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
async function router(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const method = req.method.toUpperCase();

  // Health is always public
  if (method === "GET" && pathname === "/health") return handleHealth();

  if (!isAuthorized(req)) {
    return json({ ok: false, error: "Unauthorized — incluye header: X-API-Key: <tu-clave>" }, 401);
  }

  if (!ready) {
    return json({ ok: false, error: "Servidor iniciando, reintenta en unos segundos" }, 503);
  }

  try {
    if (method === "POST" && pathname === "/send") return await handleSend(req);
    if (method === "POST" && pathname === "/send/bulk") return await handleBulkSend(req);
    if (method === "GET" && pathname === "/contacts") return await handleContacts();
    return handleNotFound(method, pathname);
  } catch (err: any) {
    totalErrors++;
    console.error(chalk.red(`  ✖ ${method} ${pathname}`), err.message);
    return json({ ok: false, error: err.message }, 500);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  showBanner();

  if (!API_KEY) {
    console.log(chalk.yellow("  ⚠  Sin API key — servidor abierto (solo desarrollo)"));
    console.log(chalk.gray("     Usa --key <clave> o env WSPP_API_KEY para protegerlo\n"));
  } else {
    console.log(chalk.green("  🔑 API key configurada\n"));
  }

  // Start browser async — server accepts requests immediately (returns 503 until ready)
  initBrowser().catch((err: Error) => {
    console.error(chalk.red("\n  ✖ Error iniciando browser:"), err.message);
    process.exit(1);
  });

  const server = Bun.serve({ port: PORT, fetch: router });

  console.log(chalk.bold.green(`  ✓ wspp server corriendo en http://localhost:${PORT}`));
  console.log();
  console.log(chalk.cyan("  Endpoints:"));
  console.log(chalk.gray(`    POST /send          → enviar mensaje a contacto o número`));
  console.log(chalk.gray(`    POST /send/bulk     → envío masivo (delays anti-ban incluidos)`));
  console.log(chalk.gray(`    GET  /contacts      → listar contactos recientes`));
  console.log(chalk.gray(`    GET  /health        → estado del servidor`));
  console.log();
  if (API_KEY) {
    console.log(chalk.gray(`  Header requerido: X-API-Key: ${API_KEY}`));
    console.log();
  }

  process.on("SIGINT", async () => {
    console.log(chalk.yellow("\n  Cerrando servidor..."));
    server.stop();
    if (browser) await closeBrowser(browser);
    process.exit(0);
  });
}

main();
