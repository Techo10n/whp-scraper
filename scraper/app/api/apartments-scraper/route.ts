import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface PropertyListing {
  id: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  imageUrl: string;
  listingUrl: string;
}

function formatLocationForApartments(location: string): string {
  return location
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/,?\s*(ga|georgia|fl|florida|ny|new-york|ca|california|tx|texas)$/i, match => 
      '-' + match.replace(/,?\s*/, '').toLowerCase().replace(/new-york/, 'ny').replace(/california/, 'ca').replace(/florida/, 'fl').replace(/georgia/, 'ga').replace(/texas/, 'tx')
    );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawLocation = searchParams.get('location') || 'Atlanta, GA';
  
  let browser;
  try {
    const formattedLocation = formatLocationForApartments(rawLocation);
    const apartmentsUrl = `https://www.apartments.com/${formattedLocation}/`;
    
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
        '--disable-features=VizDisplayCompositor'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 720 });
    
    await page.goto(apartmentsUrl, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for property listings to load
    await page.waitForSelector('[data-testid="property-card"], .property-information, .placard', {
      timeout: 10000
    });
    
    const properties = await page.evaluate(() => {
      const propertyCards = document.querySelectorAll('[data-testid="property-card"], .property-information, .placard');
      const results: PropertyListing[] = [];
      
      propertyCards.forEach((card, index) => {
        try {
          // Multiple selector strategies for different page layouts
          const addressElement = card.querySelector('.property-address, [data-testid="property-address"], .property-link h3, .placard-title a') ||
                               card.querySelector('h3 a, .listing-address, .property-name a');
          
          const priceElement = card.querySelector('.property-pricing, [data-testid="property-pricing"], .price-range, .rent-range') ||
                              card.querySelector('.price, .pricing, .rent');
          
          const bedsElement = card.querySelector('.bed-range, [data-testid="beds"], .beds') ||
                             card.querySelector('[class*="bed"]');
          
          const bathsElement = card.querySelector('.bath-range, [data-testid="baths"], .baths') ||
                              card.querySelector('[class*="bath"]');
          
          const sqftElement = card.querySelector('.sqft-range, [data-testid="sqft"], .square-feet') ||
                             card.querySelector('[class*="sqft"], [class*="square"]');
          
          const imageElement = card.querySelector('img') as HTMLImageElement;
          
          const linkElement = card.querySelector('a[href*="/apartments/"]') ||
                             card.querySelector('.property-link a, .placard-title a') ||
                             card.querySelector('a');
          
          const address = addressElement?.textContent?.trim() || '';
          const price = priceElement?.textContent?.trim() || '';
          const beds = bedsElement?.textContent?.trim() || '';
          const baths = bathsElement?.textContent?.trim() || '';
          const sqft = sqftElement?.textContent?.trim() || '';
          const imageUrl = imageElement?.src || '';
          const relativeUrl = linkElement?.getAttribute('href') || '';
          const listingUrl = relativeUrl.startsWith('http') ? relativeUrl : `https://www.apartments.com${relativeUrl}`;
          
          if (address && price) {
            results.push({
              id: `apartments-${index}`,
              address: address,
              price: price,
              beds: beds || 'N/A',
              baths: baths || 'N/A',
              sqft: sqft || 'N/A',
              imageUrl: imageUrl || 'https://images.unsplash.com/photo-1560472354-981bd84eb44a?w=400&h=300&auto=format&fit=crop',
              listingUrl: listingUrl
            });
          }
        } catch (err) {
          console.error('Error parsing property card:', err);
        }
      });
      
      return results;
    });
    
    if (properties.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No properties found',
        note: 'The page loaded but no property listings were detected. The site structure may have changed.',
        url: apartmentsUrl
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      properties: properties.slice(0, 20), // Limit to 20 results
      location: rawLocation,
      source: 'Apartments.com',
      note: `Found ${properties.length} properties using Puppeteer scraping`
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