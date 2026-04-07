import puppeteer, { Browser, Page } from "puppeteer-core";
import {
  CHROME_PATH,
  LAUNCH_ARGS,
  DEFAULT_TIMEOUT,
  DEFAULT_VIEWPORT,
} from "../constants";

export async function launchBrowser(): Promise<Browser> {
  return await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    args: LAUNCH_ARGS,
    defaultViewport: DEFAULT_VIEWPORT,
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
