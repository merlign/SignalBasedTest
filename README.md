# Vacancy Monitoring System

Geautomatiseerd systeem dat dagelijks nieuwe vacatures scraped van Indeed.nl,
deze verrijkt via Clay, leads aanmaakt in Simplicate CRM en outreach triggert
via Instantly of Lemlist.

## Architectuur

```
Indeed.nl
    │  scrape (dagelijks 07:00 UTC)
    ▼
Vercel Cron (/api/cron)
    │  deduplicate + save
    ▼
Supabase (PostgreSQL)
    │  send to Clay
    ▼
Clay (enrichment)
    │  POST callback
    ▼
/api/callback  ──► Supabase (enriched data)
    │
    ▼
Simplicate CRM (lead aanmaken)
    │
    ▼
Instantly / Lemlist (outreach trigger)
```

## Vereisten

- Node.js >= 18
- Vercel account (Pro voor cron jobs)
- Supabase project
- Clay account met webhook-toegang
- Simplicate account met API-toegang
- Instantly of Lemlist account

## Installatie

### 1. Repository clonen

```bash
git clone <repo-url>
cd vacancy-monitoring-system
npm install
```

### 2. Supabase inrichten

1. Maak een nieuw Supabase project aan op [supabase.com](https://supabase.com)
2. Ga naar de SQL editor en voer het schema uit:

```bash
# Via Supabase CLI (aanbevolen)
supabase link --project-ref your-project-ref
supabase db push

# Of kopieer /supabase/schema.sql en plak in de SQL editor
```

### 3. Environment variables instellen

```bash
cp .env.example .env
# Vul alle waarden in .env in (zie onderstaande toelichting)
```

#### Vereiste variabelen

| Variabele | Waar te vinden |
|---|---|
| `SUPABASE_URL` | Supabase > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Settings > API > service_role |
| `CLAY_WEBHOOK_URL` | Clay > je tabel > Webhooks > Incoming |
| `CLAY_CALLBACK_SECRET` | Zelf genereren, instellen in Clay |
| `SIMPLICATE_API_KEY` | Simplicate > Instellingen > API |
| `SIMPLICATE_API_SECRET` | Simplicate > Instellingen > API |
| `INSTANTLY_API_KEY` | Instantly > Settings > API |
| `INSTANTLY_CAMPAIGN_ID` | URL van je Instantly campagne |

#### Optionele Simplicate IDs ophalen

```bash
# Lead bronnen (noteer het ID van "Indeed" of maak een nieuwe aan)
curl -H "Authentication-Key: KEY" -H "Authentication-Secret: SECRET" \
  https://api.simplicate.nl/v2/sales/source

# Custom fields (voor vacature URL en sector)
curl -H "Authentication-Key: KEY" -H "Authentication-Secret: SECRET" \
  https://api.simplicate.nl/v2/customfields/customfield
```

### 4. Clay inrichten

1. Maak een nieuwe Clay tabel aan
2. Voeg een "Webhook" bron toe — kopieer de inkomende webhook URL naar `CLAY_WEBHOOK_URL`
3. Configureer de volgende velden om te verrijken:
   - Contact naam (HR manager of eigenaar bij MKB)
   - Zakelijk e-mailadres
   - E-mail validatie (gebruik Clay's built-in email validator)
   - LinkedIn URL contactpersoon
   - Bedrijfswebsite
   - Bedrijfsgrootte
4. Voeg een "HTTP Request" actie toe die de verrijkte data POST naar `{APP_BASE_URL}/api/callback`
5. Stel de `X-Clay-Secret` header in op de waarde van `CLAY_CALLBACK_SECRET`

### 5. Lokaal testen

```bash
# Test de volledige pipeline
node api/cron.js

# Test alleen de scraper met één zoekterm
npm run test:single

# Test de scraper over alle zoektermen
npm run test:scraper
```

### 6. Deployen naar Vercel

```bash
# Installeer Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Stel environment variables in via Vercel dashboard
# of via CLI:
vercel env add SUPABASE_URL production
# (herhaal voor alle variabelen)
```

De cron job draait automatisch elke dag om 07:00 UTC (zie `vercel.json`).
Voor Vercel cron heb je een **Pro plan** nodig.

## Zoektermen uitbreiden

Voeg nieuwe sectoren of zoektermen toe in `/config/searchterms.js`:

```js
const SEARCH_TERMS = {
  bouw: ['uitvoerder', 'werkvoorbereider'],
  // Voeg hier een nieuwe sector toe:
  zorg: ['verpleegkundige', 'verzorgende IG'],
};
```

De scraper pikt de wijzigingen automatisch op bij de volgende run.

## Monitoring

- **Vercel logs**: Dashboard > je project > Functions tab
- **Run summaries**: Supabase tabel `run_summaries` — bevat dagelijkse statistieken
- **Gedetailleerde logs**: Supabase tabel `logs` — alle info/warn/error entries

```sql
-- Overzicht laatste 7 runs
select * from run_summaries
order by run_at desc
limit 7;

-- Fouten van vandaag
select * from logs
where level = 'error'
  and created_at >= now() - interval '24 hours'
order by created_at desc;

-- Pipeline doorlooptijd per vacature
select
  vacancy_id, company_name, status,
  status_new_at,
  status_enriched_at,
  status_lead_created_at,
  status_contacted_at
from vacancies
order by created_at desc
limit 50;
```

## Flow beschrijving

1. **07:00 UTC** — Vercel roept `/api/cron` aan (beveiligd met `CRON_SECRET`)
2. **Scraper** doorloopt alle zoektermen, haalt vacatures van de laatste 24 uur op
3. **Deduplicatie** filtert bestaande vacatures en bedrijven in 30-daagse cooldown
4. Nieuwe vacatures worden opgeslagen in Supabase (status: `new`)
5. **Clay webhook** ontvangt de vacature data en start enrichment
6. Clay POST'et de verrijkte data naar `/api/callback` (status: `enriched`)
7. Vacatures met gevalideerd e-mailadres worden opgepakt door de volgende run
8. **Simplicate** krijgt een nieuwe lead aangemaakt per bedrijf
9. **Instantly/Lemlist** wordt getriggerd voor de outreach e-mail (status: `contacted`)

## Prijsinformatie (voor outreach personalisatie)

- **Service**: 2 visuele advertenties + 1 dynamische video per campagne
- **Looptijd**: 16 dagen op Meta
- **Prijs**: €700 per 2 maanden
- **Gemiddelde CPL voor klant**: €30
- **Doelsectoren**: bouw, techniek, IT, back office
