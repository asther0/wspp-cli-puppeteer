import type { Page } from "puppeteer-core";

export interface Contact {
  name: string;
  phone: string;
}

function isJunk(name: string): boolean {
  // Invisible Unicode chars → message preview, not a contact name
  if (/[\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\uFEFF]/.test(name)) return true;

  const clean = name.replace(/[\u200e\u200f]/g, '').trim();
  if (clean.length <= 1) return true;
  // Pure emoji (no letters/digits) → reaction or status, not a contact
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(clean)) return true;
  if (/\.(pdf|jpg|png|gif|mp4|mp3|doc|xls|zip|rar)/i.test(clean)) return true;
  if (/^\d{1,2}:\d{2}/.test(clean)) return true;
  if (/^borrador/i.test(clean) || /^draft/i.test(clean)) return true;
  if (/^(buscar|search|chats|loading)/i.test(clean)) return true;
  if (/https?:\/\//.test(clean)) return true;
  return false;
}

export async function extractContacts(page: Page, max = 10): Promise<Contact[]> {
  const raw = await page.evaluate(() => {
    const results: Array<{ name: string; phone: string }> = [];
    const seen = new Set<string>();

    const chatRows = document.querySelectorAll('[role="listitem"]');

    chatRows.forEach((row) => {
      // STRUCTURAL: target only the chat TITLE area, not message previews
      // WhatsApp uses data-testid="cell-frame-title" for the contact name container
      let name = '';
      const titleContainer = row.querySelector('[data-testid="cell-frame-title"]');
      if (titleContainer) {
        const titleSpan = titleContainer.querySelector('span[title]');
        if (titleSpan) name = titleSpan.getAttribute('title') || '';
      }

      // Fallback: if data-testid not found, use first span[title] inside header/top area
      if (!name) {
        // The contact name is typically in the first row (top) of the cell
        // Message previews are in the second row (bottom)
        const firstDiv = row.querySelector('div[class] > div[class] > div[class]');
        if (firstDiv) {
          const span = firstDiv.querySelector('span[title]');
          if (span) name = span.getAttribute('title') || '';
        }
      }

      // Last fallback: first span[title] in the row
      if (!name) {
        const span = row.querySelector('span[title]');
        if (span) name = span.getAttribute('title') || '';
      }

      if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;
      seen.add(name);

      // Extract phone from data-id attributes
      let phone = '';
      const el = row as HTMLElement;
      const allDataIds: string[] = [];
      if (el.getAttribute('data-id')) allDataIds.push(el.getAttribute('data-id')!);
      el.querySelectorAll('[data-id]').forEach(e => {
        const d = e.getAttribute('data-id');
        if (d) allDataIds.push(d);
      });
      if (el.parentElement?.getAttribute('data-id')) {
        allDataIds.push(el.parentElement.getAttribute('data-id')!);
      }

      for (const did of allDataIds) {
        const m = did.match(/(\d{7,15})@/);
        if (m) { phone = '+' + m[1]; break; }
      }

      if (!phone) {
        const digits = name.replace(/[^\d]/g, '');
        if (digits.length >= 7) phone = '+' + digits;
      }

      results.push({ name, phone });
    });

    // Fallback if listitem found nothing
    if (results.length === 0) {
      const side = document.querySelector('#side');
      if (side) {
        // Use cell-frame-title within side panel
        side.querySelectorAll('[data-testid="cell-frame-title"] span[title]').forEach((span) => {
          const name = span.getAttribute('title') || '';
          if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;
          seen.add(name);
          results.push({ name, phone: '' });
        });

        // If still nothing, broader search
        if (results.length === 0) {
          side.querySelectorAll('span[title]').forEach((span) => {
            const name = span.getAttribute('title') || '';
            if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')
                || name.includes('Buscar') || name.includes('Search')) return;
            seen.add(name);
            results.push({ name, phone: '' });
          });
        }
      }
    }

    return results.slice(0, 30);
  });

  // Safety net: filter any remaining junk
  const filtered = raw.filter(({ name }) => !isJunk(name));

  // Remove community headers: "X" followed by "X Something" → drop "X"
  const deduped = filtered.filter((c, i) => {
    const next = filtered[i + 1];
    if (next && next.name.startsWith(c.name) && next.name.length > c.name.length) {
      return false;
    }
    return true;
  });

  return deduped.slice(0, max);
}
