import type { Page } from 'puppeteer';
import type { PropertyRecord } from '@/db/database';
import type { ScraperDef } from './types';

const BASE_URL  = 'https://www.zumper.com';
const SEARCH_URL = `${BASE_URL}/apartments-for-rent/walla-walla-wa`;
const LOCATION  = 'Walla Walla, WA';

const LISTING_LINK_SEL = 'a[href*="/apartment-buildings/"], a[href*="/listings/"]';

// ── Strategy 1: __PRELOADED_STATE__ (Redux store) ────────────────────────────

function normalizeStateListings(raw: Record<string, unknown>[]): PropertyRecord[] {
  return raw.flatMap(item => {
    const minPrice = item.min_price as number | null;
    const maxPrice = item.max_price as number | null;
    let price = '';
    if (minPrice != null && maxPrice != null && minPrice !== maxPrice) price = `$${minPrice} – $${maxPrice}/mo`;
    else if (minPrice != null) price = `$${minPrice}/mo`;
    else if (maxPrice != null) price = `$${maxPrice}/mo`;

    const minBeds = item.min_bedrooms as number | null;
    const maxBeds = item.max_bedrooms as number | null;
    const beds =
      minBeds === 0 ? 'Studio'
      : minBeds != null ? (maxBeds != null && maxBeds !== minBeds ? `${minBeds}–${maxBeds}` : String(minBeds))
      : '';

    const minBaths = item.min_bathrooms as number | null;
    const maxBaths = item.max_bathrooms as number | null;
    const baths = minBaths != null
      ? (maxBaths != null && maxBaths !== minBaths ? `${minBaths}–${maxBaths}` : String(minBaths))
      : '';

    const urlPath = typeof item.url === 'string' ? item.url : null;
    const listingUrl = urlPath ? `${BASE_URL}${urlPath}` : '';

    const parts = [item.address, item.city, item.state].filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    );
    const address = parts.join(', ') || (item.building_name as string) || listingUrl;
    if (!address && !price) return [];

    return [{
      source: 'Zumper',
      address,
      price,
      beds,
      baths,
      sqft: '',
      listing_url: listingUrl,
      amenities: Array.isArray(item.amenity_tags)
        ? (item.amenity_tags as string[]).slice(0, 10)
        : undefined,
      location: LOCATION,
    } satisfies PropertyRecord];
  });
}

// ── Helpers shared by strategies 2 & 3 ───────────────────────────────────────

// Wait for at least one listing card link to appear.
async function waitForCards(page: Page): Promise<void> {
  await page.waitForFunction(
    (sel: string) => document.querySelectorAll(sel).length > 0,
    { timeout: 15000 },
    LISTING_LINK_SEL
  ).catch(() => {});
}

// Scroll to the bottom repeatedly until the listing count stops growing.
// This both triggers lazy-loaded cards and reveals the Next pagination button.
async function scrollAndLoadAll(page: Page): Promise<void> {
  let lastCount = 0;
  let stale = 0;
  while (stale < 5) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 2000));
    const count = await page.evaluate(
      (sel: string) => document.querySelectorAll(sel).length,
      LISTING_LINK_SEL
    );
    if (count > lastCount) {
      console.log(`[zumper] Scroll: ${count} listing cards visible`);
      lastCount = count;
      stale = 0;
    } else {
      stale++;
    }
  }
}

// Return the href of the "Next" pagination link, or null if it doesn't exist
// (i.e. we're on the last page, which shows "Back" instead).
async function getNextPageHref(page: Page): Promise<string | null> {
  return page.evaluate((base: string) => {
    const next = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).find(
      a => a.textContent?.trim() === 'Next' && a.href.includes('?page=')
    );
    if (!next) return null;
    // href may be relative or absolute
    return next.href.startsWith('http') ? next.href : `${base}${next.getAttribute('href')}`;
  }, BASE_URL);
}

