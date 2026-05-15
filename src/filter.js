'use strict';

const { createLogger } = require('./logger');
const log = createLogger('filter');

// ---------------------------------------------------------------------------
// Whitelist — these companies always pass regardless of name patterns
// Major known contractors, rail companies, grid operators
// ---------------------------------------------------------------------------
const COMPANY_WHITELIST = [
  'prorail', 'ns reizigers', 'ns groep', 'keyrail', 'infrabel',
  'volkerrail', 'strukton', 'bam rail', 'bam infra', 'heijmans',
  'dura vermeer', 'volkerinfra', 'volkerwessel', 'spie', 'cofely',
  'imtech', 'eneco', 'tennet', 'stedin', 'liander', 'alliander',
  'arcadis', 'royal haskoning', 'sweco', 'iv-groep', 'croonwolter',
];

// ---------------------------------------------------------------------------
// Company name blacklist — grouped by category
// ---------------------------------------------------------------------------
const COMPANY_BLACKLIST = {
  'marketing/reclame': [
    'marketing', 'reclame', 'communicatie bureau', 'pr bureau', 'pr-bureau',
    'mediabureau', 'mediabedrijf', 'contentstudio', 'contentmarketing',
    'campagne bureau', 'advertentiebureau', 'branding', 'copywriting',
    'tekstbureau', 'growth hack', 'influencer', 'social media bureau',
    'performance marketing', 'emailmarketing',
  ],
  'web/design': [
    'webdesign', 'web design', 'webbureau', 'web bureau', 'webbouwer',
    'digitaal bureau', 'digital agency', 'ux bureau', 'ui bureau',
    'grafisch bureau', 'grafische studio', 'grafisch ontwerp', 'drukkerij',
    'printshop', 'fotostudio', 'fotografie', 'videoproductie', 'animatie studio',
    'motion design', 'creatief bureau', 'creative agency',
  ],
  'recruitment/uitzend': [
    'uitzendbureau', 'uitzend ', 'payroll', 'detachering', 'werving en selectie',
    'executive search', 'headhunter', 'recruitment bureau', 'recruitmentbureau',
    'personeelsdiensten', 'flexbureau', 'flex bureau', 'arbeidsbemiddeling',
    'interimbureau', 'interim bureau', 'secondment', 'staffing',
    'randstad ', 'manpower', 'adecco', 'tempo-team', 'yacht ', 'unique ',
    'undutchables', 'brunel ', 'otto work force', 'dpa groep',
  ],
  'overheid': [
    'gemeente ', 'provincie ', 'waterschap', 'rijksoverheid', 'ministerie van',
    'rijksdienst', 'uitvoeringsorganisatie', 'veiligheidsregio', 'omgevingsdienst',
    'belastingdienst', ' politie', 'brandweer ', 'defensie', ' leger',
    'gerechtshof', 'rechtbank', 'openbaar ministerie',
  ],
  'zorg/health': [
    'ziekenhuis', 'kliniek', 'zorggroep', 'zorginstelling', 'huisartsenpraktijk',
    'tandartspraktijk', 'fysiotherapie', 'apotheek', 'thuiszorg', 'verpleeghuis',
    'verzorgingshuis', 'gehandicaptenzorg', ' ggz', ' ggd', 'jeugdzorg',
    'welzijn', 'maatschappelijk werk', 'kinderopvang', 'peuterspeelzaal',
  ],
  'onderwijs': [
    'universiteit', 'hogeschool', ' mbo ', ' vmbo ', 'basisschool',
    'middelbare school', 'gymnasium', 'scholengemeenschap', 'kenniscentrum',
    'onderzoeksinstituut', ' nwo ', ' tno ',
  ],
  'retail/horeca': [
    'supermarkt', 'kledingwinkel', 'modewinkel', 'warenhuis',
    'restaurant ', 'hotel ', 'café ', 'brasserie', 'bezorgservice',
    'kapper', 'schoonheidssalon', ' spa ', 'wellness',
    'autodealer', 'autodealership', 'autoverhuur', 'tankstation',
  ],
  'finance/juridisch': [
    'verzekeraar', 'verzekeringen', ' bank ', 'hypotheek advies',
    'accountantskantoor', 'accountancy', 'belastingadvies',
    'notariaat', 'notaris', 'advocatenkantoor', 'advocaten',
  ],
  'consultancy': [
    'adviesbureau', 'management consulting', 'organisatieadvies',
    'strategie bureau', 'business consultant', 'coaching bureau',
    'trainingsbureau', 'opleidingsinstituut',
  ],
  'schoonmaak/facilitair': [
    'schoonmaakbedrijf', 'schoonmaakdienst', 'facilitaire dienstverlening',
    'evenementenbureau', 'eventbureau', 'beveiligingsbedrijf',
  ],
};

// ---------------------------------------------------------------------------
// Job title hard-reject patterns
// ---------------------------------------------------------------------------
const TITLE_HARD_REJECT = [
  // Marketing & content
  'marketing manager', 'marketing medewerker', 'content creator', 'copywriter',
  'social media manager', 'seo specialist', 'sea specialist', 'performance marketeer',
  'campagne manager', 'brand manager', 'communicatieadviseur', 'marketeer',
  'growth hacker', 'ux designer', 'ui designer', 'grafisch ontwerper',
  'art director', 'creatief directeur',
  // Recruitment rollen
  'recruiter', 'talent acquisition', 'intercedent', 'arbeidsmarktadviseur',
  // Finance & admin
  'financieel controller', 'accountant', 'boekhouder', 'kredietanalist',
  'secretaresse', 'receptionist', 'directieassistent', 'salarisadministrateur',
  // Software (zuiver IT)
  'software developer', 'software engineer', 'front-end developer',
  'back-end developer', 'full stack developer', 'devops engineer',
  'data engineer', 'data scientist', 'machine learning', 'product owner',
  'scrum master', 'business analyst',
  // Sales & klantenservice
  'accountmanager', 'sales manager', 'commercieel medewerker', 'klantenservice',
  'callcenter medewerker', 'customer success',
  // Juridisch & zorg
  'jurist', 'compliance officer', 'privacy officer', 'bedrijfsarts',
  // Management te senior
  'chief executive', 'chief operating', 'chief technology', 'algemeen directeur',
  // Stage & vrijwillig
  'stagiair', 'stageplaats', 'vrijwilliger', 'bijbaan',
];

