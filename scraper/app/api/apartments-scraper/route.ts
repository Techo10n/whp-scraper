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

export interface PropertyListing {
  id: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  listingUrl: string;
  description?: string;
  amenities?: string[];
  phone?: string;
}

export async function GET(request: NextRequest) {
  const apartmentsUrl = 'https://www.apartments.com/houses/walla-walla-wa/';
  const rawLocation = 'Walla Walla, WA';

  let browser;
  try {
    console.log(`Scraping apartments from: ${apartmentsUrl}`);

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

    console.log('Browser launched successfully');

    const page = await browser.newPage();
    console.log('New page created');

    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });

    console.log('Navigating to URL...');
    await page.goto(apartmentsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    console.log('Page loaded successfully');

    console.log('Waiting for property selectors...');
    await page.waitForSelector('[data-testid="property-card"], article.placard, .placard', {
      timeout: 10000
    });

    // Get all property links from the main listing page
    const propertyLinks = await page.evaluate(() => {
      const links: string[] = [];
      
      // Then, get links from .placard elements (remaining properties)
      const placardElements = document.querySelectorAll('article.placard');
      placardElements.forEach((element, index) => {
        // Look for the data-url attribute first, then fallback to finding a link
        const dataUrl = element.getAttribute('data-url');
        if (dataUrl) {
          // Convert relative URL to absolute URL
          const fullUrl = dataUrl.startsWith('http') ? dataUrl : `https://www.apartments.com${dataUrl}`;
          links.push(fullUrl);
        } else {
          // Fallback to finding a link element within the placard
          const linkElement = element.querySelector('a[href]');
          if (linkElement) {
            const href = (linkElement as HTMLAnchorElement).href;
            if (href && href.includes('/')) {
              links.push(href);
            }
          }
        }
      });
      
      return links;
    });

    console.log(`Found ${propertyLinks.length} property links to scrape`);

    const allProperties: PropertyListing[] = [];

    // Loop through each property link
    for (let i = 0; i < propertyLinks.length; i++) {
      const propertyUrl = propertyLinks[i];
      console.log(`Scraping property ${i + 1}/${propertyLinks.length}: ${propertyUrl}`);

      try {
        // Navigate to the individual property page
        await page.goto(propertyUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        // Wait a bit for the page to fully load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract property details from the individual page
        const propertyData = await page.evaluate(() => {
          const getText = (selector: string) => {
            const el = document.querySelector(selector);
            return el?.textContent?.trim() || '';
          };

          const getRentInfo = () => {
            const info = {} as any;
            document.querySelectorAll('#priceBedBathAreaInfoWrapper .priceBedRangeInfo li').forEach(li => {
              const label = li.querySelector('.rentInfoLabel')?.textContent?.trim().toLowerCase();
              const value = li.querySelector('.rentInfoDetail')?.textContent?.trim();
              if (label && value) {
                info[label] = value;
              }
            });
            return info;
          };

          const rentInfo = getRentInfo();

          const amenities = Array.from(document.querySelectorAll('section#amenitiesSection li'))
            .map(el => el.textContent?.trim())
            .filter(Boolean) as string[];

          return {
            id: `property-${Date.now()}-${Math.random()}`,
            address: getText('.delivery-address h1'),
            price: getText('#propertyNameRow .propertyName'),
            beds: rentInfo['bedrooms'] || '',
            baths: rentInfo['bathrooms'] || '',
            sqft: rentInfo['square feet'] || '',
            listingUrl: window.location.href,
            description: getText('section#descriptionSection'),
            amenities: amenities.slice(0, 10),
            phone: getText('a[href^="tel:"]')
          };
        });

        if (propertyData.address || propertyData.price) {
          allProperties.push(propertyData);
          console.log(`Successfully scraped property ${i + 1}: ${propertyData.address}`);
        } else {
          console.log(`No valid data found for property ${i + 1}`);
        }

        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error scraping property ${i + 1}:`, error);
        // Continue with the next property instead of failing completely
        continue;
      }
    }

    console.log(`Finished scraping. Total properties found: ${allProperties.length}`);

    return NextResponse.json({
      success: true,
      properties: allProperties,
      location: rawLocation,
      source: 'Apartments.com',
      note: `Successfully scraped ${allProperties.length} properties from ${propertyLinks.length} listings`
    });

  } catch (error) {
    console.error('Puppeteer scraping error:', error);
    return NextResponse.json({
      success: false,
      error: 'Scraping failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      note: 'Try using mock data mode or check if the target site is accessible'
    }, { status: 500 });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}