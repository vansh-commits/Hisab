<div align="center">

# ◆ Hisab

**GST billing and bookkeeping for Indian jewellers, built for the phone.**

Weight × rate + making · CGST / SGST / IGST · Old-gold exchange · Khata · Daily IBJA gold & silver rates

[Live app](https://hisab-zeta-opal.vercel.app) · [Architecture](docs/architecture.md) · [API](docs/api.md) · [Tax engine](docs/tax-engine.md)

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React_Router-v8-CA4245?logo=reactrouter&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Postgres](https://img.shields.io/badge/Postgres-Neon-4169E1?logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)

</div>

---

## Why

Most small jewellery shops in India still bill by hand or in spreadsheets. Each bill means working out weight × rate, adding making charges, applying 3% GST correctly, and handling exchange of old gold. On top of that, numbering has to stay gap-free for GST filing. Hisab does all of that in under a minute, from the phone on the counter, in simple Hinglish.

Hisab is **live in production** with real jewellery businesses.

## Features

| | |
|---|---|
| **Jewellery billing** | Weight × rate + making (per gram, flat or %). Gross/net weight, purity, HUID. Or enter the total the customer agreed and Hisab works the rate and GST backwards. |
| **GST done right** | CGST + SGST or IGST picked by place of supply. HSN-wise tax summary. Bill of Supply for unregistered or composition shops. Amount in words. |
| **Gap-free numbering** | A separate series per financial year, assigned under a row lock. Issued bills can't be edited. Cancelling a bill keeps its number, as GST requires. |
| **PDF invoices** | A customer copy and a shop copy, with logo, bank details and HSN summary. Share on WhatsApp in one tap. |
| **Old-gold exchange** | Old gold is subtracted on the same bill and a purchase voucher is created automatically. |
| **Khata (ledger)** | Per-customer ledger with opening balance and payments, plus a one-tap WhatsApp reminder listing the pending bills and the shop's bank/UPI details. |
| **Daily market rates** | Gold (999/995/916/750/585) and silver from **IBJA**, the trade benchmark. A morning "check today's rates" prompt, a one-tap "billing rate = IBJA", and a stock-style dashboard with 1W–1Y charts and high/low/average. |
| **Reports** | GST summary, HSN summary and sales register, with CSV export for the CA. |
| **Onboarding & admin** | Waitlist → admin approval → guided onboarding (GSTIN check, logo, series, rates) → first-run tour. |

## Tech stack

```
apps/web        React Router v8 (SPA + prerendered marketing pages), TypeScript, Tailwind v4, lucide, lightweight-charts
apps/admin      Admin console (waitlist approvals, businesses)
packages/api    Shared TypeScript types for the API
services/api    Go 1.26 net/http API · pgx · sqlc · goose migrations · go-pdf/fpdf
```

- **Database:** PostgreSQL (Neon in prod). Migrations run automatically on boot under an advisory lock.
- **Auth:** Google OAuth (OIDC) with server-side sessions in `__Host-` cookies, plus Go's built-in cross-site request protection.
- **Multi-tenancy:** every tenant route is wrapped in a status check (`approved` / `active` / `suspended`), and every query is scoped to the business.
- **Deploy:** Vercel Services. The web app is static plus prerendered pages; the Go API runs as a Vercel function; `/api/*` is routed to Go.

```
Browser ──► Vercel ──┬─► apps/web (static + prerendered)
                     └─► /api/*  ──► Go API ──► Neon Postgres
                                        └──► ibjarates.com (fetched only when a newer rate is due)
```

## Engineering highlights

- **The tax engine** is plain Go, with table tests and a fuzz test for the reverse calculation (total → rate). All money is integer paise; there is no floating point anywhere in the money path. See [`docs/tax-engine.md`](docs/tax-engine.md).
- **Numbering can't go wrong:** `TakeNumber` locks the series row, and a database trigger makes issued invoices immutable. A concurrency test issues bills in parallel and checks there are no gaps or duplicates.
- **Identical PDFs:** rendering the same invoice always produces the same bytes, and a test checks this.
- **IBJA rates without a cron job:** a read fetches only if the expected AM/PM session is missing. Each shop's prompt is driven by the server (it asks once a day, on any device). If the source is down, Hisab serves the stored rates with a `stale` flag. The parser is tested against a saved HTML fixture.
- **Live rates without streaming:** IBJA publishes about twice a day (~12 pm and ~5 pm IST), so pages fetch on open and have a Refresh button. This deliberately avoids SSE connections and heartbeats.

## Getting started

**Prerequisites:** Go 1.26, Node 22+, pnpm 10, Docker (for Postgres), and [sqlc](https://sqlc.dev) if you change queries.

```bash
pnpm install
make db                 # Postgres 17 in Docker on :5433, creates hisab + hisab_test
cp .env.example .env    # fill in your own values: never commit .env
make migrate seed       # schema + seed users
make dev                # API :8080, web :5173, admin :5174
```

In dev, `/login` shows seed-user buttons (pending / approved / active …), so you don't need Google credentials.

### Tests

```bash
TEST_DATABASE_URL='postgres://postgres@localhost:5433/hisab_test?sslmode=disable' \
  go -C services/api test ./...
pnpm -r typecheck
```

| Command | What it does |
|---|---|
| `make gen` | Regenerate sqlc code after editing `services/api/queries/*.sql` |
| `make fuzz` | Fuzz the reverse tax calculation for 10 minutes |
| `make reset` | Drop and recreate the local DB, then migrate and seed |

## Project layout

```
services/api/
  cmd/api/            entry point (HTTP server, migrations on boot)
  internal/server/    handlers, middleware, route table, integration tests
  internal/tax/       GST + making-charge engine (pure, fuzzed)
  internal/pdf/       invoice & voucher PDFs
  internal/ibja/      IBJA rate parser
  internal/gstin/     GSTIN checksum validation
  migrations/         goose SQL migrations
  queries/            sqlc queries → internal/db
apps/web/app/
  routes/             landing, login, /app/* pages
  components/         UI kit, bill editor, rate check dialog, landing mocks, jewel line-art
docs/                 architecture, API, schema, tax engine, UX, dev & testing
```

## Docs

- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Database schema](docs/schema.md)
- [Tax engine](docs/tax-engine.md)
- [UX notes](docs/ux.md)
- [Dev & testing](docs/dev-and-testing.md)

---

<div align="center">
Made for the jewellers of India 🙏 &nbsp;·&nbsp; Rates exclude GST · IBJA data © IBJA
</div>
