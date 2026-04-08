import path from "path";
import type { Page, ElementHandle } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".mov"];
const DOC_EXTS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip", ".rar", ".txt", ".csv"];
const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB

// Candidate data-icon values for the attach/plus button
const ATTACH_ICONS = ["plus", "attach-menu-plus", "clip", "attach"];

// Candidate selectors for image/photo option in attach menu
const IMAGE_OPTION_ICONS = ["attach-image", "image", "gallery", "media", "attach-photo"];

// Candidate selectors for document option in attach menu
const DOC_OPTION_ICONS = ["attach-document", "document", "attach-file"];

// Candidate selectors for poll option
const POLL_OPTION_ICONS = ["poll", "attach-poll"];

// Candidate selectors for camera option
const CAMERA_OPTION_ICONS = ["attach-camera", "camera"];

/**
 * Try to click an element matching one of the candidate data-icon values.
 * Returns the matched icon name, or null if none found.
 */
async function clickByIconCandidates(page: Page, candidates: string[]): Promise<string | null> {
  for (const icon of candidates) {
    const clicked = await page.evaluate((iconName: string) => {
      const el = document.querySelector(`span[data-icon="${iconName}"]`);
      if (el) {
        const btn = el.closest("button") || el.parentElement;
        if (btn) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, icon);
    if (clicked) return icon;
  }
  return null;
}

/**
 * List all data-icon values currently visible on the page (for debugging).
 */
async function listVisibleIcons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const icons = document.querySelectorAll("span[data-icon]");
    return Array.from(icons).map((el) => el.getAttribute("data-icon") || "");
  });
}

/**
 * Validate a file before attempting upload.
 */
async function validateFile(filePath: string, allowedExts: string[]): Promise<string> {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const file = Bun.file(resolved);

  if (!(await file.exists())) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (!allowedExts.includes(ext)) {
    throw new Error(`Extensión no soportada: ${ext}. Permitidas: ${allowedExts.join(", ")}`);
  }

  const size = file.size;
  if (size > MAX_FILE_SIZE) {
    const mb = (size / 1024 / 1024).toFixed(1);
    throw new Error(`Archivo muy grande: ${mb}MB (máximo 16MB)`);
  }

  return resolved;
}

/**
 * Click the attachment (+) button in the chat footer.
 */
async function clickAttachButton(page: Page): Promise<void> {
  const matched = await clickByIconCandidates(page, ATTACH_ICONS);
  if (matched) {
    await delay(1000);
    return;
  }

  // Fallback: try aria-label patterns
  const fallback = await page.evaluate(() => {
    const btns = document.querySelectorAll("footer button, header button");
    for (const btn of btns) {
      const label = btn.getAttribute("aria-label") || "";
      if (/adjunt|attach|plus|\+/i.test(label)) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (fallback) {
    await delay(1000);
    return;
  }

  const available = await listVisibleIcons(page);
  throw new Error(
    `No se encontró el botón de adjuntar. Iconos disponibles: ${available.join(", ")}`,
  );
}

/**
 * Find and use a file input to upload a file.
 * WhatsApp creates hidden <input type="file"> elements when menu options are clicked.
 */
async function uploadToFileInput(page: Page, filePath: string, accept?: string): Promise<boolean> {
  // Wait for file input to appear
  await delay(500);

  const selector = accept
    ? `input[type="file"][accept*="${accept}"]`
    : 'input[type="file"]';

  const fileInput = await page.$(selector);
  if (fileInput) {
    await (fileInput as ElementHandle<HTMLInputElement>).uploadFile(filePath);
    return true;
  }

  // Fallback: try any file input
  const anyInput = await page.$('input[type="file"]');
  if (anyInput) {
    await (anyInput as ElementHandle<HTMLInputElement>).uploadFile(filePath);
    return true;
  }

  return false;
}

/**
 * Type a caption in the media preview modal and send.
 */
async function typeCaptionAndSend(page: Page, caption?: string): Promise<void> {
  // Wait for preview modal to load
  await delay(3000);

  if (caption) {
    // Find caption textbox in the preview modal.
    // The modal overlay has a textbox that is NOT the footer compose box.
    const captionBox = await page.evaluate(() => {
      // Strategy 1: known data-testid
      const known = document.querySelector('[data-testid="media-caption-input-container"] [role="textbox"]');
      if (known) { (known as HTMLElement).click(); return true; }

      // Strategy 2: find all contenteditable textboxes, pick the one NOT in footer
      const boxes = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
      for (const box of boxes) {
        if (!box.closest("footer")) {
          (box as HTMLElement).click();
          return true;
        }
      }

      // Strategy 3: any contenteditable not in footer
      const editables = document.querySelectorAll('[contenteditable="true"]');
      for (const el of editables) {
        if (!el.closest("footer") && !el.closest("#side")) {
          (el as HTMLElement).click();
          return true;
        }
      }

      return false;
    });

    if (captionBox) {
      await delay(300);

      // Handle multi-line captions with Shift+Enter
      const lines = caption.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) {
          await page.keyboard.type(lines[i], { delay: 50 });
        }
        if (i < lines.length - 1) {
          await page.keyboard.down("Shift");
          await page.keyboard.press("Enter");
          await page.keyboard.up("Shift");
        }
      }
      await delay(500);
    }
  }

  // Click send button in modal
  const sent = await page.evaluate(() => {
    const sendIcon = document.querySelector('span[data-icon="send"]');
    if (sendIcon) {
      const btn = sendIcon.closest("button") || sendIcon.parentElement;
      if (btn) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!sent) {
    await page.keyboard.press("Enter");
  }

  await delay(5000);
}

/**
 * Send an image (or video) with optional caption.
 */
export async function sendImage(page: Page, filePath: string, caption?: string): Promise<void> {
  const resolved = await validateFile(filePath, IMAGE_EXTS);

  await clickAttachButton(page);

  // Try clicking image option in menu
  const clicked = await clickByIconCandidates(page, IMAGE_OPTION_ICONS);

  if (!clicked) {
    // Fallback: look for menu items by text
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="button"], li, [role="menuitem"]');
      for (const item of items) {
        const text = (item as HTMLElement).innerText || "";
        if (/foto|photo|image|video|media|galería|gallery/i.test(text)) {
          (item as HTMLElement).click();
          return;
        }
      }
    });
  }

  await delay(500);

  const uploaded = await uploadToFileInput(page, resolved, "image");
  if (!uploaded) {
    throw new Error("No se encontró el input de archivo para imágenes.");
  }

  await typeCaptionAndSend(page, caption);
}

