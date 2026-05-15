'use strict';

require('dotenv').config();
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { createLogger } = require('./logger');
const { updateStatus } = require('./deduplication');
const { updateLeadStatus } = require('./crm');

const log = createLogger('outreach');

const outreachHttp = axios.create({ timeout: 10000 });
axiosRetry(outreachHttp, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: axiosRetry.isNetworkOrIdempotentRequestError,
});

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

function buildInstantlyPayload(vacancy) {
  return {
    campaign_id: process.env.INSTANTLY_CAMPAIGN_ID,
    email: vacancy.contact_email,
    first_name: vacancy.contact_first_name || vacancy.contact_name?.split(' ')[0] || '',
    last_name:
      vacancy.contact_name?.split(' ').slice(1).join(' ') || '',
    company_name: vacancy.company_name,
    personalization: {
      vacancy_title: vacancy.title,
      sector: vacancy.sector,
      vacancy_url: vacancy.url,
    },
  };
}

function buildLemlistPayload(vacancy) {
  return {
    email: vacancy.contact_email,
    firstName: vacancy.contact_first_name || vacancy.contact_name?.split(' ')[0] || '',
    lastName: vacancy.contact_name?.split(' ').slice(1).join(' ') || '',
    companyName: vacancy.company_name,
    vacancyTitle: vacancy.title,
    sector: vacancy.sector,
    vacancyUrl: vacancy.url,
  };
}

/**
 * Dispatch a single vacancy to the configured outreach provider.
 * Only fires when the contact e-mail is present and validated.
 */
async function triggerOutreach(vacancy) {
  if (!vacancy.contact_email || !vacancy.email_valid) {
    log.warn(`Skipping outreach for ${vacancy.vacancy_id} — email not validated`);
    return false;
  }

  const provider = (process.env.OUTREACH_PROVIDER || 'instantly').toLowerCase();
  let url;
  let payload;
  let headers = { 'Content-Type': 'application/json' };

  if (provider === 'instantly') {
    url = process.env.INSTANTLY_WEBHOOK_URL;
    payload = buildInstantlyPayload(vacancy);
    headers.Authorization = `Bearer ${process.env.INSTANTLY_API_KEY}`;
  } else if (provider === 'lemlist') {
    url = process.env.LEMLIST_WEBHOOK_URL;
    payload = buildLemlistPayload(vacancy);
    headers['X-Lemlist-Api-Key'] = process.env.LEMLIST_API_KEY;
  } else {
    throw new Error(`Unknown OUTREACH_PROVIDER: "${provider}"`);
  }

  if (!url) throw new Error(`Webhook URL not configured for provider "${provider}"`);

  log.info(`Triggering ${provider} outreach for ${vacancy.vacancy_id}`, {
    company: vacancy.company_name,
    email: vacancy.contact_email,
  });

  await outreachHttp.post(url, payload, { headers });
  return true;
}

/**
 * Process a list of enriched vacancies that are ready for outreach.
 * Updates Supabase status and Simplicate lead status on success.
 */
async function processOutreach(vacancies) {
  let triggered = 0;
  let skipped = 0;
  let errors = 0;

  for (const v of vacancies) {
    try {
      const sent = await triggerOutreach(v);

      if (sent) {
        await updateStatus(v.vacancy_id, 'contacted', {
          status_contacted_at: new Date().toISOString(),
        });

        // Optionally push status update to Simplicate
        if (v.simplicate_lead_id && process.env.SIMPLICATE_CONTACTED_STATUS_ID) {
          await updateLeadStatus(
            v.simplicate_lead_id,
            process.env.SIMPLICATE_CONTACTED_STATUS_ID
          );
        }

        triggered++;
      } else {
        skipped++;
      }
    } catch (err) {
      log.error(`Outreach failed for ${v.vacancy_id}`, { error: err.message });
      errors++;
    }
  }

  log.info('Outreach dispatch complete', { triggered, skipped, errors });
  return { triggered, skipped, errors };
}

module.exports = { processOutreach, triggerOutreach };
