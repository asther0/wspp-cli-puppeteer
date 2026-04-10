import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function searchAndSelectContact(page: Page, contactName: string): Promise<void> {
  const searchInput = await page.$('#side input');
  if (!searchInput) throw new Error("No se encontró la barra de búsqueda");

  await searchInput.click();
  await delay(500);

  // Clear search
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await delay(300);

  await page.keyboard.type(contactName, { delay: 100 });
  await delay(3000);

  // Select contact: prefer exact name match over first result
  let chatOpened = false;
  const nameLower = contactName.toLowerCase();

  // Try exact match first among search results
  const listItems = await page.$$('[role="listitem"]');
  for (const item of listItems) {
    const title = await item.$eval(
      '[data-testid="cell-frame-title"] span[title], span[title]',
      (el: Element) => el.getAttribute('title') || ''
    ).catch(() => '');
    if (title.toLowerCase() === nameLower) {
      await item.click();
      chatOpened = true;
      break;
    }
  }

  // Fallback: partial match
  if (!chatOpened) {
    for (const item of listItems) {
      const title = await item.$eval(
        'span[title]',
        (el: Element) => el.getAttribute('title') || ''
      ).catch(() => '');
      if (title.toLowerCase().includes(nameLower)) {
        await item.click();
        chatOpened = true;
        break;
      }
    }
  }

  // Last resort: arrow down + enter
  if (!chatOpened) {
    if (listItems.length > 0) {
      await listItems[0].click();
      chatOpened = true;
    } else {
      await page.keyboard.press("ArrowDown");
      await delay(300);
      await page.keyboard.press("Enter");
    }
  }

  await delay(3000);

  // Verify chat opened — if no message box, it might be a community overview
  const hasMessageBox = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    if (footer) {
      const box = footer.querySelector('[role="textbox"], [contenteditable="true"], input, textarea');
      if (box) return true;
    }
    const main = document.querySelector('main');
    if (main) {
      const box = main.querySelector('[role="textbox"], [contenteditable="true"], input, textarea');
      if (box) return true;
    }
    return false;
  });

  if (!hasMessageBox) {
    throw new Error(`No se puede enviar a "${contactName}". Puede ser una comunidad sin chat directo.`);
  }
}

