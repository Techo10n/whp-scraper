import { NextResponse } from 'next/server';
import type { Browser } from 'puppeteer';
import { launchBrowser } from '@/lib/scrapers/browser';
import { registry } from '@/lib/scrapers/registry';
import { upsertProperties } from '@/db/database';
import { deduplicateWithinScrape } from '@/lib/scrapers/dedup';

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get('source') ?? '';
  const scraper = registry.get(source);

  if (!scraper) {
    return NextResponse.json(
      {
        success: false,
        error: `Unknown scraper source "${source}"`,
        validSources: [...registry.keys()],
      },
      { status: 400 }
    );
  }

  if (!scraper.scrape && !scraper.scrapeApi) {
    return NextResponse.json(
      { success: false, error: `Scraper "${source}" has no scrape function` },
      { status: 500 }
    );
  }

  console.log(`[scrape] Starting: ${scraper.label}`);
  let browser: Browser | undefined;
  try {
    let properties;
    if (scraper.scrapeApi) {
      properties = await scraper.scrapeApi();
    } else {
      const { browser: b, page } = await launchBrowser();
      browser = b;
      properties = await scraper.scrape!(page);
    }
    console.log(`[scrape] ${scraper.label}: extracted ${properties.length} properties`);

    const { deduped, removed } = deduplicateWithinScrape(properties);
    if (removed > 0) {
      console.log(`[scrape] ${scraper.label}: removed ${removed} within-scrape duplicates`);
    }

    const saved = upsertProperties(deduped);
    console.log(`[scrape] ${scraper.label}: ${saved.inserted} new, ${saved.updated} updated`);

    return NextResponse.json({
      success: true,
      source: scraper.dbSource,
      count: properties.length,
      saved,
      note: `Scraped ${properties.length} properties from ${scraper.label}. ${saved.inserted} new, ${saved.updated} already known.`,
    });
  } catch (error) {
    console.error(`[scrape] ${scraper.label} error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: `${scraper.label} scraping failed`,
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close().catch(e => console.error('[scrape] Error closing browser:', e));
    }
  }
}
