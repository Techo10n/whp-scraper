import type { Page } from 'puppeteer';
import type { PropertyRecord } from '@/db/database';
import type { ScraperDef } from './types';

const REDFIN_URL = 'https://www.redfin.com/city/19187/WA/Walla-Walla';
const LOCATION = 'Walla Walla, WA';

async function scrollToBottom(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      let totalHeight = 0;
      const distance = 600;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight * 0.9 - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

async function scrape(page: Page): Promise<PropertyRecord[]> {
  console.log('[redfin] Navigating to', REDFIN_URL);
  await page.goto(REDFIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const all: PropertyRecord[] = [];

  while (true) {
    await page.waitForSelector('.bp-Homecard', { timeout: 15000 });
    await scrollToBottom(page);
    await new Promise(r => setTimeout(r, 2000));

    const cards = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.bp-Homecard')).map(card => {
        const address = card.querySelector('.bp-Homecard__Address')?.textContent?.trim() ?? '';
        const price = card.querySelector('.bp-Homecard__Price--value')?.textContent?.trim() ?? '';
        const beds = card.querySelector('.bp-Homecard__Stats--beds')?.textContent?.trim() ?? '';
        const baths = card.querySelector('.bp-Homecard__Stats--baths')?.textContent?.trim() ?? '';
        const sqftValue = card.querySelector('.bp-Homecard__LockedStat--value')?.textContent?.trim() ?? '';
        const sqftLabel = card.querySelector('.bp-Homecard__LockedStat--label')?.textContent ?? '';
        const sqft = sqftLabel.includes('sq ft') ? sqftValue + ' sq ft' : '';
        const keyFacts = Array.from(card.querySelectorAll('.KeyFacts-item'))
          .map(el => el.textContent?.trim())
          .filter((t): t is string => !!t);
        const link = card.querySelector('a[href]') as HTMLAnchorElement | null;
        return { address, price, beds, baths, sqft, listingUrl: link?.href ?? '', keyFacts: keyFacts.slice(0, 5) };
      }).filter(p => p.address || p.price);
    });

    for (const c of cards) {
      all.push({
        source: 'Redfin',
        address: c.address,
        price: c.price,
        beds: c.beds,
        baths: c.baths,
        sqft: c.sqft,
        listing_url: c.listingUrl,
        key_facts: c.keyFacts,
        location: LOCATION,
      });
    }

    console.log(`[redfin] Total so far: ${all.length}`);

    const nextButton = await page.$('button[aria-label="next"]');
    const isDisabled: boolean = await page.evaluate((btn: Element | null) => {
      return !!btn && (btn.classList.contains('PageArrow--hidden') || btn.hasAttribute('disabled'));
    }, nextButton as Element | null);

    if (!nextButton || isDisabled) break;

    await nextButton.click();
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  }

  return all;
}

export const redfinScraper: ScraperDef = {
  key: 'redfin',
  label: 'Redfin',
  dbSource: 'Redfin',
  color: 'bg-red-600 hover:bg-red-700',
  scrape,
};
