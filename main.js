import { genericSites } from './sites.config.js';
import scrapeGeneric from './scrapers/genericScraper.js';
import scrapeZillow from './scrapers/zillowScraper.js';

async function run() {
  for (const site of genericSites) {
    console.log(`Scraping ${site.name}...`);
    await scrapeGeneric(site.url);
  }

  console.log('Scraping Zillow...');
  await scrapeZillow();

  // Add more custom scrapers here
}

run();