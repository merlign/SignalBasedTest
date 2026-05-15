'use strict';

/**
 * Search terms per sector. Add new sectors or terms here — the scraper
 * picks them up automatically on the next run.
 */

const SEARCH_TERMS = {
  bouw: [
    'uitvoerder',
    'werkvoorbereider',
    'calculator bouw',
    'projectleider bouw',
    'uitvoerder installatietechniek',
    'constructeur',
    'uitvoerder grondwerk',
    'uitvoerder infra',
    'projectleider gww',
    'stratenmaker',
    'dakdekker',
    'steigerbouwer',
    'betonvlechter',
    'bekister',
    'rioolmonteur',
  ],
  techniek: [
    'technisch beheerder',
    'service monteur',
    'onderhoudsmonteur',
    'technisch specialist',
    'mechatronicus',
    'storingsmonteur',
    'preventiemonteur',
    'technisch projectleider',
    'field service engineer',
    'technisch inspecteur',
  ],
  metaalElektro: [
    'bankwerker',
    'cnc frezer',
    'cnc draaier',
    'lasser mig mag',
    'constructielasser',
    'pijpfitter',
    'plaatwerker',
    'operator productie',
    'werktuigbouwkundig tekenaar',
    'technisch tekenaar',
    'constructeur werktuigbouw',
    'elektromonteur',
    'elektrotechnisch monteur',
    'installateur elektra',
    'storingsmonteur elektra',
    'middenspanning monteur',
    'hoogspanning monteur',
    'werkvoorbereider elektro',
    'projectleider elektro',
    'kabellegger',
    'instrumentatiemonteur',
    'plc programmeur',
  ],
  it: [
    'IT beheerder',
    'systeembeheerder',
    'netwerkbeheerder',
    'helpdesk medewerker',
    'technisch beheerder ict',
    'ict medewerker',
  ],
  backoffice: [
    'HR medewerker',
    'office manager',
    'management assistent',
    'financieel administrateur',
    'salarisadministrateur',
    'administratief medewerker',
  ],
  spoorwegtechniek: [
    'railmonteur',
    'spoorwerker',
    'bovenbouwmonteur',
    'spooronderhoud',
    'wissel monteur',
    'railinspecteur',
    'seinmonteur',
    'spoortechnicus',
    'tractietechnicus',
    'bovenleidingmonteur',
    'bovenleidingwerker',
    'rijdraadmonteur',
    'projectleider spoor',
    'werkvoorbereider spoor',
    'uitvoerder spoor',
    'onderhoudsmonteur spoor',
  ],
};

const INDEED_BASE_URL = 'https://nl.indeed.com/vacatures';
const MAX_AGE_HOURS = 24;
const REQUEST_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const MAX_PAGES_PER_TERM = 3;

module.exports = {
  SEARCH_TERMS,
  INDEED_BASE_URL,
  MAX_AGE_HOURS,
  REQUEST_DELAY_MS,
  MAX_RETRIES,
  MAX_PAGES_PER_TERM,
};
