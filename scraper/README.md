# WHP Scraper — Walla Walla Property Dashboard

Author: Zechariah Frierson
Status: Active Development

---

# 1. Overview

WHP Scraper is a real estate listing aggregator and research dashboard for home resellers targeting the Walla Walla, WA market.

Real estate listings are scattered across multiple websites that each require separate searches, logins, and manual tracking. For a reseller or investor monitoring the Walla Walla market, keeping up with new listings across Redfin, Craigslist, and rental platforms is repetitive and time-consuming.

WHP Scraper solves this by running headless browser scrapers against multiple sources, deduplicating results, persisting them in a local SQLite database, and surfacing everything through a single searchable dashboard. The entire stack runs locally — no external services, no API keys, no subscriptions required.

---

# 2. Motivation

Home resellers need to act quickly when new listings appear. Checking multiple sites manually introduces delays and risk of missing opportunities.

Common problems this app addresses:

- Redfin, Craigslist, and Zumper each require separate searches for the same market.
- Listings repeat across scraping sessions without a deduplication layer.
- No single view exists for comparing prices and details across sources.
- Tracking which listings are new vs. previously seen requires manual effort.

WHP Scraper automates the data collection step so the reseller can focus on evaluating listings rather than finding them.

---

# 3. Product Goals

## 3.1 Primary Goals

1. Scrape property listings from multiple real estate sources on demand.
2. Store results in a local SQLite database with automatic deduplication.
3. Display all listings in a unified, searchable dashboard.
4. Report new vs. previously seen listings after each scrape run.

## 3.2 Secondary Goals

1. Support filtering and searching across all stored listings.
2. Allow individual listings to be deleted from the database.
3. Make it easy to add new scraper sources without creating new API routes.

## 3.3 Long-Term Vision

The app may evolve to include:

- scheduled/automatic scraping on a timer
- price change tracking across multiple `last_seen` snapshots
- email or push alerts for new listings
- export to CSV or spreadsheet formats
- map view for geographic filtering

---

# 4. Tech Stack

## Frontend

- **Next.js 15** (App Router, Turbopack dev server)
- **React 19**
- **TypeScript 5** (strict mode, path alias `@/*`)
- **Tailwind CSS v4** (PostCSS integration)
- **Geist** font family (sans + mono)

## Backend / API

- **Next.js Route Handlers** — server-side API endpoints co-located with the frontend
- **SQLite** via `better-sqlite3` — embedded database with WAL mode and transactional upserts

## Web Scraping

- **Puppeteer v24** — headless Chromium browser automation
- **puppeteer-extra** + **Stealth Plugin** — evades bot-detection fingerprinting (canvas, WebGL, navigator, etc.)
- Custom User-Agent and viewport settings per session
- Per-scraper fallback strategies (embedded JSON extraction → paginated DOM scraping → individual page scraping)

## Development Tools

- ESLint v9 with `next/core-web-vitals` and `next/typescript` configs
- `eslint.ignoreDuringBuilds: true` — intentional; native module `require()` calls in scraper files trigger false-positive lint errors during the Next.js build step

---

# 5. Features

## 5.1 Dashboard

The app has a single-page dashboard (`/`) with:

- **Stats header** — total listing count and per-source breakdown, updated live after each scrape
- **Scraper control panel** — one color-coded button per source; shows a spinner while running, then a success or error message with the count of new listings added
- **Search bar** — filters the table in real time by address, price, or source name
- **Source filter dropdown** — narrows the table to a single source
- **Listings table** — address (hyperlinked to the original listing), price, beds/baths/sqft, color-coded source badge, date added, and a remove button
- **Delete** — removes a single listing from the database with a confirmation prompt

## 5.2 Scrapers

| Key | Label | Site | Category |
|-----|-------|------|----------|
| `redfin` | Redfin | redfin.com | For sale |
| `craigslist-sale` | Craigslist (For Sale) | kpr.craigslist.org | For sale |
| `craigslist-rentals` | Craigslist (Rentals) | kpr.craigslist.org | Rentals |
| `zumper` | Zumper | zumper.com | Rentals |

## 5.3 Deduplication

Every scrape is an upsert keyed on `listing_url`:

- New listings are inserted with `date_added = now()`.
- Listings already in the database get their `last_seen` timestamp and `price` updated.
- No duplicates accumulate across repeated scrape runs.
- After each run the UI shows exactly how many listings were new vs. already known.

---

# 6. Scraper Details

