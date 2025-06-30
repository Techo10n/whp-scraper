import puppeteer from 'puppeteer';
import { insertListingIfNew } from '../utils/db.js';

export default async function scrapeGeneric(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    const listings = await page.evaluate(() => {
      const cards = document.querySelectorAll('.listing'); // adjust as needed
      return Array.from(cards).map(card => ({
        title: card.querySelector('.title')?.innerText || '',
        price: card.querySelector('.price')?.innerText || '',
        location: card.querySelector('.location')?.innerText || '',
        url: card.querySelector('a')?.href || ''
      }));
    });

    for (const listing of listings) {
      await insertListingIfNew(listing);
    }
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
  } finally {
    await browser.close();
  }
}