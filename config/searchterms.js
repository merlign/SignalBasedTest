'use strict';

/**
 * Search terms configuration for Indeed.nl scraper.
 * Add new sectors or terms here — the scraper picks them up automatically.
 */

const SEARCH_TERMS = {
  bouw: [
    'uitvoerder',
    'werkvoorbereider',
    'calculator bouw',
    'projectleider bouw',
    'uitvoerder installatietechniek',
    'monteur',
    'constructeur',
  ],
  techniek: [
    'technisch beheerder',
    'service monteur',
    'onderhoudsmonteur',
    'technisch specialist',
    'mechatronicus',
  ],
  it: [
    'IT beheerder',
    'systeembeheerder',
    'netwerkbeheerder',
    'helpdesk medewerker',
    'software developer',
  ],
  backoffice: [
    'HR medewerker',
    'office manager',
    'management assistent',
    'financieel administrateur',
  ],
};

/** Base URL for Indeed.nl job search */
const INDEED_BASE_URL = 'https://nl.indeed.com/vacatures';

/** Maximum age of vacancies to include (in hours) */
const MAX_AGE_HOURS = 24;

/** Delay between requests in milliseconds */
const REQUEST_DELAY_MS = 2000;

/** Maximum retries per failed request */
const MAX_RETRIES = 3;

/** Number of pages to scrape per search term (10 results/page) */
const MAX_PAGES_PER_TERM = 3;

module.exports = {
  SEARCH_TERMS,
  INDEED_BASE_URL,
  MAX_AGE_HOURS,
  REQUEST_DELAY_MS,
  MAX_RETRIES,
  MAX_PAGES_PER_TERM,
};
