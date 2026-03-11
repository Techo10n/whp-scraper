import type { PropertyRecord } from '@/db/database';

// Strip city/state/zip suffix, remove punctuation, collapse whitespace, lowercase.
// "427 E Pine St, Walla Walla, WA 99362" → "427 e pine st"
export function normalizeStreet(address: string): string {
  return address
    .toLowerCase()
    .replace(/,.*$/, '')        // drop everything after the first comma
    .replace(/[^\w\s]/g, ' ')  // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

// Deduplicate within a single scrape result by normalized street + beds + baths.
// Price is intentionally excluded: spam reposts sometimes vary it slightly.
// Properties with no parseable street number are passed through unchanged.
export function deduplicateWithinScrape(properties: PropertyRecord[]): {
  deduped: PropertyRecord[];
  removed: number;
} {
  const seen = new Set<string>();
  const deduped: PropertyRecord[] = [];

  for (const prop of properties) {
    const street = normalizeStreet(prop.address);

    // No street number → can't content-deduplicate, always keep
    if (!street || !/\d/.test(street)) {
      deduped.push(prop);
      continue;
    }

    const key = `${street}|${prop.beds ?? ''}|${prop.baths ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(prop);
  }

  return { deduped, removed: properties.length - deduped.length };
}
