'use strict';

require('dotenv').config();
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('./logger');
const { updateStatus } = require('./deduplication');

const log = createLogger('enrichment');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const clayHttp = axios.create({ timeout: 10000 });
axiosRetry(clayHttp, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: axiosRetry.isNetworkOrIdempotentRequestError,
});

/**
 * Send a single vacancy to the Clay webhook for enrichment.
 * Clay will call back our /api/callback endpoint when done.
 */
async function sendToClay(vacancy) {
  const webhookUrl = process.env.CLAY_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('CLAY_WEBHOOK_URL is not configured');

  const payload = {
    vacancy_id: vacancy.vacancy_id,
    company_name: vacancy.company_name,
    vacancy_url: vacancy.url,
    vacancy_title: vacancy.title,
    location: vacancy.location,
    sector: vacancy.sector,
    posted_at: vacancy.posted_at,
    // Callback URL so Clay knows where to POST the enriched data
    callback_url: `${process.env.APP_BASE_URL}/api/callback`,
  };

  log.info(`Sending to Clay: ${vacancy.company_name} — "${vacancy.title}"`);

  const { data } = await clayHttp.post(webhookUrl, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CLAY_API_KEY || ''}`,
    },
  });

  return data;
}

/**
 * Send all new vacancies to Clay for enrichment, in sequence to respect
 * Clay's rate limits.
 */
async function enrichVacancies(vacancies) {
  let enrichedCount = 0;
  let errorCount = 0;

  for (const v of vacancies) {
    try {
      await sendToClay(v);
      // Mark as "enrichment in progress" — the callback will flip it to 'enriched'
      await updateStatus(v.vacancy_id, 'enriching');
      enrichedCount++;
    } catch (err) {
      log.error(`Clay send failed for ${v.vacancy_id}`, { error: err.message });
      errorCount++;
    }
  }

  log.info(`Enrichment dispatch done`, { sent: enrichedCount, errors: errorCount });
  return { enrichedCount, errorCount };
}

/**
 * Handle the incoming enrichment callback from Clay.
 * Saves enriched fields to Supabase and transitions status to 'enriched'.
 *
 * Expected payload shape (Clay fills in what it finds):
 * {
 *   vacancy_id,
 *   contact_name, contact_first_name, contact_email,
 *   linkedin_url, company_website, company_size,
 *   email_valid   // boolean
 * }
 */
async function handleCallback(payload) {
  const {
    vacancy_id,
    contact_name,
    contact_first_name,
    contact_email,
    linkedin_url,
    company_website,
    company_size,
    email_valid,
  } = payload;

  if (!vacancy_id) throw new Error('callback payload missing vacancy_id');

  log.info(`Received enrichment callback for ${vacancy_id}`, {
    contact_email,
    email_valid,
  });

  const { error } = await supabase
    .from('vacancies')
    .update({
      contact_name: contact_name || null,
      contact_first_name: contact_first_name || null,
      contact_email: contact_email || null,
      linkedin_url: linkedin_url || null,
      company_website: company_website || null,
      company_size: company_size || null,
      email_valid: email_valid === true,
      status: 'enriched',
      status_enriched_at: new Date().toISOString(),
    })
    .eq('vacancy_id', vacancy_id);

  if (error) throw new Error(`Failed to save enrichment for ${vacancy_id}: ${error.message}`);

  log.info(`Enrichment saved for ${vacancy_id}`);
  return { success: true, vacancy_id };
}

/**
 * Fetch all vacancies that are enriched with a validated email address
 * and have not yet been processed further.
 */
async function getEnrichedWithValidEmail() {
  const { data, error } = await supabase
    .from('vacancies')
    .select('*')
    .eq('status', 'enriched')
    .eq('email_valid', true)
    .not('contact_email', 'is', null);

  if (error) throw new Error(`Failed to fetch enriched vacancies: ${error.message}`);
  return data || [];
}

module.exports = { enrichVacancies, handleCallback, getEnrichedWithValidEmail };
