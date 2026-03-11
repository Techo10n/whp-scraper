import type { Page } from 'puppeteer';

const SEARCH_URL =
  'https://propertysearch.co.walla-walla.wa.us/PropertyAccess/propertysearch.aspx?cid=0';

export interface AssessorDetails {
  beds?: string;
  baths?: string;
  sqft?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Split "123 Main St, Walla Walla, WA 99362" → { number: "123", name: "Main St" }
export function parseStreetAddress(
  address: string,
): { number: string; name: string } | null {
  const match = address.match(/^(\d+[A-Za-z]?)\s+([^,]+)/);
  if (!match) return null;
  return { number: match[1].trim(), name: match[2].trim() };
}

// Search page text for a labeled numeric value.
// Handles "Bedrooms: 3", "Bedrooms\n3", "Bedrooms  3" etc.
function extractValue(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(String.raw`${label}[\s:]+(\d[\d,.]*)`, 'i');
    const match = text.match(pattern);
    if (match) return match[1].replace(/,/g, '').trim();
  }
  return undefined;
}

export async function enrichFromAssessor(
  page: Page,
  address: string,
): Promise<AssessorDetails | null> {
  const parsed = parseStreetAddress(address);
  if (!parsed) {
    console.log(`[assessor] Skipping unparseable address: "${address}"`);
    return null;
  }

  try {
    // ── 1. Load the search page ───────────────────────────────────────────
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 30_000 });

    // ── 2. Select the "Address" option in the search-type dropdown ────────
    await page.evaluate(() => {
      const sel = document.querySelector('.searchTypeSelect') as HTMLSelectElement | null;
      if (!sel) return;
      for (const opt of Array.from(sel.options)) {
        if (opt.text.toLowerCase().includes('address')) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    });
    await sleep(700);

    // ── 3. Fill street number ─────────────────────────────────────────────
    const numInput = await page.$(
      'input[id*="treetNumber"], input[name*="treetNumber"],' +
      'input[id*="StrNum"], input[name*="StrNum"],' +
      'input[id*="streetnum" i], input[name*="streetnum" i]',
    );
    if (!numInput) {
      console.log(`[assessor] Street number input not found (${address})`);
      return null;
    }
    await numInput.click({ clickCount: 3 });
    await numInput.type(parsed.number);

    // ── 4. Fill street name ───────────────────────────────────────────────
    const nameInput = await page.$(
      'input[id*="treetName"], input[name*="treetName"],' +
      'input[id*="StrName"], input[name*="StrName"],' +
      'input[id*="streetname" i], input[name*="streetname" i]',
    );
    if (!nameInput) {
      console.log(`[assessor] Street name input not found (${address})`);
      return null;
    }
    await nameInput.click({ clickCount: 3 });
    await nameInput.type(parsed.name);

    // ── 5. Submit the form ────────────────────────────────────────────────
    const submitBtn = await page.$(
      'input[type="submit"][value*="Search" i],' +
      'button[type="submit"],' +
      'input[id*="search" i][type="submit"]',
    );
    if (!submitBtn) {
      console.log(`[assessor] Search button not found (${address})`);
      return null;
    }
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }),
      submitBtn.click(),
    ]);

    // ── 6. Click the first result ─────────────────────────────────────────
    const resultLink = await page.$(
      'table a[href*="Account"], table a[href*="account"],' +
      'table a[href*="Detail"], table a[href*="detail"],' +
      '.searchResults a, #searchResults a,' +
      'table.results a, table td a',
    );
    if (!resultLink) {
      console.log(`[assessor] No results for "${address}"`);
      return null;
    }
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30_000 }),
      resultLink.click(),
    ]);

    // ── 7. Extract from the property detail page ──────────────────────────
    const pageText = await page.evaluate(() => document.body.innerText);

    const beds = extractValue(pageText, [
      'Bedrooms', 'Bed Rooms', 'Beds', 'No\\.?\\s*Beds',
    ]);
    const baths = extractValue(pageText, [
      'Bathrooms', 'Bath Rooms', 'Full Baths', 'Total Baths', 'Baths', 'Bath',
    ]);
    // This portal embeds sqft inline in the improvement line, number-first:
    // "Improvement #1:  RESIDENTIAL  State Code:  11  1186.0 sqft  Value: $371,870"
    // extractValue (label: number) won't match, so use a direct forward-match instead.
    const sqftMatch = pageText.match(/([\d,]+(?:\.\d+)?)\s+sqft/i);
    const sqft = sqftMatch ? sqftMatch[1].replace(/,/g, '') : undefined;

    console.log(
      `[assessor] ${address} → beds=${beds ?? '—'} baths=${baths ?? '—'} sqft=${sqft ?? '—'}`,
    );

    if (!beds && !baths && !sqft) return null;
    return { beds, baths, sqft };
  } catch (err) {
    console.error(
      `[assessor] Error enriching "${address}":`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
