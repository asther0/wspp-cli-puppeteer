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

  const footer = await page.$('footer');
  if (footer) {
    messageBox = await footer.$('input, textarea, [role="textbox"], [contenteditable="true"]');
  }

  if (!messageBox) {
    const main = await page.$('main');
    if (main) {
      messageBox = await main.$('input, textarea, [role="textbox"], [contenteditable="true"]');
    }
  }

  if (!messageBox) {
    throw new Error("No se encontró el cuadro de mensaje.");
  }

  await messageBox.click();
  await delay(500);
  await page.keyboard.type(message, { delay: 50 });
  await delay(1000);

  await page.keyboard.press("Enter");
  await delay(3000);
}

export async function selectContactByPosition(page: Page, position: number): Promise<void> {
  // Click the listitem directly from sidebar — no search needed
  const listItems = await page.$$('#side [role="listitem"]');
  if (position < 1 || position > listItems.length) {
    throw new Error(`Posición #${position} inválida. Solo hay ${listItems.length} chats visibles.`);
  }

  await listItems[position - 1].click();
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

export async function sendMessage(page: Page, contactName: string, message: string): Promise<void> {
  await searchAndSelectContact(page, contactName);
  await typeAndSendMessage(page, message);
}

export async function sendMessageByPosition(page: Page, position: number, message: string): Promise<void> {
  await selectContactByPosition(page, position);
  await typeAndSendMessage(page, message);
}
