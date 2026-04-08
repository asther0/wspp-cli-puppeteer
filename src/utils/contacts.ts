import type { Page } from "puppeteer-core";

export interface Contact {
  name: string;
  phone: string;
}

function isJunk(name: string): boolean {
  const clean = name.replace(/[\u200e\u200f\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\uFEFF]/g, '').trim();
  if (clean.length <= 1) return true;
  if (/\.(pdf|jpg|png|gif|mp4|mp3|doc|xls|zip|rar)/i.test(clean)) return true;
  if (/^\d{1,2}:\d{2}/.test(clean)) return true;
  if (/^borrador/i.test(clean) || /^draft/i.test(clean)) return true;
  if (/^(buscar|search|chats|loading)/i.test(clean)) return true;
  if (/https?:\/\//.test(clean)) return true;
  return false;
}

export async function extractContacts(page: Page, max = 10): Promise<Contact[]> {
  const raw = await page.evaluate(() => {
    const results: Array<{ name: string; phone: string; source: string }> = [];
    const seen = new Set<string>();

    // Strategy 1: [role="listitem"] rows with span[title]
    const chatRows = document.querySelectorAll('[role="listitem"]');
    chatRows.forEach((row) => {
      const allTitleSpans = row.querySelectorAll('span[title]');
      if (allTitleSpans.length === 0) return;

      const name = allTitleSpans[0].getAttribute('title') || '';
      if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;
      seen.add(name);

      let phone = '';
      const dataId = row.getAttribute('data-id')
        || row.querySelector('[data-id]')?.getAttribute('data-id')
        || '';
      const phoneMatch = dataId.match(/(\d{7,15})@/);
      if (phoneMatch) phone = '+' + phoneMatch[1];
      if (!phone && /^\+?\d[\d\s\-()]{6,}$/.test(name)) phone = name.replace(/[\s\-()]/g, '');

      results.push({ name, phone, source: 'listitem' });
    });

    // Strategy 2: data-testid cell frames
    if (results.length === 0) {
      const cells = document.querySelectorAll('[data-testid^="cell-frame-container"]');
      cells.forEach((cell) => {
        const span = cell.querySelector('span[title]');
        const name = span?.getAttribute('title') || '';
        if (!name || seen.has(name) || name.length > 60) return;
        seen.add(name);
        results.push({ name, phone: '', source: 'cell-frame' });
      });
    }

    // Strategy 3: All span[title] inside #side
    if (results.length === 0) {
      const side = document.querySelector('#side');
      if (side) {
        side.querySelectorAll('span[title]').forEach((span) => {
          const name = span.getAttribute('title') || '';
          if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')
              || name.includes('Buscar') || name.includes('Search')) return;
          seen.add(name);
          results.push({ name, phone: '', source: 'side-span' });
        });
      }
    }

    // Strategy 4: aria-label on chat rows
    if (results.length === 0) {
      const side = document.querySelector('#side');
      if (side) {
        side.querySelectorAll('[role="row"], [role="gridcell"], [tabindex]').forEach((el) => {
          const label = el.getAttribute('aria-label') || '';
          // aria-label often looks like "Chat with ContactName"
          const match = label.match(/(?:Chat with |Conversación con )(.+)/i);
          const name = match ? match[1].trim() : '';
          if (!name || seen.has(name) || name.length > 60) return;
          seen.add(name);
          results.push({ name, phone: '', source: 'aria' });
        });
      }
    }

    return results.slice(0, 30);
  });

  return raw
    .filter(({ name }) => !isJunk(name))
    .slice(0, max);
}
