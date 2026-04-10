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
  let messageBox = null;

  // Prefer the specific WhatsApp compose box
  messageBox = await page.$('footer [role="textbox"][contenteditable="true"]');

  if (!messageBox) {
    const footer = await page.$('footer');
    if (footer) {
      messageBox = await footer.$('[role="textbox"], [contenteditable="true"]');
    }
  }

  if (!messageBox) {
    const main = await page.$('main');
    if (main) {
      messageBox = await main.$('[role="textbox"][contenteditable="true"]');
    }
  }

  if (!messageBox) {
    throw new Error("No se encontró el cuadro de mensaje.");
  }

  await messageBox.click();
  await delay(500);

  // Normalize line endings (\r\n on Windows, \r on old Mac) before splitting.
  // Without this, the \r character gets typed and WhatsApp interprets it as Enter,
  // splitting one multi-line message into multiple sent messages.
  const lines = message.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) {
      await page.keyboard.type(lines[i], { delay: 50 });
    }
    if (i < lines.length - 1) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
  }
  await delay(1500);

  // Use page.click() (real mouse events) — evaluate-based element.click() does not
  // fire React's synthetic event listeners on WhatsApp's send button, so the message
  // stays in the compose box even though clickedSend returns true.
  const SEND_SELECTORS = [
    'button[aria-label="Send"]',
    'button[aria-label="Enviar"]',
    '[role="button"][aria-label="Send"]',
    '[role="button"][aria-label="Enviar"]',
    'span[data-icon="wds-ic-send-filled"]',
    'span[data-icon="send"]',
  ];

  let sent = false;
  for (const sel of SEND_SELECTORS) {
    try {
      await page.click(sel, { timeout: 2000 });
      sent = true;
      break;
    } catch {
      // try next selector
    }
  }

  if (!sent) {
    await page.keyboard.press("Enter");
  }

  await delay(5000);

  // Verify message was actually sent (check for error indicator)
  const sendStatus = await page.evaluate(() => {
    const outMsgs = document.querySelectorAll('.message-out');
    if (outMsgs.length === 0) return 'no-messages';
    const last = outMsgs[outMsgs.length - 1];
    // Check for error icon (red circle with !)
    if (last.querySelector('[data-icon="msg-alert-error"], [data-icon="alert-notification"], [data-testid="msg-alert-error"]')) {
      return 'error';
    }
    // Check for pending (clock icon)
    if (last.querySelector('[data-icon="msg-time"], [data-icon="msg-clock"]')) {
      return 'pending';
    }
    // Check for sent (single check)
    if (last.querySelector('[data-icon="msg-check"], [data-icon="msg-dblcheck"]')) {
      return 'sent';
    }
    return 'unknown';
  });

  if (sendStatus === 'error') {
    throw new Error("El mensaje fue escrito pero WhatsApp no pudo enviarlo. Verifica tu conexión y permisos en el grupo.");
  }

  if (sendStatus === 'pending') {
    // Wait a bit more for pending messages
    await delay(5000);

    const retryStatus = await page.evaluate(() => {
      const outMsgs = document.querySelectorAll('.message-out');
      if (outMsgs.length === 0) return 'no-messages';
      const last = outMsgs[outMsgs.length - 1];
      if (last.querySelector('[data-icon="msg-alert-error"], [data-icon="alert-notification"], [data-testid="msg-alert-error"]')) {
        return 'error';
      }
      if (last.querySelector('[data-icon="msg-check"], [data-icon="msg-dblcheck"]')) {
        return 'sent';
      }
      return 'pending';
    });

    if (retryStatus === 'error') {
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
