import type { ScraperDef } from './types';
import { redfinScraper } from './redfin';
import { craigslistSaleScraper, craigslistRentalsScraper } from './craigslist';
import { zumperScraper } from './zumper';
import { realtyBaseSaleScraper, realtyBaseRentalsScraper } from './realtybase';

// All available scrapers, in display order
export const allScrapers: ScraperDef[] = [
  redfinScraper,
  craigslistSaleScraper,
  craigslistRentalsScraper,
  zumperScraper,
  realtyBaseSaleScraper,
  realtyBaseRentalsScraper,
];

// Keyed by ScraperDef.key for O(1) lookup
export const registry = new Map<string, ScraperDef>(
  allScrapers.map(s => [s.key, s])
);
