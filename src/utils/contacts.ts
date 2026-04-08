import type { Page } from "puppeteer-core";

export interface Contact {
  name: string;
  phone: string;
}

// Unicode control chars WhatsApp injects
const INVISIBLE_RE = /[\u200e\u200f\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\uFEFF]/g;

function cleanText(text: string): string {
  return text.replace(INVISIBLE_RE, '').trim();
}

// Known noise patterns (messages, UI text, system msgs)
const NOISE = [
  "you", "aún no", "hola desde", "http", "buscar", "search",
  "chats", "loading", "waiting for", "this may take",
  "no hay mensajes", "messages and calls", "end-to-end",
  "lo reviso", "reviso", "listo", "ok", "dale", "ya",
  "gracias", "sí", "si", "no", "bueno",
];

function isLikelyMessage(name: string): boolean {
  const clean = cleanText(name);
  const lower = clean.toLowerCase();

  // Timestamps: 1:49, 12:30, 7:00 PM, etc.
  if (/^\d{1,2}:\d{2}/.test(clean)) return true;
  if (/^(AM|PM)$/i.test(clean)) return true;

  // Only emojis/symbols
  if (/^[\p{Emoji}\p{Emoji_Component}\s]+$/u.test(clean)) return true;

  // Very short lowercase text (likely a message snippet)
  if (clean.length <= 15 && /^[a-záéíóúñü]/.test(clean) && !/\s/.test(clean)) {
    // Single lowercase word under 15 chars = likely a message
    // Exception: proper names could be lowercase in Spanish contacts
    if (NOISE.includes(lower)) return true;
  }

  // Noise patterns
  if (NOISE.some(n => lower.includes(n) && lower.length < 30)) return true;

  // Sentences (lowercase start + multiple words + long)
  if (/^[a-záéíóúñü]/.test(clean) && (clean.match(/\s/g) || []).length >= 2 && clean.length > 20) return true;

  // Almost empty after cleaning invisible chars
  if (clean.length <= 1) return true;

  return false;
}

export async function extractContacts(page: Page, max = 10): Promise<Contact[]> {
  const raw = await page.evaluate(() => {
    const results: Array<{ name: string; phone: string }> = [];
    const seen = new Set<string>();

    const chatRows = document.querySelectorAll('[role="listitem"], [data-testid^="cell-frame-container"]');

    chatRows.forEach((row) => {
      // Target the FIRST span[title] — that's the contact name in WhatsApp
      const nameSpan = row.querySelector('span[title]')
        || row.querySelector('[data-testid^="cell-frame-title"] span');

      const name = nameSpan?.getAttribute('title') || '';

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

    // Fallback: scan all span[title] in #side (not span[dir="auto"] which catches messages)
    if (results.length === 0) {
      const side = document.querySelector('#side');
      if (side) {
        const allSpans = side.querySelectorAll('span[title]');
        allSpans.forEach((span) => {
          const text = span.getAttribute('title') || '';
          if (text && !seen.has(text) && text.length > 1 && text.length < 50
              && !text.startsWith('http')) {
            seen.add(text);
            const isPhone = /^\+?\d[\d\s\-()]{6,}$/.test(text);
            results.push({ name: text, phone: isPhone ? text.replace(/[\s\-()]/g, '') : '' });
          }
        });
      }
    }

    return results.slice(0, 30);
  });

  return raw
    .filter(({ name }) => !isLikelyMessage(name))
    .slice(0, max);
}
