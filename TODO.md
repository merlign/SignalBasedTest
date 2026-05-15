# TODO — Vacancy Monitoring System

Last updated: 2026-05-15

---

## FASE 1 — SCRAPER
- [x] Indeed scraper basis opzetten (`/src/scraper.js`) — 2026-05-15
- [x] Zoektermen config maken (`/config/searchterms.js`) — 2026-05-15
- [x] User-agent rotation implementeren (6 agents in scraper.js) — 2026-05-15
- [x] Rate limiting implementeren (2s delay tussen requests) — 2026-05-15
- [x] Retry logic implementeren (axios-retry, max 3 pogingen) — 2026-05-15
- [x] Filteren op datum (laatste 24 uur, `parseIndeedDate`) — 2026-05-15
- [ ] Testen met 1 zoekterm (`npm run test:single`)
- [ ] Alle zoektermen testen (`npm run test:scraper`)

## FASE 2 — DATABASE
- [x] Supabase tabel schema uitvoeren (`/supabase/schema.sql`) — 2026-05-15
- [x] Deduplicatie logica bouwen (`/src/deduplication.js`) — 2026-05-15
- [x] Status tracking implementeren (status machine + timestamp fields) — 2026-05-15
- [x] 30-dagen cooldown logica (filterNew in deduplication.js) — 2026-05-15
- [ ] Supabase project aanmaken en schema uitvoeren

## FASE 3 — ENRICHMENT
- [x] Clay webhook endpoint bouwen (enrichVacancies in `/src/enrichment.js`) — 2026-05-15
- [x] Callback endpoint bouwen (`/api/callback.js`) — 2026-05-15
- [x] Enrichment data opslaan (handleCallback schrijft naar Supabase) — 2026-05-15
- [x] Validatie op mailadres (email_valid boolean via Clay) — 2026-05-15
- [ ] Clay tabel inrichten en webhook URL ophalen
- [ ] Callback URL configureren in Clay

## FASE 4 — CRM
- [x] Simplicate API koppeling bouwen (`/src/crm.js`) — 2026-05-15
- [x] Lead aanmaken logica (createLead met organisatie + contactpersoon) — 2026-05-15
- [x] Duplicate check op bedrijfsnaam (findExistingLead) — 2026-05-15
- [x] Status sync (updateLeadStatus naar Simplicate) — 2026-05-15
- [ ] Simplicate API key + secret ophalen
- [ ] Lead source ID + custom field IDs invullen in .env

## FASE 5 — OUTREACH
- [x] Instantly/Lemlist webhook bouwen (`/src/outreach.js`) — 2026-05-15
- [x] Personalisatie variabelen koppelen (voornaam, bedrijf, vacaturetitel, sector) — 2026-05-15
- [x] Trigger logica (alleen bij email_valid = true) — 2026-05-15
- [ ] Outreach provider kiezen en API key instellen
- [ ] Campaign ID instellen in .env

## FASE 6 — DEPLOYMENT
- [x] Vercel cron configureren (`vercel.json` — dagelijks 07:00 UTC) — 2026-05-15
- [ ] Vercel project aanmaken en koppelen
- [ ] Environment variables instellen in Vercel dashboard
- [ ] End-to-end test draaien (lokaal met `node api/cron.js`)
- [ ] Monitoring instellen (Vercel logs + Supabase run_summaries tabel)

---

## Notities
- Scraper gebruikt `fromage=1` query parameter om Indeed al server-side te filteren op 24 uur
- Clay callback wordt beveiligd via `X-Clay-Secret` header
- Vercel cron wordt beveiligd via `CRON_SECRET` bearer token
- RLS in Supabase: alleen de service role key heeft toegang
