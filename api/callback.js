'use strict';

require('dotenv').config();
const { handleCallback } = require('../src/enrichment');
const { createLogger } = require('../src/logger');

const log = createLogger('callback');

/**
 * POST /api/callback
 *
 * Clay calls this endpoint after it finishes enriching a vacancy.
 * Expected JSON body:
 * {
 *   vacancy_id:          string   (required)
 *   contact_name:        string
 *   contact_first_name:  string
 *   contact_email:       string
 *   linkedin_url:        string
 *   company_website:     string
 *   company_size:        string
 *   email_valid:         boolean
 * }
 */
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: verify a shared secret Clay sends as a header
  const callbackSecret = process.env.CLAY_CALLBACK_SECRET;
  if (callbackSecret) {
    const incoming = req.headers['x-clay-secret'] || req.headers['authorization'];
    if (!incoming || !incoming.includes(callbackSecret)) {
      log.warn('Callback rejected — invalid secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload.vacancy_id) {
    return res.status(400).json({ error: 'Missing required field: vacancy_id' });
  }

  try {
    const result = await handleCallback(payload);
    log.info(`Callback processed successfully`, { vacancy_id: payload.vacancy_id });
    return res.status(200).json(result);
  } catch (err) {
    log.error('Callback processing failed', {
      vacancy_id: payload.vacancy_id,
      error: err.message,
    });
    return res.status(500).json({ error: err.message });
  }
};
