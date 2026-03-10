import type { Page } from 'puppeteer';
import type { PropertyRecord } from '@/db/database';

export interface ScraperDef {
  key: string;       // URL param identifier, e.g. "redfin"
  label: string;     // Display name, e.g. "Redfin"
  dbSource: string;  // Value stored in DB 'source' column
  color: string;     // Tailwind button color classes
  scrape: (page: Page) => Promise<PropertyRecord[]>;
}
