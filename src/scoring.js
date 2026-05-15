'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('./logger');

const log = createLogger('scoring');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Ultieme lead criteria (configureerbaar via .env met defaults)
// ---------------------------------------------------------------------------
const MIN_EMPLOYEES      = parseInt(process.env.LEAD_MIN_EMPLOYEES || '25', 10);
const MIN_OPEN_VACANCIES = parseInt(process.env.LEAD_MIN_VACANCIES || '3', 10);
const TARGET_COUNTRIES   = (process.env.LEAD_COUNTRIES || 'nederland,belgie,belgium,belgië')
  .split(',').map((c) => c.trim().toLowerCase());

/**
 * Count how many active (non-rejected, non-filtered) vacancies exist
 * for the same company within the last 30 days.
 */
async function countOpenVacancies(companyName) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const { count, error } = await supabase
    .from('vacancies')
    .select('id', { count: 'exact', head: true })
    .ilike('company_name', companyName)
    .not('status', 'in', '("rejected","filtered")')
    .gte('created_at', cutoff.toISOString());

  if (error) {
    log.warn('Could not count open vacancies', { error: error.message });
    return 0;
  }
  return count || 0;
}

/**
 * Parse the company_size string Clay returns into an integer.
 * Clay typically returns ranges like "11-50", "51-200", "201-500".
 */
function parseEmployeeCount(companySizeStr) {
  if (!companySizeStr) return null;
  const match = String(companySizeStr).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check whether a location string suggests Netherlands or Belgium.
 */
function isTargetCountry(location) {
  if (!location) return true; // assume NL when unknown
  const loc = location.toLowerCase();
  return TARGET_COUNTRIES.some((c) => loc.includes(c)) ||
    // Dutch/Belgian postal codes (4 digits) or province names
    /\b\d{4}\b/.test(loc) ||
    /\b(amsterdam|rotterdam|utrecht|eindhoven|groningen|tilburg|almere|breda|nijmegen|den haag|'s-gravenhage|antwerpen|brussel|gent|brugge|luik)\b/.test(loc);
}

/**
 * Score a single enriched vacancy and decide if it's an "ultimate lead".
 *
 * Returns { isUltimate, score, reasons }
 */
async function scoreVacancy(vacancy) {
  const reasons = [];
  let score = 0;

  // ── Criterion 1: employee count ─────────────────────────────────────────
  const employees = parseEmployeeCount(vacancy.company_size);
  if (employees === null) {
    reasons.push('employee_count_unknown');
  } else if (employees >= MIN_EMPLOYEES) {
    score += 2;
    reasons.push(`employees_ok: ${employees}`);
  } else {
    reasons.push(`employees_too_few: ${employees}`);
  }

  // ── Criterion 2: location NL or BE ──────────────────────────────────────
  if (isTargetCountry(vacancy.location)) {
    score += 1;
    reasons.push('location_ok');
  } else {
    reasons.push(`location_outside_target: ${vacancy.location}`);
  }

  // ── Criterion 3: minimum open vacancies for this company ─────────────────
  const openVacancies = await countOpenVacancies(vacancy.company_name);
  if (openVacancies >= MIN_OPEN_VACANCIES) {
    score += 2;
    reasons.push(`open_vacancies_ok: ${openVacancies}`);
  } else {
    reasons.push(`open_vacancies_too_few: ${openVacancies}`);
  }

  // Ultimate = all three hard criteria met (score 5) OR
  // two criteria met + employee count unknown (score 3+ with unknown)
  const hardCriteriaMet =
    (employees === null || employees >= MIN_EMPLOYEES) &&
    isTargetCountry(vacancy.location) &&
    openVacancies >= MIN_OPEN_VACANCIES;

  const isUltimate = hardCriteriaMet;

  log.info(`Score for ${vacancy.company_name}: ${score}/5 — ultimate: ${isUltimate}`, {
    reasons,
  });

  return { isUltimate, score, reasons, openVacancies, employees };
}

module.exports = { scoreVacancy };
