import type { Browser, Page } from 'puppeteer';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-web-security',
  '--disable-features=VizDisplayCompositor',
  '--disable-extensions',
  '--disable-plugins',
];

export async function initPuppeteer() {
  try {
    const { default: puppeteerExtra } = await import('puppeteer-extra');
    const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());
    console.log('[browser] puppeteer-extra + stealth');
    return puppeteerExtra;
  } catch {
    console.warn('[browser] falling back to plain puppeteer');
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer;
  }
}

export async function configurePage(page: Page): Promise<void> {
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 720 });
}

export async function launchBrowser(): Promise<{ browser: Browser; page: Page }> {
  const puppeteer = await initPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: LAUNCH_ARGS,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  }) as Browser;

  const page = await browser.newPage();
  await configurePage(page);
  return { browser, page };
}