// Extract all listing cards visible on the current page.
// We anchor on the bedBathPriceContainer (which holds price/beds/baths), then walk
// UP to the card root and look for the listing <a> link from there — because the
// price/beds elements are SIBLINGS of the <a>, not descendants of it.
async function extractPageListings(page: Page): Promise<PropertyRecord[]> {
  return page.evaluate((linkSel: string, location: string) => {
    const seen = new Set<string>();
    const results: PropertyRecord[] = [];

    // Build a URL→card map from the known link selector first, so we can look up
    // cards by URL to avoid processing the same card twice.
    const linkMap = new Map<string, Element>();
    document.querySelectorAll<HTMLAnchorElement>(linkSel).forEach(a => {
      if (a.href && !linkMap.has(a.href)) linkMap.set(a.href, a);
    });

    // Anchor on bedBathPriceContainer elements — each represents one listing card.
    document.querySelectorAll('[class*="bedBathPriceContainer"]').forEach(container => {
      // Walk up the DOM to find the card root (the element that contains both the
      // listing link and the bedBathPriceContainer).
      let root: Element | null = container;
      let link: HTMLAnchorElement | null = null;
      while (root && root !== document.body) {
        link = root.querySelector<HTMLAnchorElement>(linkSel);
        if (link) break;
        root = root.parentElement;
      }

      const url = link?.href ?? '';
      if (!url || seen.has(url)) return;
      seen.add(url);

      // Address: look for address/title text within the card root
      const addrEl =
        root?.querySelector('[class*="address" i]') ??
        root?.querySelector('[class*="Address"]') ??
        root?.querySelector('[class*="title" i]') ??
        root?.querySelector('[class*="Title"]') ??
        root?.querySelector('h2, h3, h4');

      // Beds: bedsRangeText that is NOT the bath element
      const bedsEl = container.querySelector<Element>(
        '[class*="bedsRangeText"]:not([class*="bathRange"])'
      );
      const beds = (bedsEl?.textContent?.trim() ?? '').replace(/\s*beds?\s*/i, '').trim();

      // Baths: element with bathRangeText class
      const bathsEl = container.querySelector('[class*="bathRangeText"]');
      const baths = (bathsEl?.textContent?.trim() ?? '').replace(/\s*baths?\s*/i, '').trim();

      // Price
      const priceEl = container.querySelector('[class*="longTermPrice"]');
      const price = priceEl?.textContent?.trim() ?? '';

      results.push({
        source: 'Zumper',
        address: addrEl?.textContent?.trim() || url,
        price,
        beds,
        baths,
        sqft: '',
        listing_url: url,
        location,
      });
    });

    // Fallback: any linked cards we found via linkSel that had no bedBathPriceContainer
    // (e.g. cards without price info — still worth recording)
    linkMap.forEach((a, url) => {
      if (seen.has(url)) return;
      seen.add(url);
      const addrEl =
        a.querySelector('[class*="address" i]') ??
        a.querySelector('[class*="Address"]') ??
        a.querySelector('[class*="title" i]') ??
        a.querySelector('h2, h3, h4');
      results.push({
        source: 'Zumper',
        address: addrEl?.textContent?.trim() || url,
        price: '',
        beds: '',
        baths: '',
        sqft: '',
        listing_url: url,
        location,
      });
    });

    return results;
  }, LISTING_LINK_SEL, LOCATION);
}

// ── Strategy 2: paginated DOM scrape ─────────────────────────────────────────

async function scrapeAllPages(page: Page): Promise<PropertyRecord[]> {
  const all: PropertyRecord[] = [];
  let pageNum = 1;

  while (true) {
    await waitForCards(page);
    await scrollAndLoadAll(page); // loads lazy cards + reveals Next button at bottom
    const listings = await extractPageListings(page);
    all.push(...listings);
    console.log(`[zumper] Page ${pageNum}: ${listings.length} listings (running total: ${all.length})`);

    const nextHref = await getNextPageHref(page);
    if (!nextHref) {
      console.log('[zumper] No "Next" link — pagination complete');
      break;
    }

    console.log(`[zumper] Navigating to page ${pageNum + 1}: ${nextHref}`);
    await page.goto(nextHref, { waitUntil: 'networkidle2', timeout: 60000 });
    pageNum++;
  }

  return all;
}

