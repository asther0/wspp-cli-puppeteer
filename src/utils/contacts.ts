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

    // Invisible Unicode chars that WhatsApp wraps around message previews
    const invisibleRe = /[\u200e\u200f\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\uFEFF]/;

    // Strategy 1: [role="listitem"] rows with span[title]
    const chatRows = document.querySelectorAll('[role="listitem"]');
    chatRows.forEach((row) => {
      const allTitleSpans = row.querySelectorAll('span[title]');
      if (allTitleSpans.length === 0) return;

      // Find the first span[title] that is NOT a message preview
      // Message previews have invisible Unicode wrapper chars, contact names don't
      let name = '';
      for (const span of allTitleSpans) {
        const title = span.getAttribute('title') || '';
        if (title && !invisibleRe.test(title)) {
          name = title;
          break;
        }
      }

      if (!name || seen.has(name) || name.length > 60 || name.startsWith('http')) return;
      seen.add(name);

      // Extract phone: search data-id in row, children, and parent
      let phone = '';
      const el = row as HTMLElement;

      // Look for data-id with phone@c.us pattern anywhere in/around the row
      const allDataIds: string[] = [];
      if (el.getAttribute('data-id')) allDataIds.push(el.getAttribute('data-id')!);
      el.querySelectorAll('[data-id]').forEach(e => {
        const d = e.getAttribute('data-id');
        if (d) allDataIds.push(d);
      });
      // Also check parent (WhatsApp sometimes nests listitem inside a div with data-id)
      if (el.parentElement?.getAttribute('data-id')) {
        allDataIds.push(el.parentElement.getAttribute('data-id')!);
      }
      // Check for testid that contains phone
      const testId = el.getAttribute('data-testid')
        || el.querySelector('[data-testid]')?.getAttribute('data-testid')
        || '';
      if (testId) allDataIds.push(testId);

      for (const did of allDataIds) {
        const m = did.match(/(\d{7,15})@/);
        if (m) { phone = '+' + m[1]; break; }
      }

      // If name IS a phone number, use it
      if (!phone) {
        const digits = name.replace(/[^\d]/g, '');
        if (digits.length >= 7) {
          phone = '+' + digits;
        }
      }

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

  const filtered = raw.filter(({ name }) => !isJunk(name));

  // Remove community headers: if "X" is immediately followed by "X Something", drop "X"
  const deduped = filtered.filter((c, i) => {
    const next = filtered[i + 1];
    if (next && next.name.startsWith(c.name) && next.name.length > c.name.length) {
      return false;
    }
    return true;
  });

  return deduped.slice(0, max);
}
