import { NextRequest, NextResponse } from 'next/server';

// Try to use puppeteer-extra with stealth, fallback to regular puppeteer
let puppeteer: any;
try {
  puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  console.log('Using puppeteer-extra with stealth plugin');
} catch (error) {
  console.warn('Failed to load puppeteer-extra, using regular puppeteer:', error);
  puppeteer = require('puppeteer');
}

export interface RedfinPropertyListing {
  id: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  listingUrl: string;
  keyFacts?: string[];
}

// Scroll the page slowly to the bottom to load all lazy elements
async function scrollToBottom(page: any) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 600; // scroll twice as fast
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        const targetHeight = scrollHeight * 0.9;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= targetHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

export async function GET(_request: NextRequest) {
  const redfinUrl = 'https://www.redfin.com/city/19187/WA/Walla-Walla';
  const rawLocation = 'Walla Walla, WA';

  let browser;
  try {
    console.log(`Scraping properties from: ${redfinUrl}`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--disable-plugins'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });

    console.log('Navigating to URL...');
    await page.goto(redfinUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    const allProperties: RedfinPropertyListing[] = [];

    while (true) {
      console.log('Waiting for property cards...');
      await page.waitForSelector('.bp-Homecard', { timeout: 15000 });

      console.log('Scrolling to bottom to load all lazy content...');
      await scrollToBottom(page);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Small buffer

      const propertiesOnPage = await page.evaluate(() => {
        const propertyCards = document.querySelectorAll('.bp-Homecard');
        const properties: any[] = [];

        propertyCards.forEach((card, index) => {
          try {
            const addressElement = card.querySelector('.bp-Homecard__Address');
            const address = addressElement?.textContent?.trim() || '';

            const priceElement = card.querySelector('.bp-Homecard__Price--value');
            const price = priceElement?.textContent?.trim() || '';

            const bedsElement = card.querySelector('.bp-Homecard__Stats--beds');
            const beds = bedsElement?.textContent?.trim() || '';

            const bathsElement = card.querySelector('.bp-Homecard__Stats--baths');
            const baths = bathsElement?.textContent?.trim() || '';

            const sqftValueElement = card.querySelector('.bp-Homecard__LockedStat--value');
            const sqftLabelElement = card.querySelector('.bp-Homecard__LockedStat--label');
            let sqft = '';
            if (sqftValueElement && sqftLabelElement?.textContent?.includes('sq ft')) {
              sqft = (sqftValueElement.textContent?.trim() || '') + ' sq ft';
            }

            const keyFactsElements = card.querySelectorAll('.KeyFacts-item');
            const keyFacts: string[] = [];
            keyFactsElements.forEach(item => {
              const text = item.textContent?.trim();
              if (text) keyFacts.push(text);
            });

            const linkElement = card.querySelector('a[href]');
            const listingUrl = linkElement ? (linkElement as HTMLAnchorElement).href : window.location.href;

            if (address || price) {
              properties.push({
                id: `redfin-${index}-${Date.now()}`,
                address,
                price,
                beds,
                baths,
                sqft,
                listingUrl,
                keyFacts: keyFacts.slice(0, 5)
              });
            }
          } catch (error) {
            console.error(`Error processing card ${index}`, error);
          }
        });

        return properties;
      });

      allProperties.push(...propertiesOnPage);
      console.log(`Total properties so far: ${allProperties.length}`);

      // Check for the "next" button and whether it's hidden or disabled
      const nextButton = await page.$('button[aria-label="next"]');
      const isDisabled: boolean = await page.evaluate((button: Element | null): boolean => {
        return !!button && (button.classList.contains('PageArrow--hidden') || button.hasAttribute('disabled'));
      }, nextButton as Element | null);

      if (!nextButton || isDisabled) {
        console.log('No more pages to scrape.');
        break;
      }

      console.log('Clicking next page...');
      await nextButton.click();
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
        console.warn('Navigation timeout after clicking next. Proceeding anyway.');
      });
    }

    return NextResponse.json({
      success: true,
      properties: allProperties,
      location: rawLocation,
      source: 'Redfin',
      note: `Successfully scraped ${allProperties.length} properties from all pages of Redfin`
    });

  } catch (error) {
    console.error('Redfin scraping error:', error);
    return NextResponse.json({
      success: false,
      error: 'Redfin scraping failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      note: 'Try refreshing or check if Redfin is accessible'
    }, { status: 500 });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}