// ── Strategy 3: individual listing page (last resort) ────────────────────────

async function scrapeListingPage(page: Page, url: string): Promise<PropertyRecord | null> {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    return page.evaluate((listingUrl: string, location: string) => {
      // Primary: <tbody> details table  <th> label / <td> value
      const tableData: Record<string, string> = {};
      document.querySelectorAll('tbody tr').forEach(tr => {
        const label = tr.querySelector('th')?.textContent?.trim().toLowerCase() ?? '';
        const value = tr.querySelector('td')?.textContent?.trim() ?? '';
        if (label && value) tableData[label] = value;
      });

      // Fallback: card layout classes
      const bedsCard  = document.querySelector('[class*="bedsRangeText"]:not([class*="bathRange"])')?.textContent?.trim().replace(/\s*beds?\s*/i, '').trim();
      const bathsCard = document.querySelector('[class*="bathRangeText"]')?.textContent?.trim().replace(/\s*baths?\s*/i, '').trim();
      const priceCard = document.querySelector('[class*="longTermPrice"]')?.textContent?.trim();

      const price = tableData['monthly rent'] || priceCard || '';
      const beds  = tableData['beds']  || bedsCard  || '';
      const baths = tableData['baths'] || bathsCard || '';
      const sqft  = tableData['sqft']  ? tableData['sqft'] + ' sqft' : '';

      const address = document.querySelector('h1')?.textContent?.trim() || document.title;
      if (!address && !price) return null;

      return { source: 'Zumper', address, price, beds, baths, sqft, listing_url: listingUrl, location } as PropertyRecord;
    }, url, LOCATION);
  } catch (err) {
    console.error(`[zumper] Error scraping ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function scrape(page: Page): Promise<PropertyRecord[]> {
  console.log('[zumper] Navigating to', SEARCH_URL);
  await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log(`[zumper] Page title: "${await page.title()}"`);

  // ── Strategy 1: Redux store ──────────────────────────────────────────────
  const stateListings = await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    const state = win.__PRELOADED_STATE__ as Record<string, unknown> | undefined;
    const arr = (state?.listables as Record<string, unknown> | undefined)?.listables;
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  }) as Record<string, unknown>[] | null;

  if (stateListings) {
    console.log(`[zumper] Found ${stateListings.length} listings in __PRELOADED_STATE__`);
    return normalizeStateListings(stateListings);
  }

  // ── Strategy 2: paginated DOM scrape ────────────────────────────────────
  console.log('[zumper] __PRELOADED_STATE__ empty — scraping paginated DOM');
  const cardListings = await scrapeAllPages(page);

  if (cardListings.length > 0) {
    console.log(`[zumper] Total from DOM pagination: ${cardListings.length} listings`);
    return cardListings;
  }

  // ── Strategy 3: individual pages (last resort) ──────────────────────────
  console.log('[zumper] No card data — falling back to individual page scraping');

  const links = await page.evaluate((sel: string) => {
    const seen = new Set<string>();
    const urls: string[] = [];
    document.querySelectorAll<HTMLAnchorElement>(sel).forEach(a => {
      if (a.href && !seen.has(a.href)) { seen.add(a.href); urls.push(a.href); }
    });
    return urls;
  }, LISTING_LINK_SEL);

  if (links.length === 0) {
    const info = await page.evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      return {
        stateKeys: Object.keys(win).filter(k => /state|store|data/i.test(k)),
        snippet: document.body.innerHTML.substring(0, 1000),
      };
    });
    console.warn('[zumper] No listing links. Global state keys:', info.stateKeys);
    console.warn('[zumper] Snippet:', info.snippet);
    return [];
  }

  const results: PropertyRecord[] = [];
  for (const url of links) {
    const record = await scrapeListingPage(page, url);
    if (record) results.push(record);
    await new Promise(r => setTimeout(r, 600));
  }
  return results;
}

export const zumperScraper: ScraperDef = {
  key: 'zumper',
  label: 'Zumper',
  dbSource: 'Zumper',
  color: 'bg-teal-600 hover:bg-teal-700',
  scrape,
};
