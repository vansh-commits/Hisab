# Hisab: GST Billing for Indian Jewellers (Implementation Plan)

> Status: **v2, decisions confirmed 2026-11-16.** No application code until this is signed off.
> Built for **a few customers**, not for scale. The one thing that must never be lost is **the data**.
> Free-tier limits change often, so re-check them at each milestone.

## Document map

| File | Contents |
|---|---|
| `docs/PLAN.md` (this) | Confirmed decisions, key choices, roadmap, risks |
| [`docs/architecture.md`](architecture.md) | Stack, free hosting, monorepo layout, diagrams, auth & cookies, PDF |
| [`docs/schema.md`](schema.md) | Postgres schema, numbering, immutability, old gold vouchers |
| [`docs/api.md`](api.md) | Routes and request/response shapes |
| [`docs/tax-engine.md`](tax-engine.md) | Tax algorithm, place of supply, rounding, worked examples, test vectors |
| [`docs/ux.md`](ux.md) | Landing page, onboarding wizard, invoice screen, admin |
| [`docs/dev-and-testing.md`](dev-and-testing.md) | Local setup (no Docker), env vars, seed data, testing |

---

## 1. Decisions confirmed (2026-11-16)

| # | Topic | Decision |
|---|---|---|
| 1 | "Ask the amounts" | Opening balances per customer, default making charge and GST rate, **plus a daily metal-rate board** (24K/22K/18K/silver) that pre-fills line rates |
| 2 | Domain | **None.** The app runs on `*.vercel.app`. A new Google account sends email via the Gmail API. |
| 3 | Hosting | **Vercel** for everything: 2 static frontends + the Go API as a third project (Go preset), **Neon** free (Postgres: easy data access, never paused or deleted) |
| 4 | Old gold exchange | **In MVP.** Purchase vouchers, deducted on the sale bill. |
| 5 | Composition dealers | Bill of Supply, no tax |
| 6 | Place of supply | Your rule, verbatim (see `tax-engine.md` §3), overridable per bill. Confirmed by s.10(1)(ca) IGST Act + Circular 209/03/2024. |
| 7 | Suspended clients | Read-only (can view and download old bills) |
| 8 | Rejected applicants | Can edit and re-apply |
| 9 | Brand | "Hisab" |
| 10 | Numbering | `SJ/26-27/0148` style, configurable starting number. Backdating shows a warning, not a block. |
| 11 | PDF language | English only |
| 12 | Reverse calculation | The jeweller chooses per bill: **"Rate se" / "Total se"** toggle |
| 13 | HUID | Optional column, hidden by default |
| n/a | Scale | Few customers. No scale features, no Docker for now. |
| n/a | PDFs | **Regenerated on demand from saved invoice data, not stored** |

---

## 2. Key decisions

