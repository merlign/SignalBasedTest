# TODO — Vacancy Monitoring System

Last updated: 2026-05-15

---

## FASE 1 — SCRAPER
- [x] Indeed scraper basis opzetten (`/src/scraper.js`) — 2026-05-15
- [x] Zoektermen config maken (`/config/searchterms.js`) — 2026-05-15
- [x] User-agent rotation implementeren (6 agents) — 2026-05-15
- [x] Rate limiting implementeren (2s delay) — 2026-05-15
- [x] Retry logic implementeren (axios-retry, max 3x) — 2026-05-15
- [x] Filteren op datum (laatste 24 uur) — 2026-05-15
- [x] JSON extractie uit Indeed pagina (ipv HTML selectors) — 2026-05-15
- [x] Sectoren uitgebreid: metaalElektro + spoorwegtechniek — 2026-05-15
- [x] IT en backoffice sectoren verwijderd (verkeerde leads) — 2026-05-15
- [x] Testen met 1 zoekterm ✅ 15 vacatures gevonden — 2026-05-15
- [ ] Alle zoektermen testen (`npm run test:scraper`)

## FASE 2 — DATABASE
- [x] Supabase tabel schema uitvoeren (`/supabase/schema.sql`) — 2026-05-15
- [x] Deduplicatie logica bouwen (`/src/deduplication.js`) — 2026-05-15
- [x] Status tracking implementeren (status machine + timestamps) — 2026-05-15
- [x] 30-dagen cooldown logica — 2026-05-15
- [x] filter_reason kolom toegevoegd aan schema — 2026-05-15
- [ ] Supabase project aanmaken en schema uitvoeren

## FASE 3 — FILTERING
- [x] Filter module gebouwd (`/src/filter.js`) — 2026-05-15
- [x] Company whitelist (ProRail, Heijmans, BAM, etc.) — 2026-05-15
- [x] Company blacklist (marketing, uitzend, overheid, zorg, etc.) — 2026-05-15
- [x] Titel hard-reject lijst (recruiter, developer, marketeer, etc.) — 2026-05-15
- [x] Titel positief lijst (monteur, uitvoerder, lasser, etc.) — 2026-05-15
- [x] Snippet hard-reject (uitzendbureau signalen) — 2026-05-15
- [x] Gefilterde vacatures opslaan met reden (audit trail) — 2026-05-15
- [ ] Filter testen (`npm run test:filter`)

## FASE 4 — ENRICHMENT
- [x] Clay webhook endpoint bouwen — 2026-05-15
- [x] Callback endpoint bouwen (`/api/callback.js`) — 2026-05-15
- [x] Enrichment data opslaan — 2026-05-15
- [x] Validatie op mailadres — 2026-05-15
- [ ] Clay tabel inrichten en webhook URL ophalen
- [ ] Callback URL configureren in Clay

## FASE 5 — SCORING & CRM
- [x] Scoringssysteem gebouwd (`/src/scoring.js`) — 2026-05-15
- [x] Ultieme lead criteria: 25+ medewerkers, NL/BE, 3+ vacatures — 2026-05-15
- [x] Simplicate API koppeling — 2026-05-15
- [x] Lead aanmaken met organisatie + contactpersoon — 2026-05-15
- [x] Duplicate check op bedrijfsnaam — 2026-05-15
- [x] Follow-up taak aanmaken bij ultieme lead — 2026-05-15
- [ ] Simplicate API key + secret ophalen
- [ ] SIMPLICATE_ASSIGNEE_ID ophalen (jouw medewerker ID)

## FASE 6 — OUTREACH
- [x] Instantly/Lemlist webhook — 2026-05-15
- [x] Personalisatie variabelen — 2026-05-15
- [x] Trigger alleen bij email_valid = true — 2026-05-15
- [ ] Outreach provider kiezen en API key instellen

## FASE 7 — DEPLOYMENT
- [x] Vercel cron configureren (dagelijks 07:00 UTC) — 2026-05-15
- [x] `npm start` als enkel commando om alles te draaien — 2026-05-15
- [ ] Vercel project aanmaken en koppelen
- [ ] Environment variables instellen in Vercel
- [ ] End-to-end test: `npm start`
- [ ] Monitoring via Supabase `run_summaries` tabel

---

## Ultieme lead definitie
Een lead is "ultiem" als aan ALLE drie criteria wordt voldaan:
- ≥ 25 medewerkers (via Clay enrichment)
- Locatie in Nederland of België
- ≥ 3 vacatures van hetzelfde bedrijf in de afgelopen 30 dagen

Bij een ultieme lead:
→ Lead aanmaken in Simplicate
→ Follow-up taak aanmaken → notificatie in Simplicate

## Gefilterde sectoren (bewust uitgesloten)
- Marketing/reclame bureaus
- Web design / grafisch
- Recruitment & uitzendbureaus
- Overheid (gemeente, provincie, ministerie)
- Zorg & welzijn
- Onderwijs
- Retail & horeca
- Finance & juridisch
- Schoonmaak & facilitair
