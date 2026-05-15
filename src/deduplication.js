'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('./logger');

const log = createLogger('deduplication');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Companies contacted within this many days are skipped. */
const COMPANY_COOLDOWN_DAYS = 30;

/**
 * Check which of the given vacancies are truly new.
 *
 * Rules:
 *  1. Vacancy URL/ID must not already exist in the DB.
 *  2. The company must not have been contacted (status != 'rejected') within
 *     the last COMPANY_COOLDOWN_DAYS days.
 *
 * Returns { newVacancies, duplicateCount }.
 */
async function filterNew(vacancies) {
  if (!vacancies.length) return { newVacancies: [], duplicateCount: 0 };

  // ── 1. Batch-check vacancy IDs ──────────────────────────────────────────
  const ids = vacancies.map((v) => v.id);
  const { data: existing, error: idErr } = await supabase
    .from('vacancies')
    .select('vacancy_id')
    .in('vacancy_id', ids);

  if (idErr) throw new Error(`Supabase ID check failed: ${idErr.message}`);

  const existingIds = new Set((existing || []).map((r) => r.vacancy_id));

  // ── 2. Batch-check company cooldown ─────────────────────────────────────
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - COMPANY_COOLDOWN_DAYS);

  const companies = [...new Set(vacancies.map((v) => v.company.toLowerCase().trim()))];
  const { data: recentCompanies, error: compErr } = await supabase
    .from('vacancies')
    .select('company_name')
    .in('company_name', companies)
    .neq('status', 'rejected')
    .gte('created_at', cutoff.toISOString());

  if (compErr) throw new Error(`Supabase company check failed: ${compErr.message}`);

  const recentCompanyNames = new Set(
    (recentCompanies || []).map((r) => r.company_name.toLowerCase().trim())
  );

  // ── 3. Filter ────────────────────────────────────────────────────────────
  const newVacancies = [];
  let duplicateCount = 0;

  for (const v of vacancies) {
    if (existingIds.has(v.id)) {
      log.debug(`Duplicate vacancy ID: ${v.id}`);
      duplicateCount++;
      continue;
    }
    if (recentCompanyNames.has(v.company.toLowerCase().trim())) {
      log.debug(`Company in cooldown: ${v.company}`);
      duplicateCount++;
      continue;
    }
    newVacancies.push(v);
  }

  log.info(`Deduplication: ${newVacancies.length} new, ${duplicateCount} skipped`);
  return { newVacancies, duplicateCount };
}

/**
 * Persist a batch of new vacancies to Supabase.
 * Returns the inserted rows (with their UUIDs).
 */
async function saveVacancies(vacancies) {
  if (!vacancies.length) return [];

  const rows = vacancies.map((v) => ({
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
    status: 'new',
    status_new_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from('vacancies').insert(rows).select();

  if (error) throw new Error(`Failed to save vacancies: ${error.message}`);

  log.info(`Saved ${data.length} vacancies to Supabase`);
  return data;
}

/**
 * Update the status of a single vacancy and record the transition timestamp.
 */
async function updateStatus(vacancyId, status, extra = {}) {
  const timestampField = `status_${status}_at`;
  const update = {
    status,
    [timestampField]: new Date().toISOString(),
    ...extra,
  };

  const { error } = await supabase
    .from('vacancies')
    .update(update)
    .eq('vacancy_id', vacancyId);

  if (error) {
    log.error(`Failed to update status for ${vacancyId}`, { error: error.message });
    throw error;
  }
}

module.exports = { filterNew, saveVacancies, updateStatus };
