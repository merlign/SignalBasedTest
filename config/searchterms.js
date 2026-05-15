'use strict';

/**
 * Search terms per sector. Add new sectors or terms here — the scraper
 * picks them up automatically on the next run.
 */

const SEARCH_TERMS = {
  bouw: [
    'uitvoerder', 'werkvoorbereider', 'projectleider bouw', 'calculator bouw',
    'constructeur', 'bouwopzichter', 'installatiemonteur', 'loodgieter',
    'elektromonteur', 'timmerman', 'metselaar', 'stukadoor', 'tegelzetter',
    'dakdekker', 'schildersvakman', 'grondwerker', 'kraanmachinist',
    'betonvlechter', 'wapeningsvlechter', 'bouwkundige', 'architect',
    'calculator gww', 'opzichter', 'directievoerder',
  ],
  techniek: [
    'technisch beheerder', 'service monteur', 'onderhoudsmonteur', 'mechatronicus',
    'werktuigbouwkundig engineer', 'industrieel monteur', 'installateur',
    'elektrotechnicus', 'automatiseringstechnicus', 'plc programmeur',
    'hvac monteur', 'klimaatmonteur', 'pijpfitter', 'lasser', 'cnc operator',
    'technisch tekenaar', 'engineer', 'maintenance engineer', 'storingsmonteur',
  ],
  it: [
    'systeembeheerder', 'netwerkbeheerder', 'it beheerder', 'helpdesk medewerker',
    'applicatiebeheerder', 'software developer', 'software engineer', 'devops engineer',
    'cloud engineer', 'cybersecurity analyst', 'data engineer', 'data analyst',
    'it projectmanager', 'functioneel beheerder', 'it consultant', 'programmeur',
    'front-end developer', 'back-end developer', 'fullstack developer', 'bi developer',
  ],
  backoffice: [
    'office manager', 'management assistent', 'hr medewerker', 'financieel administrateur',
    'teamleider', 'directiesecretaresse', 'receptionist', 'administratief medewerker',
    'financieel medewerker', 'controller', 'hr adviseur', 'salarisadministrateur',
    'crediteurenadministrateur', 'debiteurenadministrateur', 'boekhouder',
    'planner', 'roostermaker',
  ],
  productie: [
    'productiemedewerker', 'productieplanner', 'productieoperator',
    'teamleider productie', 'kwaliteitsmedewerker', 'procesoperator',
    'machine operator', 'inpakker', 'assemblagemedewerker', 'kwaliteitscontroleur',
    'productiesupervisor', 'technisch operator', 'proces technoloog',
    'lean coördinator', 'verpakkingsoperator',
  ],
  supplychain: [
    'supply chain manager', 'inkoper', 'demand planner', 'logistiek planner',
    'supply chain analyst', 'materiaalbeheerder', 'category manager',
    'strategisch inkoper', 'inkoopmedewerker', 'supply chain coördinator',
    'voorraadbeheerder', 'expediteur', 'customs medewerker', 'procurement manager',
  ],
  logistiek: [
    'logistiek medewerker', 'logistiek coördinator', 'magazijnmedewerker',
    'magazijnbeheerder', 'logistiek manager', 'warehouse manager', 'orderpicker',
    'heftruckchauffeur', 'logistiek supervisor', 'material handler',
    'inbound medewerker', 'outbound medewerker', 'retourverwerker',
    'cross dock medewerker',
  ],
  transport: [
    'transportplanner', 'vrachtwagenchauffeur', 'chauffeur', 'dispatcher',
    'fleetmanager', 'transportcoördinator', 'rijplanner', 'tankautobestuurder',
    'containerrijder', 'koerierschauffeur', 'distributiechauffeur',
    'buschauffeur goederenvervoer', 'transport manager', 'mobiliteitscoördinator',
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
