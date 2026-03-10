import type { Page } from 'puppeteer';
import type { PropertyRecord } from '@/db/database';
import type { ScraperDef } from './types';

const LOCATION = 'Walla Walla, WA';
const MAX_LISTINGS = 25;

// Walla Walla falls under the Tri-Cities (kpr) Craigslist region
const URLS = {
  sale: 'https://kpr.craigslist.org/search/walla-walla-wa/reo',
  rentals: 'https://kpr.craigslist.org/search/walla-walla-wa/apa',
};

async function getListingLinks(page: Page, url: string): Promise<string[]> {
  console.log(`[craigslist] Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  const title = await page.title();
  console.log(`[craigslist] Page title: "${title}"`);

  // Listings are JS-rendered — wait until at least one link appears in the DOM
  const renderSelectors = [
    'a.posting-title',
    'a.text-only.posting-title',
    '.cl-search-result',
    'li.result-row',
    'a.result-title',
  ];
  for (const sel of renderSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      console.log(`[craigslist] Listings rendered with selector: ${sel}`);
      break;
    } catch { /* try next */ }
  }

  return page.evaluate(() => {
    const seen = new Set<string>();
    const links: string[] = [];
    const add = (href: string) => { if (href && !seen.has(href)) { seen.add(href); links.push(href); } };

    // New CL design (2024): a.posting-title
    document.querySelectorAll('a.posting-title').forEach(a => add((a as HTMLAnchorElement).href));

    // Old CL design: a.result-title / a.hdrlnk
    if (links.length === 0) {
      document.querySelectorAll('a.result-title, a.hdrlnk').forEach(a => add((a as HTMLAnchorElement).href));
    }

    // Generic fallback: any link matching CL listing URL pattern /d/.../DIGITS.html
    if (links.length === 0) {
      document.querySelectorAll('a[href]').forEach(a => {
        const href = (a as HTMLAnchorElement).href;
        if (/craigslist\.org\/.+\/d\/.+\/\d+\.html/.test(href)) add(href);
      });
    }

    return links;
  });
}

async function scrapeListing(
  page: Page,
  url: string,
  dbSource: string
): Promise<PropertyRecord | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const data = await page.evaluate(
      (listingUrl: string, source: string, location: string) => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? '';

        const title =
          getText('#titletextonly') ||
          getText('span.titletextonly') ||
          getText('.postingtitle') ||
          '';
        const price = getText('span.price') || getText('.price') || '';
        const address =
          getText('.mapaddress') ||
          getText('div.mapbox p.mapaddress') ||
          '';
        const description = getText('#postingbody')?.substring(0, 500) ?? '';
        const phone =
          (document.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null)
            ?.href?.replace('tel:', '') ?? '';

        let beds = '', baths = '', sqft = '';
        document.querySelectorAll('.attrgroup span').forEach(span => {
          const text = span.textContent?.trim() ?? '';
          const brBa = text.match(/^(\d+)BR\s*\/\s*(\d+)Ba/i);
          if (brBa) { beds = brBa[1]; baths = brBa[2]; return; }
          if (!beds) { const m = text.match(/(\d+)\s*(?:BR|bed(?:room)?)/i); if (m) beds = m[1]; }
          if (!baths) { const m = text.match(/(\d+)\s*(?:Ba|bath)/i); if (m) baths = m[1]; }
          if (!sqft) { const m = text.match(/(\d[\d,]*)\s*ft[²2]?/i); if (m) sqft = m[1].replace(',', '') + ' sqft'; }
        });

        if (!title && !price && !address) return null;
        return { source, address: address || title || listingUrl, price, beds, baths, sqft, listing_url: listingUrl, description, phone, location };
      },
      url,
      dbSource,
      LOCATION
    ) as PropertyRecord | null;

    return data;
  } catch (err) {
    console.error(`[craigslist] Error scraping ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function makeScraper(variant: 'sale' | 'rentals'): (page: Page) => Promise<PropertyRecord[]> {
  const dbSource = variant === 'sale' ? 'Craigslist (For Sale)' : 'Craigslist (Rentals)';
  return async (page: Page) => {
    const links = await getListingLinks(page, URLS[variant]);
    console.log(`[craigslist-${variant}] Found ${links.length} listing links`);

    const results: PropertyRecord[] = [];
    for (const url of links.slice(0, MAX_LISTINGS)) {
      const record = await scrapeListing(page, url, dbSource);
      if (record) results.push(record);
      await new Promise(r => setTimeout(r, 700));
    }
    return results;
  };
}

export const craigslistSaleScraper: ScraperDef = {
  key: 'craigslist-sale',
  label: 'Craigslist (For Sale)',
  dbSource: 'Craigslist (For Sale)',
  color: 'bg-orange-500 hover:bg-orange-600',
  scrape: makeScraper('sale'),
};

export const craigslistRentalsScraper: ScraperDef = {
  key: 'craigslist-rentals',
  label: 'Craigslist (Rentals)',
  dbSource: 'Craigslist (Rentals)',
  color: 'bg-amber-500 hover:bg-amber-600',
  scrape: makeScraper('rentals'),
};