| Area | Decision | Why |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite. `apps/web` uses **React Router v8 framework mode** (`ssr:false`, `prerender` marketing routes). `apps/admin` is a plain Vite SPA. | Static SEO HTML for `/`, SPA for the dashboard. Static output deploys anywhere. |
| UI | Tailwind CSS v4, Radix primitives, **Motion**, react-hook-form + zod, TanStack Query | Premium animation and accessible components without heavy runtime. |
| Fonts | Cormorant Garamond (display), Tiro Devanagari Hindi (Hindi display), Mukta (UI) | Elegant, with good Devanagari for the Hinglish marketing copy. |
| Go HTTP | stdlib `net/http` ServeMux + Go 1.25 `http.CrossOriginProtection` | No router dependency. CSRF from the stdlib. |
| DB access | pgx v5 + sqlc. **goose** migrations, embedded, run on API boot | Type-safe SQL. Single instance, so migrating on boot is safe. |
| Auth | Google OIDC (go-oidc + x/oauth2, PKCE, nonce, `email_verified`), Postgres sessions, `__Host-` cookies | As requested. Providers are pluggable for phone OTP later. |
| Cookies | **Vercel external rewrite** `/api/*` → `hisab-api.vercel.app`. The browser is same-origin, so cookies are first-party. | Solves the third-party cookie problem without a domain. |
| Email | `EmailSender` with two drivers: **Gmail API** (HTTPS) and **console** | Serverless has no SMTP worth relying on, and there's no domain for Resend/Brevo. |
| Tax engine | **Go only.** The UI calls `POST /api/invoices/compute` (debounced) for live totals. | One implementation, so there's nothing to keep in sync. |
| PDF | **Server-side Go (`go-pdf/fpdf`)**, built from the invoice snapshot on every request, never stored | Deterministic, light on memory, ₹ via embedded Noto Sans, zero storage. |
| Money / weight / rates | `int64` paise, `int64` milligrams, GST rate in milli-percent (3% = 3000) | No floats. 0.125% (half of 0.25%) is representable. |
| Numbering | Counter row locked by `UPDATE … RETURNING` in the issue transaction | Gapless, concurrency-safe. No SEQUENCE. |
| Immutability | DB trigger: issued documents can only move to `cancelled` | Enforced below the app. |
| Tenancy | `business_id` in every query + composite tenant FKs + an isolation test | *ponytail: no RLS; add it when there are staff users or more than a handful of tenants.* |
| Backups | Nightly GitHub Actions `pg_dump` → encrypted → private GitHub repo release, plus a monthly restore drill | "Only data is essential." |
| Monorepo | pnpm workspaces + root `Makefile`. One shared `packages/api/types.ts`. | No Turborepo or codegen needed at this size. |

---

## 3. Roadmap

Every phase ends **deployed** (Vercel + Neon), not just working locally.

### Phase 0: Skeleton and risk checks (≈4 days)
- Repo layout, Makefile, local Postgres, goose + sqlc, CI (Go tests with a Postgres service, typecheck).
- Deploy a hello API to Vercel (Go preset), both frontends to Vercel with rewrites, and Neon.
- **Verify:**
  1. `Set-Cookie` passes through the Vercel rewrite and comes back on the next request.
  2. Cold-start latency through the rewrite (Go function + Neon wake), and Vercel function usage after 2–3 days.
  3. A Gmail API send works with the stored refresh token.
  4. fpdf renders ₹ and `7,37,864.00` correctly. ✅ 2026-11-17: Noto Sans via `AddUTF8FontFromBytes`, text extractable, byte-identical re-render.
- **Done when:** all four are checked and written into this doc, and CI is green.

### Phase 1: Auth, waitlist, admin approvals (≈1.5 weeks)
- Google login, sessions, logout, expiry, CSRF, dev-only login.
- Waitlist form, pending and rejected screens, admin portal (allowlist), approve/reject with note, emails, audit log.
- **Done when:** a real Google account goes visitor → waitlist → admin approve → email received → approved on next login. Tests cover session expiry, logout, a non-admin hitting every `/api/admin/*` route, and a cross-site POST being rejected.

### Phase 2: Tax engine, GSTIN, words, formatting (≈1 week, overlaps Phase 1)
- Pure Go `tax` package (forward, reverse, POS rule, old gold), GSTIN validator, Indian formatting, amount in words.
- **Done when:** the Bill A, Bill B, Bill B′, and old-gold exchange vectors pass, and 10 minutes of fuzzing finds no failure of the reverse invariant.

### Phase 3: Onboarding (≈1.5 weeks)
- Animated wizard with per-step autosave and resume, logo, numbering preview, settings, rate board, customers and items quick-add, sample bill preview.
- **Done when:** an approved user finishes on a 360 px phone in under 5 minutes, a reload resumes on the same step, and skipping every optional step still produces a valid business.

### Phase 4: Invoicing core (≈2.5 weeks)
- Parties and items CRUD.
- New bill (Rate se / Total se), drafts, issue (gapless number + snapshot), list/search/filter, view.
- PDF (copies in one file), cancel.
- **Done when:**
  - Bill A and Bill B can be reproduced exactly in the UI.
  - Re-rendering an issued bill's PDF gives identical bytes.
  - 50 concurrent issues produce numbers 1..50.
  - Editing a party or settings after issue leaves old PDFs unchanged.
  - The tenant isolation test passes.

