import { NextResponse } from 'next/server';
import type { Browser } from 'puppeteer';
import { launchBrowser, configurePage } from '@/lib/scrapers/browser';
import { getPropertiesMissingDetails, updatePropertyDetails } from '@/db/database';
import { enrichFromAssessor } from '@/lib/enrichment/assessor';

const DELAY_MS = 800; // polite delay between county server requests
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET() {
  const missing = getPropertiesMissingDetails();

  if (missing.length === 0) {
    return NextResponse.json({ success: true, enriched: 0, skipped: 0, total: 0 });
  }

  console.log(`[enrich] ${missing.length} properties need enrichment`);

  let browser: Browser | undefined;
  let enriched = 0;
  let skipped = 0;

  try {
    // Launch the browser once; open a fresh page per property to avoid
    // frame-detachment errors that occur after many navigations on a single page.
    const { browser: b } = await launchBrowser();
    browser = b;

    for (const prop of missing) {
      const page = await browser.newPage();
      await configurePage(page);

      try {
        const details = await enrichFromAssessor(page, prop.address);
        if (details) {
          updatePropertyDetails(prop.id!, details);
          enriched++;
        } else {
          skipped++;
        }
      } finally {
        await page.close().catch(() => {});
      }

      await sleep(DELAY_MS);
    }

    console.log(`[enrich] Done: ${enriched} enriched, ${skipped} skipped`);
    return NextResponse.json({ success: true, enriched, skipped, total: missing.length });
  } catch (err) {
    console.error('[enrich] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        enriched,
        skipped,
      },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
