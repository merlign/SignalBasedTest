'use strict';

require('dotenv').config();
const { scrapeTerm } = require('../src/scraper');
const { filterVacancies } = require('../src/filter');
const { filterNew, saveVacancies } = require('../src/deduplication');
const { SEARCH_TERMS } = require('../config/searchterms');

const sector = process.argv[2];

if (!sector || !SEARCH_TERMS[sector]) {
  console.error(`\nGebruik: npm run <sector>`);
  console.error(`Beschikbare sectoren: ${Object.keys(SEARCH_TERMS).join(', ')}\n`);
  process.exit(1);
}

async function run() {
  const terms = SEARCH_TERMS[sector];
  console.log(`\nScraping sector "${sector}" (${terms.length} zoektermen)...\n`);

  const all = [];
  for (const term of terms) {
    const results = await scrapeTerm(term, sector);
    all.push(...results);
  }

  // Zelfde vacature kan via meerdere zoektermen gevonden worden — dedup op ID
  const unique = [...new Map(all.map((v) => [v.id, v])).values()];

  const { kept, filtered } = filterVacancies(unique);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Sector:         ${sector}`);
  console.log(`Gevonden:       ${all.length}`);
  console.log(`Na filter:      ${kept.length}`);
  console.log(`Gefilterd:      ${filtered.length}`);
  console.log(`${'─'.repeat(50)}\n`);

  kept.forEach((v) => {
    console.log(`✓ ${v.company.padEnd(35)} ${v.title}`);
  });

  if (filtered.length > 0) {
    console.log(`\nGefilterd (${filtered.length}):`);
    filtered.forEach((v) => {
      console.log(`✗ ${v.company.padEnd(35)} → ${v.filterReason}`);
    });
  }

  // Dedupliceren en opslaan in Supabase
  console.log(`\nOpslaan in Supabase...`);
  const { newVacancies, duplicateCount } = await filterNew(kept);
  const saved = await saveVacancies(newVacancies);
  console.log(`✓ ${saved.length} nieuw opgeslagen, ${duplicateCount} al bekend\n`);
}

run().catch((err) => {
  console.error('Fout:', err.message);
  process.exit(1);
});
