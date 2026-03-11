import type { ScraperDef } from './types';
import type { PropertyRecord } from '@/db/database';

const HOST = 'realty-base-us.p.rapidapi.com';
const BASE = `https://${HOST}`;
const PAGE_SIZE = 42;
const MAX_RESULTS = 500;

// Realtor.com-style APIs vary in response shape across providers.
// This extractor tries all common structures and returns the first hit.
function extractResults(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  // { data: { home_search: { results: [...] } } }
  const homeSearch = (d.data as Record<string, unknown> | undefined)?.home_search as Record<string, unknown> | undefined;
  if (Array.isArray(homeSearch?.results)) return homeSearch.results as unknown[];

  // { results: [...] }
  if (Array.isArray(d.results)) return d.results as unknown[];

  // { properties: [...] }
  if (Array.isArray(d.properties)) return d.properties as unknown[];

  // { data: [...] }
  if (Array.isArray(d.data)) return d.data as unknown[];

  // direct array
  if (Array.isArray(data)) return data as unknown[];

  // { listings: [...] }
  if (Array.isArray(d.listings)) return d.listings as unknown[];

  return [];
}

function mapProperty(prop: unknown, dbSource: string): PropertyRecord | null {
  if (!prop || typeof prop !== 'object') return null;
  const p = prop as Record<string, unknown>;

  // Address — Realtor.com nests under location.address or address
  type AddrObj = Record<string, unknown>;
  const addr = (p.location as AddrObj | undefined)?.address as AddrObj | undefined
    ?? p.address as AddrObj | undefined
    ?? {} as AddrObj;

  const line = (addr.line ?? p.street_address ?? '') as string;
  const city = (addr.city ?? p.city ?? '') as string;
  const stateCode = (addr.state_code ?? addr.state ?? p.state ?? '') as string;
  const zip = (addr.postal_code ?? addr.zip ?? p.zip ?? '') as string;

  const statePart = stateCode ? `${stateCode} ${zip}`.trim() : zip;
  const address = line
    ? [line, city, statePart].filter(Boolean).join(', ')
    : null;

  // Listing URL
  const listing_url = (
    p.permalink ?? p.href ?? p.url ?? p.rdc_link ?? p.property_url ?? p.listing_url
  ) as string | null | undefined;

  if (!address || !listing_url) return null;

  const rawPrice = (p.list_price ?? p.price ?? p.list_price_min) as number | null | undefined;
  const desc = (p.description ?? {}) as Record<string, unknown>;
  const beds = desc.beds ?? p.beds ?? p.bedrooms;
  const baths = desc.baths_consolidated ?? desc.baths_full ?? p.baths ?? p.bathrooms;
  const sqft = desc.sqft ?? p.sqft ?? p.square_footage;

  return {
    source: dbSource,
    address,
    price: rawPrice != null ? `$${Number(rawPrice).toLocaleString()}` : undefined,
    beds: beds != null ? String(beds) : undefined,
    baths: baths != null ? String(baths) : undefined,
    sqft: sqft != null ? String(sqft) : undefined,
    listing_url,
    location: 'Walla Walla, WA',
  };
}

async function fetchListings(
  endpoint: 'SearchForSale' | 'SearchRent',
  dbSource: string,
): Promise<PropertyRecord[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error('RAPIDAPI_KEY environment variable is not set');

  const results: PropertyRecord[] = [];
  const location = encodeURIComponent('city:Walla Walla, WA');
  let offset = 0;

  while (true) {
    const url = `${BASE}/${endpoint}?location=${location}&sort=best_match&offset=${offset}&limit=${PAGE_SIZE}`;

    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': HOST,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Realty Base US API error: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
    }

    const data: unknown = await res.json();
    const page = extractResults(data);

    console.log(`[realtybase] ${endpoint} offset=${offset}: ${page.length} raw results`);

    for (const prop of page) {
      const mapped = mapProperty(prop, dbSource);
      if (mapped) results.push(mapped);
    }

    // No more pages
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset >= MAX_RESULTS) break;
  }

  console.log(`[realtybase] ${endpoint} total mapped: ${results.length}`);
  return results;
}

export const realtyBaseSaleScraper: ScraperDef = {
  key: 'realtybase-sale',
  label: 'Realtor.com (For Sale)',
  dbSource: 'Realtor.com (For Sale)',
  color: 'bg-blue-600 hover:bg-blue-700',
  scrapeApi: () => fetchListings('SearchForSale', 'Realtor.com (For Sale)'),
};

export const realtyBaseRentalsScraper: ScraperDef = {
  key: 'realtybase-rentals',
  label: 'Realtor.com (Rentals)',
  dbSource: 'Realtor.com (Rentals)',
  color: 'bg-indigo-500 hover:bg-indigo-600',
  scrapeApi: () => fetchListings('SearchRent', 'Realtor.com (Rentals)'),
};
