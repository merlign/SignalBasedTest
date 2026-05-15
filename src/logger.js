'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function timestamp() {
  return new Date().toISOString();
}

function fmt(level, module, message, data) {
  const base = `[${timestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
  return data ? `${base} ${JSON.stringify(data)}` : base;
}

function write(level, module, message, data) {
  if (LOG_LEVELS[level] < MIN_LEVEL) return;
  const line = fmt(level, module, message, data);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

/**
 * Persist a log entry to Supabase for historical overview.
 * Fires-and-forgets — never throws.
 */
async function persist(level, module, message, data) {
  try {
    await supabase.from('logs').insert({
      level,
      module,
      message,
      data: data || null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // silently ignore DB errors inside the logger
  }
}

function createLogger(module) {
  return {
    debug: (msg, data) => write('debug', module, msg, data),
    info: (msg, data) => {
      write('info', module, msg, data);
      persist('info', module, msg, data);
    },
    warn: (msg, data) => {
      write('warn', module, msg, data);
      persist('warn', module, msg, data);
    },
    error: (msg, data) => {
      write('error', module, msg, data);
      persist('error', module, msg, data);
    },
  };
}

/**
 * Write the daily run summary both to console and Supabase.
 */
async function writeSummary(stats) {
  const logger = createLogger('summary');
  logger.info('=== DAILY RUN SUMMARY ===', stats);

  try {
    await supabase.from('run_summaries').insert({
      scraped: stats.scraped,
      new_vacancies: stats.newVacancies,
      enriched: stats.enriched,
      leads_created: stats.leadsCreated,
      outreach_triggered: stats.outreachTriggered,
      errors: stats.errors,
      run_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Failed to persist run summary', { error: err.message });
  }
}

module.exports = { createLogger, writeSummary };