### Phase 5: Old gold, payments, ledger, reports (≈2 weeks)
- Old gold exchange on the bill, standalone purchase vouchers, payments (full/partial, cash/UPI/bank/cheque, void), party ledger, and reports: sales register, GST summary, HSN summary, old gold register. Home summary.
- **Done when:**
  - The exchange vector works end to end in the UI (net payable ₹3,15,559.00).
  - Ledger = opening balance + invoices − payments − vouchers.
  - Report totals reconcile with the seed data.
  - Overpayment is rejected.

### Phase 6: Hardening and launch (≈1 week)
- Nightly backup plus a **successful restore drill**, error logging, landing page polish, a native-speaker review of the Hinglish copy, a **CA review** (see Risks), privacy and terms pages.
- **Done when:** last night's backup restores into a fresh Neon branch, the CA signs off, and the first 2–3 jewellers are onboarded.

### Later (post-MVP, in order)
1. Credit/debit notes (schema ready)
2. Phone OTP login
3. Staff users with roles (+ RLS)
4. WhatsApp share
5. More templates / Hindi PDF / thermal print
6. E-way bill, e-invoicing (columns reserved)
7. Docker for local dev
8. Custom domain + transactional email provider
9. Move frontends off Vercel Hobby once revenue starts
10. Old gold inventory: melting/refining, fine gold recovered, link to job work
11. Margin scheme (Rule 32(5)) for resale of used jewellery as-is
12. Job-work flow: gold received from or sent to job workers, challans (the 5% charge line already exists in the MVP)
13. Conditional RCM, only if a notification ever covers Ch. 71 purchases

---

## 4. Risks and open items

| Risk | Impact | Mitigation |
|---|---|---|
| **Data loss** (free DB, no SLA) | Fatal: these are tax records | Nightly encrypted `pg_dump` to a private GitHub repo (30 daily + 12 monthly), monthly restore drill, Neon's own restore window, admin "export all" CSV. |
| **Vercel Hobby is "non-commercial use only"** | Project could be paused once you charge money | Frontends are static and the rewrite is a 3-line config, so the move to Cloudflare Pages or Netlify takes about an hour. Do it before the first paid customer. |
| **Vercel Go runtime is Beta; Hobby is non-commercial; serverless cold starts** | Breakage, a forced plan change, or slow first request | Plain `net/http` server with no Vercel-specific code, so it moves to Render/Railway/Koyeb unchanged. Function region `sin1` next to Neon. Pro plan once there are paying customers. |
| Neon limits (1 GB, 100 CU-h/month per project) | Writes fail or compute is suspended | No PDFs stored. Logos ≤ 200 KB. `/healthz` doesn't touch the DB. Admin metrics show DB size. Cap compute at 0.25–0.5 CU. |
| Gmail refresh token revoked (password change, security event) | Waitlist and approval emails stop | Email failures are logged and shown in admin with a "resend" button. Approval still works without email. Re-auth steps are in `dev-and-testing.md`. |
| **Tax rules to confirm with a CA** | Wrong invoices | **Resolved (2026-11-17):** POS for unregistered buyers (s.10(1)(ca)), GST on the full value in exchange (Rule 27), no GST/RCM on individuals' personal old gold (s.7). No RCM on unregistered dealers (s.9(4) after 1 Feb 2019). Retail making is in the 3% value, and Chapter 71 job work is 5%. TCS is off, with 2% only for scrap sales (s.394 IT Act 2025). **Still open:** none. Re-check when notifications change. |
| Compliance warnings (PAN for jewellery > ₹2 lakh, s.269ST cash ≥ ₹2 lakh, Rule 46 B2C ≥ ₹50k address) | Compliance | Non-blocking in-app warnings. |
| Google OAuth "unverified app" screens | Trust | Login uses only basic scopes (light verification). Mail uses a separate GCP project used only by you. |
| Hinglish copy quality | Brand | Native-speaker review before launch. |