## 6.1 Redfin

Navigates to the Walla Walla, WA for-sale listings page. Scrolls through all paginated property cards and extracts address, price, beds, baths, sqft, and key facts (e.g. days on market, listing type).

## 6.2 Craigslist

Targets the Tri-Cities region (`kpr.craigslist.org`), which covers Walla Walla listings. Two variants:

- **`craigslist-sale`** — `reo` (real estate for sale) category
- **`craigslist-rentals`** — `apa` (apartments & housing for rent) category

Each variant fetches the listing index, then visits individual listing pages to extract price, address, phone number, and beds/baths from structured Craigslist attributes.

## 6.3 Zumper

Three-strategy fallback for robustness against layout changes:

1. Extract from the `__PRELOADED_STATE__` Redux JSON blob embedded in the page HTML
2. DOM pagination scraping with lazy-load waiting between pages
3. Individual listing page scraping as a last resort

Extracts price ranges, beds/baths, amenity tags, and handles multi-page result sets.

---

# 7. API Endpoints

## `GET /api/scrape?source=<key>`

Triggers a scraper by its registry key. Launches a headless browser, runs the corresponding `ScraperDef.scrape()` function, upserts results into the database, and returns a summary.

**Valid keys:** `redfin`, `craigslist-sale`, `craigslist-rentals`, `zumper`

**Success response:**

```json
{
  "success": true,
  "source": "Redfin",
  "count": 42,
  "saved": { "inserted": 5, "updated": 37 },
  "note": "Scraped 42 properties from Redfin. 5 new, 37 already known."
}
```

**Error response (unknown key):**

```json
{
  "success": false,
  "error": "Unknown scraper source \"foo\"",
  "validSources": ["redfin", "craigslist-sale", "craigslist-rentals", "zumper"]
}
```

---

## `GET /api/properties`

Returns all stored properties and aggregate stats.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | string | Filter by source name (e.g. `Redfin`) |
| `limit` | number | Maximum rows to return |
| `offset` | number | Rows to skip (pagination) |
| `stats=true` | boolean | Return stats only, no property rows |

---

## `DELETE /api/properties?id=<id>`

Deletes a single property by its integer ID. Returns `{ "success": true }` on success.

---

# 8. Project Structure

```
scraper/
├── app/
│   ├── api/
│   │   ├── apartments-scraper/
│   │   │   └── route.ts          — Legacy Apartments.com scraper (blocked by Akamai WAF)
│   │   ├── properties/
│   │   │   └── route.ts          — GET (list/stats) and DELETE endpoints
│   │   ├── redfin-scraper/
│   │   │   └── route.ts          — Legacy Redfin-only route (not used by the UI)
│   │   └── scrape/
│   │       └── route.ts          — Unified scraper route: GET /api/scrape?source=KEY
│   ├── globals.css               — Tailwind v4 base styles + Geist font CSS variables
│   ├── layout.tsx                — Root layout with Geist font and page metadata
│   ├── page.tsx                  — Main dashboard (client component)
│   └── favicon.ico
│
├── db/
│   └── database.ts               — SQLite singleton: upsertProperties, getAllProperties,
│                                   getStats, deleteProperty
│
├── lib/
│   └── scrapers/
│       ├── types.ts              — ScraperDef interface
│       ├── registry.ts           — allScrapers[] array and Map<key, ScraperDef>
│       ├── browser.ts            — Shared launchBrowser() utility (stealth plugin + args)
│       ├── redfin.ts             — Redfin scraper adapter
│       ├── craigslist.ts         — Craigslist scraper (sale + rentals variants)
│       └── zumper.ts             — Zumper scraper (3-strategy fallback)
│
├── data/
│   └── properties.db             — SQLite database (auto-created at runtime, gitignored)
│
├── next.config.ts                — serverExternalPackages, image remotePatterns
├── tsconfig.json                 — TypeScript strict config, path alias @/*
├── postcss.config.mjs            — @tailwindcss/postcss plugin
├── eslint.config.mjs             — next/core-web-vitals + next/typescript
└── package.json
```

---

# 9. Scraper Architecture

The unified scraper pattern makes adding a new source a one-file task.

## 9.1 ScraperDef Interface

```ts
// lib/scrapers/types.ts
export interface ScraperDef {
  key: string;       // URL param identifier, e.g. "redfin"
  label: string;     // Display name, e.g. "Redfin"
  dbSource: string;  // Value stored in DB 'source' column
  color: string;     // Tailwind button color classes
  scrape: (page: Page) => Promise<PropertyRecord[]>;
}
```