// ---------------------------------------------------------------------------
// Job title positive patterns — these PROTECT a vacancy from being filtered
// even when the company name triggers the blacklist
// ---------------------------------------------------------------------------
const TITLE_POSITIVE = [
  'monteur', 'technicus', 'uitvoerder', 'werkvoorbereider', 'constructeur',
  'lasser', 'elektromonteur', 'installateur', 'onderhoudsmonteur',
  'servicemonteur', 'storingsmonteur', 'pijpfitter', 'plaatwerker',
  'cnc', 'bankwerker', 'draaier', 'frezer', 'operator productie',
  'railmonteur', 'spoorwerker', 'bovenleidingmonteur', 'seinmonteur',
  'dakdekker', 'steigerbouwer', 'betonvlechter', 'bekister', 'stratenmaker',
  'kabellegger', 'instrumentatiemonteur', 'meet en regel',
  'hoogspanning', 'middenspanning', 'laagspanning',
  'field service', 'technisch inspecteur', 'technisch projectleider',
];

// ---------------------------------------------------------------------------
// Snippet hard-reject phrases (single match = reject)
// ---------------------------------------------------------------------------
const SNIPPET_HARD_REJECT = [
  'werkzaam als uitzendbureau',
  'wij plaatsen personeel',
  'detacheren wij',
  'wij bemiddelen',
  'je gaat aan de slag bij een van onze opdrachtgevers',
  'via ons ga je werken bij',
  'als intercedent',
  'werving en selectie',
  'payrollbedrijf',
  'stageplaats',
  'vrijwilligerswerk',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalize(str) {
  return (str || '').toLowerCase().trim();
}

function matchesAny(text, patterns) {
  const t = normalize(text);
  return patterns.some((p) => t.includes(normalize(p)));
}

function isWhitelisted(company) {
  const c = normalize(company);
  return COMPANY_WHITELIST.some((w) => c.includes(normalize(w)));
}

function isCompanyBlacklisted(company) {
  const c = normalize(company);
  for (const [category, patterns] of Object.entries(COMPANY_BLACKLIST)) {
    if (patterns.some((p) => c.includes(normalize(p)))) {
      return category;
    }
  }
  return null;
}

function isTitleHardReject(title) {
  return matchesAny(title, TITLE_HARD_REJECT);
}

function isTitlePositive(title) {
  return matchesAny(title, TITLE_POSITIVE);
}

function isSnippetHardReject(snippet) {
  return SNIPPET_HARD_REJECT.some((phrase) =>
    normalize(snippet).includes(normalize(phrase))
  );
}

// ---------------------------------------------------------------------------
// Main filter function
// ---------------------------------------------------------------------------
function filterVacancy(vacancy) {
  const { title, company, snippet } = vacancy;

  // 1. Whitelist overrides everything except title hard-reject
  if (isWhitelisted(company)) {
    if (isTitleHardReject(title)) {
      return { keep: false, reason: `whitelist_company_bad_title: ${title}` };
    }
    return { keep: true, reason: 'whitelisted' };
  }

  // 2. Snippet hard reject
  if (isSnippetHardReject(snippet)) {
    return { keep: false, reason: 'snippet_hard_reject' };
  }

  // 3. Title hard reject
  if (isTitleHardReject(title)) {
    return { keep: false, reason: `title_hard_reject: ${title}` };
  }

  // 4. Company blacklist
  // Uitzendbureaus/recruitment zijn ALTIJD een hard reject — zij plaatsen mensen
  // bij anderen en zijn nooit zelf de klant, ongeacht de functietitel.
  const HARD_REJECT_CATEGORIES = ['recruitment/uitzend'];

  const blacklistCategory = isCompanyBlacklisted(company);
  if (blacklistCategory) {
    if (HARD_REJECT_CATEGORIES.includes(blacklistCategory)) {
      return { keep: false, reason: `company_blacklisted_hard: ${blacklistCategory}` };
    }
    // Voor andere categorieën: positieve functietitel mag wel overriden
    // (bijv. IT-bedrijf dat een elektromonteur zoekt)
    if (isTitlePositive(title)) {
      return { keep: true, reason: 'company_blacklisted_but_title_positive' };
    }
    return { keep: false, reason: `company_blacklisted: ${blacklistCategory}` };
  }

  return { keep: true, reason: 'passed' };
}

/**
 * Filter an array of vacancies. Returns kept vacancies and a count of filtered ones.
 */
function filterVacancies(vacancies) {
  const kept = [];
  const filtered = [];

  for (const v of vacancies) {
    const result = filterVacancy(v);
    if (result.keep) {
      kept.push(v);
    } else {
      filtered.push({ ...v, filterReason: result.reason });
      log.debug(`Filtered: "${v.title}" @ ${v.company} — ${result.reason}`);
    }
  }

  log.info(`Filter complete: ${kept.length} kept, ${filtered.length} removed`);
  return { kept, filtered };
}

module.exports = { filterVacancies, filterVacancy };