/**
 * Send a document (PDF, etc.) with optional caption.
 */
export async function sendDocument(page: Page, filePath: string, caption?: string): Promise<void> {
  const resolved = await validateFile(filePath, DOC_EXTS);

  await clickAttachButton(page);

  const clicked = await clickByIconCandidates(page, DOC_OPTION_ICONS);

  if (!clicked) {
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="button"], li, [role="menuitem"]');
      for (const item of items) {
        const text = (item as HTMLElement).innerText || "";
        if (/document|archivo|file/i.test(text)) {
          (item as HTMLElement).click();
          return;
        }
      }
    });
  }

  await delay(500);

  const uploaded = await uploadToFileInput(page, resolved);
  if (!uploaded) {
    throw new Error("No se encontró el input de archivo para documentos.");
  }

  await typeCaptionAndSend(page, caption);
}

/**
 * Send a poll (group chats only).
 */
export async function sendPoll(page: Page, question: string, options: string[]): Promise<void> {
  if (options.length < 2) {
    throw new Error("Una encuesta necesita al menos 2 opciones.");
  }

  await clickAttachButton(page);

  const clicked = await clickByIconCandidates(page, POLL_OPTION_ICONS);

  if (!clicked) {
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="button"], li, [role="menuitem"]');
      for (const item of items) {
        const text = (item as HTMLElement).innerText || "";
        if (/encuesta|poll/i.test(text)) {
          (item as HTMLElement).click();
          return;
        }
      }
    });
  }

  await delay(2000);

  // Fill question — first textbox in the poll modal
  const textboxes = await page.$$('[role="dialog"] [role="textbox"], .overlay [role="textbox"]');

  if (textboxes.length === 0) {
    throw new Error(
      "No se encontró el modal de encuesta. Las encuestas solo funcionan en grupos.",
    );
  }

  // First textbox = question
  await textboxes[0].click();
  await delay(300);
  await page.keyboard.type(question, { delay: 30 });

  // Remaining textboxes = options (WhatsApp shows 2 by default, adds more as you type)
  for (let i = 0; i < options.length; i++) {
    // Get fresh list of textboxes (new ones appear as you fill)
    const currentBoxes = await page.$$('[role="dialog"] [role="textbox"], .overlay [role="textbox"]');
    const optionBox = currentBoxes[i + 1]; // +1 because first is the question

    if (optionBox) {
      await optionBox.click();
      await delay(200);
      await page.keyboard.type(options[i], { delay: 30 });
      await delay(300);
    }
  }

  await delay(500);

  // Click send
  const sent = await page.evaluate(() => {
    const sendIcon = document.querySelector('span[data-icon="send"]');
    if (sendIcon) {
      const btn = sendIcon.closest("button") || sendIcon.parentElement;
      if (btn) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!sent) {
    await page.keyboard.press("Enter");
  }

  await delay(3000);
}

/**
 * Take a photo with the camera and send it.
 * Requires visible browser (not headless/background mode).
 */
export async function sendCameraPhoto(page: Page, caption?: string): Promise<void> {
  await clickAttachButton(page);

  const clicked = await clickByIconCandidates(page, CAMERA_OPTION_ICONS);

  if (!clicked) {
    await page.evaluate(() => {
      const items = document.querySelectorAll('[role="button"], li, [role="menuitem"]');
      for (const item of items) {
        const text = (item as HTMLElement).innerText || "";
        if (/cámara|camera/i.test(text)) {
          (item as HTMLElement).click();
          return;
        }
      }
    });
  }

  // Wait for camera to activate
  await delay(4000);

  // Click capture button (large circular button)
  const captured = await page.evaluate(() => {
    // Look for the capture button by common patterns
    const btn = document.querySelector('[data-testid="camera-capture"]')
      || document.querySelector('[aria-label*="capture" i]')
      || document.querySelector('[aria-label*="captura" i]');
    if (btn) {
      (btn as HTMLElement).click();
      return true;
    }
    // Fallback: large circular button
    const circles = document.querySelectorAll('button[class*="capture"], [role="button"]');
    for (const c of circles) {
      const rect = (c as HTMLElement).getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50 && rect.width === rect.height) {
        (c as HTMLElement).click();
        return true;
      }
    }
    return false;
  });

  if (!captured) {
    throw new Error("No se pudo capturar la foto. Verifica que la cámara está disponible.");
  }

  await typeCaptionAndSend(page, caption);
}