## 9.2 Registry

`lib/scrapers/registry.ts` exports:

- `allScrapers: ScraperDef[]` — ordered list used by the dashboard button layout
- `registry: Map<string, ScraperDef>` — keyed by `ScraperDef.key` for O(1) lookup in the route handler

## 9.3 Unified Route

`GET /api/scrape?source=KEY` handles all scrapers dynamically. It looks up the key in the registry, calls `scraper.scrape(page)`, and upserts the results. No new route file is needed for a new source.

## 9.4 Adding a New Scraper

**Step 1** — Create `lib/scrapers/yoursite.ts`:

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

**Step 2** — Add to `lib/scrapers/registry.ts`:

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

**Step 3** — Add to `SOURCES` and `BADGE_COLORS` in `app/page.tsx`:

```ts
// SOURCES array
{ key: 'yoursite', label: 'YourSite', dbSource: 'YourSite', endpoint: '/api/scrape?source=yoursite', color: 'bg-purple-600 hover:bg-purple-700' },

// BADGE_COLORS map
'YourSite': 'bg-purple-100 text-purple-700',
```

---

# 10. Database

SQLite file at `data/properties.db`, created automatically on first run. Uses WAL (Write-Ahead Logging) mode and transactional batch upserts via `better-sqlite3`.

## Schema

```sql
CREATE TABLE properties (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  address     TEXT NOT NULL,
  price       TEXT,
  beds        TEXT,
  baths       TEXT,
  sqft        TEXT,
  listing_url TEXT UNIQUE NOT NULL,
  description TEXT,
  amenities   TEXT,
  phone       TEXT,
  key_facts   TEXT,
  location    TEXT,
  date_added  DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Indexes on `listing_url`, `source`, and `date_added`.

## Column Reference

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER | Auto-increment primary key |
| `source` | TEXT | e.g. `"Redfin"`, `"Craigslist (Rentals)"` |
| `address` | TEXT | Street address of the listing |
| `price` | TEXT | Asking price or rent; updated on re-scrape |
| `beds` / `baths` / `sqft` | TEXT | Property details |
| `listing_url` | TEXT UNIQUE | Deduplication key |
| `description` | TEXT | Listing description body |
| `amenities` | TEXT | JSON array of amenity strings |
| `phone` | TEXT | Contact phone (Craigslist only) |
| `key_facts` | TEXT | JSON array of key fact strings (Redfin only) |
| `location` | TEXT | Always `"Walla Walla, WA"` |
| `date_added` | DATETIME | Set on first insert |
| `last_seen` | DATETIME | Updated on every upsert |

---

# 11. Getting Started

```bash
# Install dependencies
npm install

# Start development server (Turbopack)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The SQLite database is created automatically at `data/properties.db` on first run.

```bash
# Production build
npm run build
npm run start
```

No environment variables are required for local development.

---

# 12. next.config.ts Settings

```ts
serverExternalPackages: [
  'better-sqlite3',
  'puppeteer',
  'puppeteer-extra',
  'puppeteer-extra-plugin-stealth'
]
```

These packages are excluded from webpack bundling because:

- `better-sqlite3` is a native Node.js addon (`.node` binary)
- `puppeteer-extra` and its plugins use dynamic `require()` calls that webpack cannot statically analyze

`eslint: { ignoreDuringBuilds: true }` is also set for the same reason — the dynamic imports in scraper files produce false-positive lint errors during the Next.js build.

---

# 13. Known Limitations

### Apartments.com — Blocked

Apartments.com is protected by the Akamai WAF and returns "Access Denied" to headless Chrome regardless of stealth settings. A legacy route (`app/api/apartments-scraper/route.ts`) is retained but non-functional. The source is not wired into the dashboard UI.

### Zillow / Trulia — Blocked

PerimeterX bot protection. Not attempted.

### Realtor.com — Blocked

Cloudflare bot protection. Not attempted.

### No Authentication

The dashboard is intended for local or private-network use and has no login system.

### No Scheduled Scraping

Scrapers must be triggered manually from the dashboard. There is no cron job or background polling.

### No CI/CD

No production deployment pipeline is configured. Puppeteer requires a compatible Chromium binary at runtime; on non-standard server environments, set `PUPPETEER_EXECUTABLE_PATH` to point to a valid Chromium installation.
