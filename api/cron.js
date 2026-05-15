'use strict';

require('dotenv').config();
const { runScraper } = require('../src/scraper');
const { filterNew, saveVacancies } = require('../src/deduplication');
const { enrichVacancies, getEnrichedWithValidEmail } = require('../src/enrichment');
const { processEnrichedLeads } = require('../src/crm');
const { processOutreach } = require('../src/outreach');
const { createLogger, writeSummary } = require('../src/logger');

const log = createLogger('cron');

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Full daily pipeline:
 *   scrape → deduplicate → save → enrich → CRM → outreach
 *
 * The function is exported so Vercel can call it as a serverless handler,
 * and also executed directly when the file is run via Node.
 */
async function runDailyPipeline() {
  const stats = {
    scraped: 0,
    newVacancies: 0,
    enriched: 0,
    leadsCreated: 0,
    outreachTriggered: 0,
    errors: 0,
  };

  log.info('=== Daily vacancy pipeline started ===');

  try {
    // ── Step 1: Scrape ─────────────────────────────────────────────────────
    const scraped = await runScraper();
    stats.scraped = scraped.length;
    log.info(`Step 1 done — scraped: ${stats.scraped}`);

    // ── Step 2: Deduplicate & save ─────────────────────────────────────────
    const { newVacancies, duplicateCount } = await filterNew(scraped);
    stats.newVacancies = newVacancies.length;
    log.info(`Step 2 done — new: ${stats.newVacancies}, duplicates skipped: ${duplicateCount}`);

    const saved = await saveVacancies(newVacancies);

    // ── Step 3: Send to Clay for enrichment ───────────────────────────────
    if (saved.length > 0) {
      const { enrichedCount, errorCount } = await enrichVacancies(saved);
      stats.enriched = enrichedCount;
      stats.errors += errorCount;
      log.info(`Step 3 done — sent to Clay: ${enrichedCount}`);
    }

    // ── Step 4: CRM — process vacancies enriched in previous runs ─────────
    // (current run's enrichment comes back async via /api/callback)
    const enrichedReady = await getEnrichedWithValidEmail();
    log.info(`Step 4 — found ${enrichedReady.length} enriched vacancies ready for CRM`);

    if (enrichedReady.length > 0) {
      const { created, errors } = await processEnrichedLeads(enrichedReady);
      stats.leadsCreated = created;
      stats.errors += errors;
      log.info(`Step 4 done — leads created: ${created}`);
    }

    // ── Step 5: Outreach — vacancies that now have a Simplicate lead ───────
    // Re-query to pick up the freshly created leads
    const forOutreach = await getEnrichedWithValidEmail(); // status still 'enriched' means no outreach yet
    if (forOutreach.length > 0) {
      const { triggered, errors: oErrors } = await processOutreach(forOutreach);
      stats.outreachTriggered = triggered;
      stats.errors += oErrors;
      log.info(`Step 5 done — outreach triggered: ${triggered}`);
    }
  } catch (err) {
    log.error('Pipeline encountered a fatal error', { error: err.message, stack: err.stack });
    stats.errors++;
  }

  await writeSummary(stats);
  log.info('=== Daily vacancy pipeline finished ===', stats);
  return stats;
}

// ---------------------------------------------------------------------------
// Vercel serverless handler (GET /api/cron — called by Vercel cron)
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  // Verify Vercel's cron secret to prevent unauthorized triggers
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
// Direct execution (node api/cron.js)
// ---------------------------------------------------------------------------
if (require.main === module) {
  runDailyPipeline()
    .then((stats) => {
      console.log('\nFinal stats:', stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}
