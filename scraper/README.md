# WHP Scraper

A Next.js app that scrapes real estate listings for **Walla Walla, WA** and stores them in a local SQLite database. Built for house-reseller research.

## Running the app

```bash
cd scraper
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to use

The dashboard has one page. At the top you'll find scraper buttons — click any one to start a scrape. Results are saved to the local database and displayed in the table below. You can filter by source, search by address/price, and delete individual listings.

Each scrape is an upsert: new listings are inserted, existing ones (matched by URL) just get their `last_seen` timestamp updated, so you won't accumulate duplicates.

## Scrapers

| Source | Type | Notes |
|--------|------|-------|
| **Redfin** | For-sale homes | Paginates through all results |
| **Craigslist (For Sale)** | For-sale by owner | `kpr.craigslist.org` — covers Walla Walla via Tri-Cities region |
| **Craigslist (Rentals)** | Rentals | Same region |
| **Zumper** | Rentals | ~120 WW listings; tries embedded JSON first, falls back to page-by-page |

### Sites that are blocked

- **Apartments.com** — Akamai WAF returns "Access Denied" to all headless Chrome
- **Zillow / Trulia** — PerimeterX bot protection
- **Realtor.com** — Cloudflare bot protection

## Adding a new scraper

1. Create `lib/scrapers/yoursite.ts` and export a `ScraperDef`:

```ts
import type { Page } from 'puppeteer';
import type { PropertyRecord } from '@/db/database';
import type { ScraperDef } from './types';

async function scrape(page: Page): Promise<PropertyRecord[]> {
  await page.goto('https://yoursite.com/walla-walla-wa', { waitUntil: 'networkidle2', timeout: 60000 });
  // ... extract data ...
  return [{ source: 'YourSite', address: '...', listing_url: '...', location: 'Walla Walla, WA' }];
}

export const yoursiteScraper: ScraperDef = {
  key: 'yoursite',
  label: 'YourSite',
  dbSource: 'YourSite',
  color: 'bg-purple-600 hover:bg-purple-700',
  scrape,
};
```

2. Add it to `lib/scrapers/registry.ts`:

```ts
import { yoursiteScraper } from './yoursite';

export const allScrapers: ScraperDef[] = [
  redfinScraper,
  craigslistSaleScraper,
  craigslistRentalsScraper,
  zumperScraper,
  yoursiteScraper,   // ← add here
];
```

3. Add it to `SOURCES` and `BADGE_COLORS` in `app/page.tsx`:

```ts
// SOURCES array
{ key: 'yoursite', label: 'YourSite', dbSource: 'YourSite', endpoint: '/api/scrape?source=yoursite', color: 'bg-purple-600 hover:bg-purple-700' },

// BADGE_COLORS map
'YourSite': 'bg-purple-100 text-purple-700',
```

That's it — no new route file needed. The unified `/api/scrape?source=yoursite` endpoint handles it automatically.

## Project structure

```
scraper/
  app/
    page.tsx                    # Dashboard UI
    api/
      scrape/route.ts           # Unified scraper endpoint: GET /api/scrape?source=KEY
      properties/route.ts       # DB read/delete: GET/DELETE /api/properties
  lib/
    scrapers/
      types.ts                  # ScraperDef interface
      browser.ts                # Shared Puppeteer launch utility
      registry.ts               # Maps source keys to scraper adapters
      redfin.ts                 # Redfin adapter
      craigslist.ts             # Craigslist adapter (sale + rentals)
      zumper.ts                 # Zumper adapter
  db/
    database.ts                 # SQLite helpers (upsertProperties, getAllProperties, getStats)
  data/
    properties.db               # SQLite database (gitignored, created at runtime)
```

## Database

SQLite file at `scraper/data/properties.db`, created automatically on first run.

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Auto-increment primary key |
| `source` | TEXT | e.g. "Redfin", "Craigslist (Rentals)" |
| `address` | TEXT | |
| `price` | TEXT | |
| `beds` / `baths` / `sqft` | TEXT | |
| `listing_url` | TEXT UNIQUE | Deduplication key |
| `description` | TEXT | |
| `amenities` | TEXT | JSON array |
| `phone` | TEXT | |
| `key_facts` | TEXT | JSON array (Redfin only) |
| `location` | TEXT | Always "Walla Walla, WA" |
| `date_added` | DATETIME | Set on first insert |
| `last_seen` | DATETIME | Updated on every upsert |
