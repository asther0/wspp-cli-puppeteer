import puppeteer, { Browser, Page } from "puppeteer-core";
import path from "path";
import fs from "fs";
import {
  CHROME_PATH,
  LAUNCH_ARGS,
  DEFAULT_TIMEOUT,
  DEFAULT_VIEWPORT,
} from "../constants";

const WSPP_USER_DATA_DIR = path.join(process.cwd(), ".wspp-session");

export function hasSession(): boolean {
  return fs.existsSync(WSPP_USER_DATA_DIR);
}

export async function launchBrowser(persistSession = false, forceVisible = false): Promise<Browser> {
  const useHeadless = persistSession && hasSession() && !forceVisible;

  return await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: useHeadless ? "new" : false,
    args: LAUNCH_ARGS,
    defaultViewport: DEFAULT_VIEWPORT,
    ...(persistSession ? { userDataDir: WSPP_USER_DATA_DIR } : {}),
  });
}

export async function createPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT);
  return page;
}

export async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
}
