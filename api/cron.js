'use strict';

require('dotenv').config();
const { runScraper } = require('../src/scraper');
const { filterVacancies } = require('../src/filter');
const { filterNew, saveVacancies } = require('../src/deduplication');
const { enrichVacancies, getEnrichedWithValidEmail } = require('../src/enrichment');
const { processEnrichedLeads, createFollowUpTask } = require('../src/crm');
const { processOutreach } = require('../src/outreach');
const { scoreVacancy } = require('../src/scoring');
const { createLogger, writeSummary } = require('../src/logger');
const { createClient } = require('@supabase/supabase-js');

const log = createLogger('cron');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------
async function runDailyPipeline() {
  const stats = {
    scraped: 0,
    filtered: 0,
    newVacancies: 0,
    enriched: 0,
    ultimateLeads: 0,
    leadsCreated: 0,
    outreachTriggered: 0,
    errors: 0,
  };

  log.info('========================================');
  log.info('   Vacancy pipeline gestart');
  log.info('========================================');

  try {
    // ── Stap 1: Scrapen ───────────────────────────────────────────────────
    log.info('Stap 1/6 — Indeed scrapen...');
    const scraped = await runScraper();
    stats.scraped = scraped.length;
    log.info(`✓ ${stats.scraped} vacatures gevonden op Indeed`);

    // ── Stap 2: Filteren (geen marketing/uitzend/overheid/etc.) ───────────
    log.info('Stap 2/6 — Irrelevante bedrijven filteren...');
    const { kept, filtered } = filterVacancies(scraped);
    stats.filtered = filtered.length;
    log.info(`✓ ${kept.length} relevant, ${stats.filtered} gefilterd`);

    // Sla gefilterde vacatures op met reden (voor auditing)
    if (filtered.length > 0) {
      const filteredRows = filtered.map((v) => ({
        vacancy_id: v.id,
        source: v.source,
        url: v.url,
        title: v.title,
        company_name: v.company,
        location: v.location,
        sector: v.sector,
        search_term: v.searchTerm,
        snippet: v.snippet,
        posted_at: v.postedAt,
        raw_date: v.rawDate,
        scraped_at: v.scrapedAt,
        status: 'filtered',
        filter_reason: v.filterReason,
        status_filtered_at: new Date().toISOString(),
        status_new_at: new Date().toISOString(),
      }));

      // Upsert zodat gefilterde vacatures niet opnieuw worden opgeslagen
      await supabase.from('vacancies').upsert(filteredRows, {
        onConflict: 'vacancy_id',
        ignoreDuplicates: true,
      });
    }

    // ── Stap 3: Dedupliceren & opslaan ────────────────────────────────────
    log.info('Stap 3/6 — Dedupliceren...');
    const { newVacancies, duplicateCount } = await filterNew(kept);
    stats.newVacancies = newVacancies.length;
    log.info(`✓ ${stats.newVacancies} nieuw, ${duplicateCount} al bekend (of in cooldown)`);

    const saved = await saveVacancies(newVacancies);

    // ── Stap 4: Naar Clay sturen voor enrichment ──────────────────────────
    if (saved.length > 0) {
      log.info('Stap 4/6 — Naar Clay sturen voor verrijking...');
      const { enrichedCount, errorCount } = await enrichVacancies(saved);
      stats.enriched = enrichedCount;
      stats.errors += errorCount;
      log.info(`✓ ${enrichedCount} naar Clay gestuurd`);
    } else {
      log.info('Stap 4/6 — Geen nieuwe vacatures om te verrijken');
    }

    // ── Stap 5: Verrijkte leads verwerken (van vorige runs) ───────────────
    log.info('Stap 5/6 — Verrijkte leads verwerken...');
    const enrichedReady = await getEnrichedWithValidEmail();
    log.info(`  ${enrichedReady.length} vacatures klaar voor CRM`);

    let ultimateLeads = 0;

    if (enrichedReady.length > 0) {
      for (const v of enrichedReady) {
        try {
          // Score bepalen
          const scoreInfo = await scoreVacancy(v);

          // Lead aanmaken in Simplicate
          const { created } = await processEnrichedLeads([v]);
          stats.leadsCreated += created;

          // Ultieme lead? → Taak aanmaken in Simplicate
          if (scoreInfo.isUltimate && v.simplicate_lead_id) {
            await createFollowUpTask(v.simplicate_lead_id, v, scoreInfo);
            ultimateLeads++;
            log.info(`🔥 Ultieme lead: ${v.company_name} (score ${scoreInfo.score}/5)`);
          }
        } catch (err) {
          log.error(`Fout bij verwerken van ${v.vacancy_id}`, { error: err.message });
          stats.errors++;
        }
      }
    }

    stats.ultimateLeads = ultimateLeads;
    log.info(`✓ ${stats.leadsCreated} leads aangemaakt, ${ultimateLeads} ultieme leads`);

    // ── Stap 6: Outreach triggeren ─────────────────────────────────────────
    log.info('Stap 6/6 — Outreach triggeren...');
    const forOutreach = await getEnrichedWithValidEmail();
    if (forOutreach.length > 0) {
      const { triggered, errors: oErrors } = await processOutreach(forOutreach);
      stats.outreachTriggered = triggered;
      stats.errors += oErrors;
      log.info(`✓ ${triggered} outreach e-mails verstuurd`);
    } else {
      log.info('  Geen vacatures klaar voor outreach');
    }

  } catch (err) {
    log.error('Pipeline gestopt door onverwachte fout', { error: err.message });
    stats.errors++;
  }

  // ── Samenvatting ──────────────────────────────────────────────────────────
  await writeSummary(stats);

  log.info('========================================');
  log.info('   SAMENVATTING');
  log.info(`   Gevonden op Indeed:   ${stats.scraped}`);
  log.info(`   Gefilterd (niet B2B): ${stats.filtered}`);
  log.info(`   Nieuw opgeslagen:     ${stats.newVacancies}`);
  log.info(`   Naar Clay gestuurd:   ${stats.enriched}`);
  log.info(`   Leads aangemaakt:     ${stats.leadsCreated}`);
  log.info(`   🔥 Ultieme leads:     ${stats.ultimateLeads}`);
  log.info(`   Outreach verstuurd:   ${stats.outreachTriggered}`);
  log.info(`   Fouten:               ${stats.errors}`);
  log.info('========================================');

  return stats;
}

// ---------------------------------------------------------------------------
// Vercel serverless handler
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const stats = await runDailyPipeline();
    return res.status(200).json({ ok: true, stats });
  } catch (err) {
    log.error('Cron handler error', { error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
};

// ---------------------------------------------------------------------------
// Direct uitvoeren: node api/cron.js  OF  npm start
// ---------------------------------------------------------------------------
if (require.main === module) {
  runDailyPipeline()
    .then((stats) => {
      process.exit(stats.errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
