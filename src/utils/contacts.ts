import type { Page } from "puppeteer-core";

export interface Contact {
  name: string;
  phone: string;
}

// Unicode directional/invisible chars WhatsApp wraps around message previews
const INVISIBLE_RE = /[\u200e\u200f\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\uFEFF]/g;

function hasInvisibleWrapper(text: string): boolean {
  // Message previews in WhatsApp start/end with invisible Unicode chars
  // Contact names do NOT have these wrappers
  return INVISIBLE_RE.test(text);
}

function isLikelyNotContact(name: string): boolean {
  const clean = name.replace(INVISIBLE_RE, '').trim();

  // Empty after cleaning
  if (clean.length <= 1) return true;

  // Wrapped in invisible chars = message preview, not a contact name
  if (hasInvisibleWrapper(name)) return true;
  // Reset regex lastIndex
  INVISIBLE_RE.lastIndex = 0;

  // File attachments
  if (/\.(pdf|jpg|png|gif|mp4|mp3|doc|xls|zip|rar)/i.test(clean)) return true;

  // Timestamps
  if (/^\d{1,2}:\d{2}/.test(clean)) return true;

  // Draft indicator
  if (/^borrador/i.test(clean) || /^draft/i.test(clean)) return true;

  // Only emojis
  if (/^[\p{Emoji}\p{Emoji_Component}\s]+$/u.test(clean)) return true;

  // UI elements
  if (/^(buscar|search|chats|loading)/i.test(clean)) return true;

  return false;
}

export async function extractContacts(page: Page, max = 10): Promise<Contact[]> {
  const raw = await page.evaluate(() => {
    const results: Array<{ name: string; phone: string }> = [];
    const seen = new Set<string>();

    const chatRows = document.querySelectorAll('[role="listitem"]');

    chatRows.forEach((row) => {
      // Get ALL span[title] in this row
      const allTitleSpans = row.querySelectorAll('span[title]');

      // The FIRST span[title] is the contact/group name
      // Subsequent ones are message previews, file names, etc.
      if (allTitleSpans.length === 0) return;

      const name = allTitleSpans[0].getAttribute('title') || '';
      if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;
      seen.add(name);

      // Extract phone from data-id
      let phone = '';
      const el = row as HTMLElement;
      const dataId = el.getAttribute('data-id')
        || el.querySelector('[data-id]')?.getAttribute('data-id')
        || '';
      const phoneMatch = dataId.match(/(\d{7,15})@/);
      if (phoneMatch) {
        phone = '+' + phoneMatch[1];
      }

      if (!phone && /^\+?\d[\d\s\-()]{6,}$/.test(name)) {
        phone = name.replace(/[\s\-()]/g, '');
      }

      results.push({ name, phone });
    });

    return results.slice(0, 30);
  });

  return raw
    .filter(({ name }) => !isLikelyNotContact(name))
    .slice(0, max);
}
