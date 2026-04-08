import type { Page } from "puppeteer-core";

export interface Contact {
  name: string;
  phone: string;
}

const NOISE = [
  "you", "aún no", "hola desde", "http", "buscar", "search",
  "chats", "loading", "waiting for", "this may take", "pollito",
  "convertido", "omg", "no hay mensajes",
];

export async function extractContacts(page: Page, max = 10): Promise<Contact[]> {
  const raw = await page.evaluate(() => {
    const results: Array<{ name: string; phone: string }> = [];
    const seen = new Set<string>();

    const chatRows = document.querySelectorAll('[role="listitem"], [data-testid^="cell-frame-container"]');

    chatRows.forEach((row) => {
      const nameSpan = row.querySelector('span[title]')
        || row.querySelector('[data-testid^="cell-frame-title"] span')
        || row.querySelector('span[dir="auto"]');

      const name = nameSpan?.getAttribute('title')
        || nameSpan?.textContent?.trim()
        || '';

      if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;
      seen.add(name);

      // Try to extract phone number from data-id on the row or parent
      let phone = '';
      const el = row as HTMLElement;
      // WhatsApp stores chat IDs like "5199999999@c.us" or "5199999999@s.whatsapp.net"
      const dataId = el.getAttribute('data-id')
        || el.querySelector('[data-id]')?.getAttribute('data-id')
        || '';
      const phoneMatch = dataId.match(/(\d{7,15})@/);
      if (phoneMatch) {
        phone = '+' + phoneMatch[1];
      }

      // If the name itself looks like a phone number, use it as phone too
      if (!phone && /^\+?\d[\d\s\-()]{6,}$/.test(name)) {
        phone = name.replace(/[\s\-()]/g, '');
      }

      results.push({ name, phone });
    });

    if (results.length === 0) {
      const side = document.querySelector('#side');
      if (side) {
        const allSpans = side.querySelectorAll('span[title], span[dir="auto"]');
        allSpans.forEach((span) => {
          const text = span.getAttribute('title') || span.textContent?.trim() || '';
          if (text && !seen.has(text) && text.length > 1 && text.length < 50
              && !text.startsWith('http') && !text.includes('Buscar')
              && !text.includes('Search')) {
            seen.add(text);
            const isPhone = /^\+?\d[\d\s\-()]{6,}$/.test(text);
            results.push({ name: text, phone: isPhone ? text.replace(/[\s\-()]/g, '') : '' });
          }
        });
      }
    }

    return results.slice(0, 25);
  });

  return raw
    .filter(({ name }) => {
      const lower = name.toLowerCase();
      if (NOISE.some(n => lower.includes(n))) return false;
      if (name.length <= 1) return false;
      if (/^\d{1,2}:\d{2}/.test(name)) return false;
      if (/^(AM|PM)$/i.test(name)) return false;
      if (/^[\p{Emoji}\s✅👍🏻]+$/u.test(name)) return false;
      if (/^[a-záéíóúñ]/.test(name) && name.includes(' ') && name.length > 25) return false;
      if (/^[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/.test(name) && name.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\s]/g, '').length < 3) return false;
      return true;
    })
    .slice(0, max);
}
