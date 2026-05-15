'use strict';

require('dotenv').config();
const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { createClient } = require('@supabase/supabase-js');
const { createLogger } = require('./logger');
const { updateStatus } = require('./deduplication');

const log = createLogger('crm');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Simplicate HTTP client
// ---------------------------------------------------------------------------
const simplicateHttp = axios.create({
  baseURL: process.env.SIMPLICATE_BASE_URL || 'https://api.simplicate.nl/v2',
  timeout: 15000,
  headers: {
    'Authentication-Key': process.env.SIMPLICATE_API_KEY,
    'Authentication-Secret': process.env.SIMPLICATE_API_SECRET,
    'Content-Type': 'application/json',
  },
});

axiosRetry(simplicateHttp, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) ||
    (err.response && err.response.status >= 500),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Search for an existing organisation in Simplicate by exact name.
 * Returns the organisation object or null.
 */
async function findOrganisation(companyName) {
  const { data } = await simplicateHttp.get('/crm/organization', {
    params: { 'q[name]': companyName, limit: 1 },
  });
  return data?.data?.[0] || null;
}

/**
 * Search for an existing lead in Simplicate by organisation name.
 * Returns the lead object or null.
 */
async function findExistingLead(companyName) {
  const { data } = await simplicateHttp.get('/sales/lead', {
    params: { 'q[organization.name]': companyName, limit: 1 },
  });
  return data?.data?.[0] || null;
}

/**
 * Create a new organisation in Simplicate and return its ID.
 */
async function createOrganisation(vacancy) {
  const payload = {
    name: vacancy.company_name,
    note: `Gevonden via Indeed.nl — sector: ${vacancy.sector}`,
    visiting_address: {
      country_id: 'country:152', // Netherlands
    },
  };

  if (vacancy.company_website) {
    payload.url = vacancy.company_website;
  }

  const { data } = await simplicateHttp.post('/crm/organization', payload);
  return data.data.id;
}

/**
 * Create a contact person inside an existing Simplicate organisation.
 * Returns the person ID or null when no contact data is available.
 */
async function createContactPerson(organisationId, vacancy) {
  if (!vacancy.contact_name && !vacancy.contact_email) return null;

  const nameParts = (vacancy.contact_name || '').split(' ');
  const firstName = vacancy.contact_first_name || nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const payload = {
    organization_id: organisationId,
    first_name: firstName,
    family_name: lastName || vacancy.company_name,
    email_addresses: vacancy.contact_email
      ? [{ email: vacancy.contact_email, type: 'work', primary: true }]
      : [],
  };

  const { data } = await simplicateHttp.post('/crm/person', payload);
  return data.data.id;
}

/**
 * Create a lead in Simplicate.
 * Returns the newly created lead's ID.
 */
async function createLead(vacancy) {
  const companyName = vacancy.company_name;
  log.info(`Creating Simplicate lead for: ${companyName}`);

  // ── 1. Duplicate guard ──────────────────────────────────────────────────
  const existingLead = await findExistingLead(companyName);
  if (existingLead) {
    log.warn(`Lead already exists in Simplicate for ${companyName}`, {
      leadId: existingLead.id,
    });
    await updateStatus(vacancy.vacancy_id, 'crm_duplicate', {
      simplicate_lead_id: existingLead.id,
    });
    return existingLead.id;
  }

  // ── 2. Resolve or create organisation ───────────────────────────────────
  let org = await findOrganisation(companyName);
  let orgId = org?.id;
  if (!orgId) {
    orgId = await createOrganisation(vacancy);
    log.info(`Created organisation in Simplicate: ${orgId}`);
  }

  // ── 3. Optionally create a contact person ───────────────────────────────
  const personId = await createContactPerson(orgId, vacancy);

  // ── 4. Create the lead ──────────────────────────────────────────────────
  const noteBody = [
    `Vacaturetitel: ${vacancy.title}`,
    `Sector: ${vacancy.sector}`,
    `Bron: Indeed.nl`,
    `Datum vacature: ${vacancy.posted_at}`,
    `Vacature URL: ${vacancy.url}`,
    vacancy.company_size ? `Bedrijfsgrootte: ${vacancy.company_size}` : null,
    vacancy.linkedin_url ? `LinkedIn: ${vacancy.linkedin_url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const leadPayload = {
    organization_id: orgId,
    ...(personId ? { person_id: personId } : {}),
    source_id: process.env.SIMPLICATE_LEAD_SOURCE_ID || undefined,
    name: `${companyName} — ${vacancy.title}`,
    note: noteBody,
    custom_fields: [
      { id: process.env.SIMPLICATE_CF_VACANCY_URL, value: vacancy.url },
      { id: process.env.SIMPLICATE_CF_SECTOR, value: vacancy.sector },
    ].filter((cf) => cf.id),
  };

  const { data } = await simplicateHttp.post('/sales/lead', leadPayload);
  const leadId = data.data.id;

  // ── 5. Persist lead ID and update status ─────────────────────────────────
  await updateStatus(vacancy.vacancy_id, 'lead_created', {
    simplicate_lead_id: leadId,
    status_lead_created_at: new Date().toISOString(),
  });

  log.info(`Lead created in Simplicate: ${leadId} for ${companyName}`);
  return leadId;
}

/**
 * Process all enriched vacancies that have a validated email address
 * and create Simplicate leads for them.
 */
async function processEnrichedLeads(vacancies) {
  let created = 0;
  let errors = 0;

  for (const v of vacancies) {
    try {
      await createLead(v);
      created++;
    } catch (err) {
      log.error(`Failed to create lead for ${v.vacancy_id}`, { error: err.message });
      errors++;
    }
  }

  log.info('Lead creation complete', { created, errors });
  return { created, errors };
}

/**
 * Update a lead's status in Simplicate (e.g. after outreach is sent).
 */
async function updateLeadStatus(simplicateLeadId, statusId) {
  if (!simplicateLeadId || !statusId) return;
  try {
    await simplicateHttp.put(`/sales/lead/${simplicateLeadId}`, {
      status_id: statusId,
    });
  } catch (err) {
    log.warn(`Could not update Simplicate lead status for ${simplicateLeadId}`, {
      error: err.message,
    });
  }
}

module.exports = { processEnrichedLeads, updateLeadStatus };