export async function typeAndSendMessage(page: Page, message: string): Promise<void> {
  const DEBUG = process.env.WSPP_DEBUG === "1";
  const dbg = (...args: unknown[]) => { if (DEBUG) console.log("[sender]", ...args); };

  // Bring off-screen tab forward so CDP input events reach the page.
  await page.bringToFront();
  await delay(200);

  const COMPOSE_SEL = 'footer [role="textbox"][contenteditable="true"]';

  // Wait for compose box to exist.
  await page.waitForSelector(COMPOSE_SEL, { timeout: 10000 }).catch(() => {
    throw new Error("No se encontró el cuadro de mensaje.");
  });

  // Focus the compose box via a real mouse click (fires React focus).
  await page.click(COMPOSE_SEL);
  await delay(300);

  // Normalize line endings.
  const normalized = message.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  dbg("msg length:", normalized.length, "lines:", normalized.split("\n").length);

  // Strategy 1: CDP Input.insertText — the lowest-level text insertion in
  // Chromium. Fires a real `beforeinput` + `input` event pair that React's
  // synthetic event system listens to, so WhatsApp's internal state updates
  // exactly as if the user had typed. Works with multi-line text as a single
  // atomic insertion (no Enter interpretation).
  const client = await page.target().createCDPSession();
  let inserted = false;
  try {
    await client.send("Input.insertText", { text: normalized });
    inserted = true;
    dbg("CDP Input.insertText: ok");
  } catch (err) {
    dbg("CDP Input.insertText failed:", (err as Error).message);
  }

  // Strategy 2 fallback: execCommand('insertText')
  if (!inserted) {
    inserted = await page.evaluate((text: string) => {
      const box = document.querySelector(
        'footer [role="textbox"][contenteditable="true"]',
      ) as HTMLElement | null;
      if (!box) return false;
      box.focus();
      return document.execCommand("insertText", false, text);
    }, normalized);
    dbg("execCommand fallback:", inserted);
  }

  // Strategy 3 fallback: character typing with Shift+Enter for newlines.
  if (!inserted) {
    const lines = normalized.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 0) await page.keyboard.type(lines[i], { delay: 60 });
      if (i < lines.length - 1) {
        await page.keyboard.down("Shift");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Shift");
      }
    }
    dbg("keyboard typing fallback done");
  }

  await delay(800);

  // Verify the compose box actually has content — if React state is empty
  // the send button won't appear and Enter would do nothing useful.
  const boxState = await page.evaluate(() => {
    const box = document.querySelector(
      'footer [role="textbox"][contenteditable="true"]',
    ) as HTMLElement | null;
    if (!box) return { present: false, text: "", html: "" };
    return {
      present: true,
      text: (box.innerText || "").trim(),
      html: box.innerHTML.slice(0, 200),
    };
  });
  dbg("compose box after insert:", boxState);

  if (!boxState.present || boxState.text.length === 0) {
    throw new Error("El texto no se insertó en el cuadro de mensaje (React state vacío).");
  }

  // Send: prefer clicking the real send button (same pattern as sendDocument),
  // fall back to Enter. The footer send button replaces the mic icon when text
  // is present; WhatsApp uses `wds-ic-send-filled` as the data-icon.
  const SEND_SELECTORS = [
    'footer button[aria-label="Enviar"]',
    'footer button[aria-label="Send"]',
    'footer [role="button"][aria-label="Enviar"]',
    'footer [role="button"][aria-label="Send"]',
    'footer span[data-icon="wds-ic-send-filled"]',
    'footer span[data-icon="send"]',
  ];

  let clicked = false;
  for (const sel of SEND_SELECTORS) {
    try {
      const handle = await page.waitForSelector(sel, { timeout: 1500, visible: true });
      if (handle) {
        await handle.click();
        dbg("clicked send selector:", sel);
        clicked = true;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!clicked) {
    dbg("no send button matched — falling back to Enter");
    await page.click(COMPOSE_SEL);
    await delay(200);
    await page.keyboard.press("Enter");
  }

  await delay(4000);

  // Verify send status by inspecting the last outgoing message.
  const sendStatus = await page.evaluate(() => {
    const outMsgs = document.querySelectorAll(".message-out");
    if (outMsgs.length === 0) return { state: "no-messages", icons: [] as string[] };
    const last = outMsgs[outMsgs.length - 1];
    const icons = Array.from(last.querySelectorAll("[data-icon]"))
      .map((el) => el.getAttribute("data-icon") || "")
      .filter(Boolean);
    if (icons.some((i) => /alert|error/i.test(i))) return { state: "error", icons };
    if (icons.some((i) => /msg-time|msg-clock/.test(i))) return { state: "pending", icons };
    if (icons.some((i) => /msg-check|msg-dblcheck/.test(i))) return { state: "sent", icons };
    return { state: "unknown", icons };
  });
  dbg("send status:", sendStatus);

  if (sendStatus.state === "error") {
    throw new Error(
      `El mensaje fue escrito pero WhatsApp no pudo enviarlo (iconos: ${sendStatus.icons.join(", ")}). Verifica tu conexión y permisos en el grupo.`,
    );
  }

  if (sendStatus.state === "pending") {
    await delay(5000);
    const retry = await page.evaluate(() => {
      const outMsgs = document.querySelectorAll(".message-out");
      if (outMsgs.length === 0) return "no-messages";
      const last = outMsgs[outMsgs.length - 1];
      const icons = Array.from(last.querySelectorAll("[data-icon]"))
        .map((el) => el.getAttribute("data-icon") || "");
      if (icons.some((i) => /alert|error/i.test(i))) return "error";
      if (icons.some((i) => /msg-check|msg-dblcheck/.test(i))) return "sent";
      return "pending";
    });
    dbg("retry status:", retry);
    if (retry === "error") {
      throw new Error("El mensaje fue escrito pero WhatsApp no pudo enviarlo. Verifica tu conexión y permisos en el grupo.");
    }
  }
}

export async function selectContactByPosition(page: Page, position: number): Promise<void> {
  // Mirror extractContacts filtering to ensure position alignment
  const result = await page.evaluate((pos: number) => {
    const items = document.querySelectorAll('[role="listitem"]');
    const validItems: { name: string; el: Element }[] = [];
    const seen = new Set<string>();

    items.forEach((row) => {
      let name = '';
      const titleContainer = row.querySelector('[data-testid="cell-frame-title"]');
      if (titleContainer) {
        const titleSpan = titleContainer.querySelector('span[title]');
        if (titleSpan) name = titleSpan.getAttribute('title') || '';
      }
      if (!name) {
        const span = row.querySelector('span[title]');
        if (span) name = span.getAttribute('title') || '';
      }

      if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;

      // Junk filter (same as isJunk in contacts.ts)
      if (/[\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\uFEFF]/.test(name)) return;
      const clean = name.replace(/[\u200e\u200f]/g, '').trim();
      if (clean.length <= 1) return;
      if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(clean)) return;
      if (/\.(pdf|jpg|png|gif|mp4|mp3|doc|xls|zip|rar)/i.test(clean)) return;
      if (/^\d{1,2}:\d{2}/.test(clean)) return;
      if (/^borrador/i.test(clean) || /^draft/i.test(clean)) return;
      if (/^(buscar|search|chats|loading)/i.test(clean)) return;
      if (/https?:\/\//.test(clean)) return;

      seen.add(name);
      validItems.push({ name, el: row });
    });

    // Remove community headers: "X" followed by "X Something" → drop "X"
    const deduped = validItems.filter((c, i) => {
      const next = validItems[i + 1];
      if (next && next.name.startsWith(c.name) && next.name.length > c.name.length) {
        return false;
      }
      return true;
    });

    if (pos < 1 || pos > deduped.length) {
      return { clicked: false, total: deduped.length };
    }

    (deduped[pos - 1].el as HTMLElement).click();
    return { clicked: true, total: deduped.length };
  }, position);

  if (!result.clicked) {
    throw new Error(`Posición #${position} inválida. Solo hay ${result.total} chats visibles.`);
  }

  await delay(3000);

  // Verify message box exists
  const hasMessageBox = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    if (footer) {
      const box = footer.querySelector('[role="textbox"], [contenteditable="true"], input, textarea');
      if (box) return true;
    }
    const main = document.querySelector('main');
    if (main) {
      const box = main.querySelector('[role="textbox"], [contenteditable="true"], input, textarea');
      if (box) return true;
    }
    return false;
  });

  if (!hasMessageBox) {
    throw new Error(`No se puede enviar a la posición #${position}. Puede ser una comunidad sin chat directo.`);
  }
}

