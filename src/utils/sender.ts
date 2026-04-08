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

  // Select contact with fallbacks
  let chatOpened = false;

  const listItems = await page.$$('[role="listitem"]');
  if (listItems.length > 0) {
    await listItems[0].click();
    chatOpened = true;
  }

  if (!chatOpened) {
    const cellFrames = await page.$$('[data-testid^="cell-frame"]');
    if (cellFrames.length > 0) {
      await cellFrames[0].click();
      chatOpened = true;
    }
  }

  if (!chatOpened) {
    const spans = await page.$$('span[title]');
    for (const span of spans) {
      const title = await span.evaluate((el: Element) => el.getAttribute('title'));
      if (title && title.toLowerCase().includes(contactName.toLowerCase())) {
        await span.click();
        chatOpened = true;
        break;
      }
    }
  }

  if (!chatOpened) {
    await page.keyboard.press("ArrowDown");
    await delay(300);
    await page.keyboard.press("Enter");
  }

  await delay(3000);

  // Verify chat opened
  const footer = await page.$('footer');
  const main = await page.$('main');
  if (!footer && !main) {
    throw new Error(`No se abrió el chat de "${contactName}". Verifica que el nombre sea exacto.`);
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

export async function sendMessage(page: Page, contactName: string, message: string): Promise<void> {
  await searchAndSelectContact(page, contactName);
  await typeAndSendMessage(page, message);
}
