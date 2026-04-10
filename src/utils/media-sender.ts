import type { Page } from "puppeteer-core";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Real WhatsApp Web icon: "plus-rounded" (discovered via wspp:debug-icons)
const ATTACH_ICONS = ["plus-rounded", "attach-menu-plus", "clip", "attach"];

// Candidate selectors for each menu option (data-icon based, fallback to text/aria)
const POLL_OPTION_ICONS = ["poll", "attach-poll"];
const CAMERA_OPTION_ICONS = ["attach-camera", "camera"];
const DOCUMENT_OPTION_ICONS = ["attach-document", "document", "attach-doc", "attach-file"];

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
 * Click the attachment button in the chat footer.
 * Priority: aria-label (reliable) → data-icon → title attribute.
 */
async function clickAttachButton(page: Page): Promise<void> {
  // Strategy 1: aria-label / title (most reliable across languages)
  const ariaClicked = await page.evaluate(() => {
    // Look in the header area of the conversation (not the sidebar)
    const containers = document.querySelectorAll("header, #main header, [data-tab]");
    for (const container of containers) {
      const btns = container.querySelectorAll("button, [role='button']");
      for (const btn of btns) {
        const label = (btn.getAttribute("aria-label") || btn.getAttribute("title") || "").toLowerCase();
        if (label.includes("adjunt") || label.includes("attach")) {
          (btn as HTMLElement).click();
          return label;
        }
      }
    }
    // Also check all buttons on the page
    const allBtns = document.querySelectorAll("button, [role='button']");
    for (const btn of allBtns) {
      const label = (btn.getAttribute("aria-label") || btn.getAttribute("title") || "").toLowerCase();
      if (label.includes("adjunt") || label.includes("attach")) {
        (btn as HTMLElement).click();
        return label;
      }
    }
    return null;
  });

  if (ariaClicked) {
    await delay(1000);
    return;
  }

  // Strategy 2: data-icon candidates (skip "plus" — that's emoji/sticker)
  const iconClicked = await clickByIconCandidates(page, ATTACH_ICONS);
  if (iconClicked) {
    await delay(1000);
    return;
  }

  const available = await listVisibleIcons(page);
  throw new Error(
    `No se encontró el botón de adjuntar. Iconos disponibles: ${available.join(", ")}`,
  );
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
 * Click a menu option in the attachment menu by icon or text.
 */
async function clickMenuOption(page: Page, iconCandidates: string[], textPatterns: RegExp): Promise<void> {
  const clicked = await clickByIconCandidates(page, iconCandidates);
  if (clicked) return;

  // Fallback: match by visible text in menu items
  const textClicked = await page.evaluate((pattern: string) => {
    const re = new RegExp(pattern, "i");
    const items = document.querySelectorAll('[role="button"], li, [role="menuitem"], button');
    for (const item of items) {
      const text = (item as HTMLElement).innerText || "";
      const label = item.getAttribute("aria-label") || "";
      if (re.test(text) || re.test(label)) {
        (item as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, textPatterns.source);

  if (!textClicked) {
    const available = await listVisibleIcons(page);
    throw new Error(`No se encontró la opción en el menú. Iconos: ${available.join(", ")}`);
  }
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

  await delay(3000);

  // Fill question — find textboxes inside the poll modal
  // Use broad selectors: dialog, overlay, or any modal-like container
  const TEXTBOX_SEL = '[role="dialog"] [role="textbox"], .overlay [role="textbox"], [data-animate-modal-popup] [role="textbox"]';
  const textboxes = await page.$$(TEXTBOX_SEL);

  if (textboxes.length === 0) {
    // Retry once with broader selector (community groups may use different containers)
    await delay(2000);
    const allTextboxes = await page.$$('[role="textbox"][contenteditable="true"]');
    // Filter out the main chat textbox (in footer)
    const modalBoxes = [];
    for (const box of allTextboxes) {
      const inFooter = await box.evaluate((el) => !!el.closest("footer"));
      if (!inFooter) modalBoxes.push(box);
    }

    if (modalBoxes.length === 0) {
      throw new Error(
        "No se encontró el modal de encuesta. Las encuestas solo funcionan en grupos.",
      );
    }

    // Use the filtered boxes
    await modalBoxes[0].click();
    await delay(300);
    await page.keyboard.type(question, { delay: 30 });

    for (let i = 0; i < options.length; i++) {
      const freshBoxes = await page.$$('[role="textbox"][contenteditable="true"]');
      const freshModal = [];
      for (const box of freshBoxes) {
        const inFooter = await box.evaluate((el) => !!el.closest("footer"));
        if (!inFooter) freshModal.push(box);
      }
      const optionBox = freshModal[i + 1];
      if (optionBox) {
        await optionBox.click();
        await delay(200);
        await page.keyboard.type(options[i], { delay: 30 });
        await delay(300);
      }
    }
  } else {
    // First textbox = question
    await textboxes[0].click();
    await delay(300);
    await page.keyboard.type(question, { delay: 30 });

    // Remaining textboxes = options (WhatsApp shows 2 by default, adds more as you type)
    for (let i = 0; i < options.length; i++) {
      // Get fresh list of textboxes (new ones appear as you fill)
      const currentBoxes = await page.$$(TEXTBOX_SEL);
      const optionBox = currentBoxes[i + 1]; // +1 because first is the question

      if (optionBox) {
        await optionBox.click();
        await delay(200);
        await page.keyboard.type(options[i], { delay: 30 });
        await delay(300);
      }
    }
  }

  await delay(1000);

  // Click send — use the exact data-icon discovered: "wds-ic-send-filled"
  const sent = await page.evaluate(() => {
    // 1. Try the exact poll send icon (discovered via debug)
    const exactIcon = document.querySelector('span[data-icon="wds-ic-send-filled"]');
    if (exactIcon) {
      const btn = exactIcon.closest("button") || exactIcon.parentElement;
      if (btn) { (btn as HTMLElement).click(); return "wds-ic-send-filled"; }
    }

    // 2. Fallback: try classic send icon
    const sendIcon = document.querySelector('span[data-icon="send"]');
    if (sendIcon) {
      const btn = sendIcon.closest("button") || sendIcon.parentElement;
      if (btn) { (btn as HTMLElement).click(); return "send-icon"; }
    }

    // 3. Try button with aria-label "Send" or "Enviar"
    const allBtns = document.querySelectorAll('button, [role="button"]');
    for (const btn of allBtns) {
      const label = (btn.getAttribute("aria-label") || "").toLowerCase();
      if (label === "send" || label === "enviar") {
        (btn as HTMLElement).click();
        return `aria: ${label}`;
      }
    }

    return null;
  });

  if (!sent) {
    await page.keyboard.press("Enter");
  }

  await delay(3000);
}

/**
 * Send a document (PDF, DOCX, etc.) from the local filesystem.
 * Uses the WhatsApp Web attachment menu → Document option.
 * The file path must be absolute.
 */
export async function sendDocument(page: Page, filePath: string, caption?: string): Promise<void> {
  await clickAttachButton(page);

  // Intercept the file chooser dialog and click the Document option simultaneously.
  // waitForFileChooser() registers its listener synchronously before the click fires.
  let uploaded = false;

  try {
    const [fileChooser] = await Promise.all([
      page.waitForFileChooser({ timeout: 8000 }),
      clickMenuOption(page, DOCUMENT_OPTION_ICONS, /documento|document/),
    ]);
    await fileChooser.accept([filePath]);
    uploaded = true;
  } catch {
    // Fallback: some WhatsApp Web versions expose a hidden <input type="file"> in the DOM
    await delay(2000);
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(filePath);
      uploaded = true;
    }
  }

  if (!uploaded) {
    throw new Error(
      "No se pudo abrir el selector de archivos. Verifica que WhatsApp Web está activo.",
    );
  }

  // Wait for document to upload and the preview modal to render.
  await delay(5000);

  // Debug: capture the preview state so we can inspect what's rendered.
  await page.screenshot({ path: "wspp-doc-debug.png" });

  // Dump visible icons and buttons to wspp-doc-debug.json for inspection.
  const debugInfo = await page.evaluate(() => {
    const icons = Array.from(document.querySelectorAll("span[data-icon]")).map((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return {
        icon: el.getAttribute("data-icon"),
        visible: rect.width > 0 && rect.height > 0,
        top: Math.round(rect.top),
        left: Math.round(rect.left),
      };
    });
    const btns = Array.from(document.querySelectorAll("button, [role='button']")).map((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return {
        label: el.getAttribute("aria-label") || el.getAttribute("data-testid") || "",
        visible: rect.width > 0 && rect.height > 0,
        top: Math.round(rect.top),
        left: Math.round(rect.left),
      };
    });
    return { icons, btns };
  });
  await Bun.write("wspp-doc-debug.json", JSON.stringify(debugInfo, null, 2));

  // Type caption if provided.
  if (caption) {
    const captionFocused = await page.evaluate(() => {
      const known = document.querySelector(
        '[data-testid="media-caption-input-container"] [role="textbox"]',
      );
      if (known) { (known as HTMLElement).click(); return true; }
      const boxes = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
      for (const box of boxes) {
        if (!box.closest("footer") && !box.closest("#side")) {
          (box as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (captionFocused) {
      await delay(300);
      const lines = caption.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) await page.keyboard.type(lines[i], { delay: 50 });
        if (i < lines.length - 1) {
          await page.keyboard.down("Shift");
          await page.keyboard.press("Enter");
          await page.keyboard.up("Shift");
        }
      }
      await delay(500);
    }
  }

  // Send: the preview modal overlay is appended AFTER the footer in the DOM, so
  // the LAST visible span[data-icon="send"] belongs to the modal, not the footer.
  const sendResult = await page.evaluate(() => {
    const allSend = Array.from(document.querySelectorAll('span[data-icon="send"]'));
    const visible = allSend.filter((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    if (visible.length > 0) {
      const icon = visible[visible.length - 1]; // last = modal send button
      const btn = icon.closest("button") || icon.parentElement;
      if (btn) {
        (btn as HTMLElement).click();
        return `last-visible[${visible.length - 1}/${allSend.length}]`;
      }
    }

    // Fallback: visible button with aria-label send/enviar
    const allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const btn of allBtns) {
      const label = (btn.getAttribute("aria-label") || "").toLowerCase();
      const rect = (btn as HTMLElement).getBoundingClientRect();
      if ((label === "send" || label === "enviar") && rect.width > 0) {
        (btn as HTMLElement).click();
        return `aria:${label}`;
      }
    }
    return null;
  });

  if (!sendResult) {
    await page.keyboard.press("Enter");
  }

  await delay(4000);
}

/**
 * Take a photo with the camera and send it.
 * Includes a visible countdown timer before capture.
 * Requires visible browser (not headless/background mode).
 */
export async function sendCameraPhoto(page: Page, timerSeconds = 3, caption?: string): Promise<void> {
  await clickAttachButton(page);

  const clicked = await clickByIconCandidates(page, CAMERA_OPTION_ICONS);

  if (!clicked) {
    await clickMenuOption(page, CAMERA_OPTION_ICONS, /cámara|camera/);
  }

  // Wait for camera to activate
  await delay(4000);

  // Countdown timer — overlay on the browser page + terminal output
  if (timerSeconds > 0) {
    console.log();
    for (let i = timerSeconds; i > 0; i--) {
      // Show big number overlay in browser
      await page.evaluate((num: number) => {
        let overlay = document.getElementById("wspp-timer-overlay");
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "wspp-timer-overlay";
          overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;z-index:99999;pointer-events:none;";
          document.body.appendChild(overlay);
        }
        overlay.innerHTML = `<span style="font-size:120px;font-weight:bold;color:#fff;text-shadow:0 0 40px rgba(0,0,0,0.8),0 0 10px rgba(0,0,0,0.6);">${num}</span>`;
      }, i);
      // Terminal countdown
      console.log(`  ⏱️  ${i}...`);
      await delay(1000);
    }
    console.log(`  📸 Click!\n`);

    // Remove overlay
    await page.evaluate(() => {
      document.getElementById("wspp-timer-overlay")?.remove();
    });
  }

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