export async function sendMessageByPhone(page: Page, phone: string, message: string): Promise<void> {
  // Normalize: remove spaces, dashes, parens; ensure no leading +
  const digits = phone.replace(/[\s\-()]/g, '');
  const phoneNumber = digits.startsWith('+') ? digits.slice(1) : digits;

  // Use WhatsApp's direct chat URL — opens the chat without searching
  await page.goto(`https://web.whatsapp.com/send?phone=${phoneNumber}`, {
    waitUntil: "networkidle2",
  });
  await delay(5000);

  // WhatsApp may show an invalid number popup
  const invalid = await page.evaluate(() => {
    const popup = document.querySelector('[data-testid="popup-controls-ok"]');
    if (popup) {
      (popup as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (invalid) {
    throw new Error(`Número inválido: ${phone}. Verifica el código de país.`);
  }

  // Verify message box appeared
  const hasMessageBox = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    if (footer) {
      const box = footer.querySelector('[role="textbox"], [contenteditable="true"]');
      if (box) return true;
    }
    return false;
  });

  if (!hasMessageBox) {
    throw new Error(`No se pudo abrir chat con ${phone}. Verifica el número.`);
  }

  await typeAndSendMessage(page, message);
}

export async function sendMessage(page: Page, contactName: string, message: string): Promise<void> {
  await searchAndSelectContact(page, contactName);
  await typeAndSendMessage(page, message);
}

export async function sendMessageByPosition(page: Page, position: number, message: string): Promise<void> {
  await selectContactByPosition(page, position);
  await typeAndSendMessage(page, message);
}
