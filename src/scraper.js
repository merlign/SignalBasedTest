'use strict';

require('dotenv').config();
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const cheerio = require('cheerio');
const { createLogger } = require('./logger');
const {
  SEARCH_TERMS,
  INDEED_BASE_URL,
  MAX_AGE_HOURS,
  REQUEST_DELAY_MS,
  MAX_RETRIES,
  MAX_PAGES_PER_TERM,
} = require('../config/searchterms');

const log = createLogger('scraper');

// ---------------------------------------------------------------------------
// User-agent pool (rotated per request)
// ---------------------------------------------------------------------------
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
];

let uaIndex = 0;
function nextUserAgent() {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

// ---------------------------------------------------------------------------
// HTTP client with retry logic
// ---------------------------------------------------------------------------
const http = axios.create({
  timeout: 15000,
  headers: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  },
});

axiosRetry(http, {
  retries: MAX_RETRIES,
  retryDelay: (count) => count * 3000,
  retryCondition: (err) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) ||
    (err.response && err.response.status >= 500),
  onRetry: (count, err, cfg) => {
    log.warn(`Retry ${count}/${MAX_RETRIES} for ${cfg.url}`, {
      status: err.response?.status,
      message: err.message,
    });
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert an Indeed relative date string ("1 dag geleden", "Zojuist geplaatst", …)
 * to a JS Date, returning null when the vacancy is older than MAX_AGE_HOURS.
 */
function parseIndeedDate(rawDate) {
  if (!rawDate) return null;
  const lower = rawDate.toLowerCase().trim();

  if (lower.includes('zojuist') || lower.includes('net geplaatst') || lower.includes('vandaag')) {
    return new Date();
  }

  const hoursMatch = lower.match(/(\d+)\s*uur/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    if (hours > MAX_AGE_HOURS) return null;
    const d = new Date();
    d.setHours(d.getHours() - hours);
    return d;
  }

  const daysMatch = lower.match(/(\d+)\s*dag/);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    if (days * 24 > MAX_AGE_HOURS) return null;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }

  // If we cannot parse the date, skip rather than include stale data
  return null;
}

/**
 * Build the Indeed search URL for a given term and page number.
 */
function buildUrl(term, page = 0) {
  const params = new URLSearchParams({
    q: term,
    l: 'Nederland',
    fromage: '1', // last 24 hours filter on Indeed's side
    sort: 'date',
    start: page * 10,
  });
  return `${INDEED_BASE_URL}?${params.toString()}`;
}

/**
 * Fetch and parse a single Indeed results page.
 * Returns an array of raw vacancy objects.
 */
async function fetchPage(term, sector, page) {
  const url = buildUrl(term, page);
  log.debug(`Fetching page ${page + 1} for "${term}"`, { url });

  const response = await http.get(url, {
    headers: { 'User-Agent': nextUserAgent() },
  });

  const $ = cheerio.load(response.data);
  const vacancies = [];

  // Indeed wraps each job card in a <div> with data-jk attribute
  $('[data-jk]').each((_, el) => {
    try {
      const card = $(el);
      const jobKey = card.attr('data-jk');
      const title = card.find('[class*="jobTitle"]').first().text().trim();
      const company = card.find('[class*="companyName"]').first().text().trim();
      const location = card.find('[class*="companyLocation"]').first().text().trim();
      const rawDate = card.find('[class*="date"]').first().text().trim();
      const snippet = card.find('[class*="job-snippet"]').first().text().trim();

      if (!jobKey || !title || !company) return;

      const postedAt = parseIndeedDate(rawDate);
      if (!postedAt) {
        log.debug(`Skipping old/unparseable vacancy: "${title}" at ${company}`, { rawDate });
        return;
      }

      vacancies.push({
        id: `indeed_${jobKey}`,
        source: 'indeed.nl',
        url: `https://nl.indeed.com/rc/clk?jk=${jobKey}`,
        title,
        company,
        location,
        sector,
        searchTerm: term,
        snippet,
        postedAt: postedAt.toISOString(),
        rawDate,
        scrapedAt: new Date().toISOString(),
        status: 'new',
      });
    } catch (parseErr) {
      log.warn('Error parsing job card', { error: parseErr.message });
    }
  });

  return vacancies;
}

/**
 * Scrape all pages for a single search term.
 */
async function scrapeTerm(term, sector) {
  log.info(`Scraping term: "${term}" [${sector}]`);
  const results = [];

  for (let page = 0; page < MAX_PAGES_PER_TERM; page++) {
    if (page > 0) await sleep(REQUEST_DELAY_MS);

    try {
      const pageResults = await fetchPage(term, sector, page);
      log.info(`  Page ${page + 1}: found ${pageResults.length} recent vacancies`);
      results.push(...pageResults);

      // Stop early if we got fewer than 10 results (last page)
      if (pageResults.length < 10) break;
    } catch (err) {
      log.error(`Failed to fetch page ${page + 1} for "${term}"`, {
        error: err.message,
        status: err.response?.status,
      });
      break;
    }
  }

  return results;
}

/**
 * Run the full scraper across all configured sectors and search terms.
 * Returns a flat array of deduplicated vacancy objects.
 */
async function runScraper() {
  log.info('Starting Indeed scraper run');
  const allVacancies = [];
  const seen = new Set();

  for (const [sector, terms] of Object.entries(SEARCH_TERMS)) {
    for (const term of terms) {
      await sleep(REQUEST_DELAY_MS);
      try {
        const found = await scrapeTerm(term, sector);
        for (const v of found) {
          if (!seen.has(v.id)) {
            seen.add(v.id);
            allVacancies.push(v);
          }
        }
      } catch (err) {
        log.error(`Unhandled error scraping "${term}"`, { error: err.message });
      }
    }
  }

  log.info(`Scraper complete. Total unique vacancies: ${allVacancies.length}`);
  return allVacancies;
}

module.exports = { runScraper, scrapeTerm };
