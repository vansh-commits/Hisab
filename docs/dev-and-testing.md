# Local Development & Testing

## 1. One-time setup (macOS)
```sh
brew install go pnpm sqlc         # plus Docker Desktop
make db                           # docker run postgres:17 + creates hisab, hisab_test
pnpm install
cp .env.example .env            # fill GOOGLE_CLIENT_ID/SECRET, ADMIN_EMAILS
make migrate
```
(Any local Postgres 17 works. Only the `DATABASE_URL` changes.)

## 2. Daily commands (`Makefile`)
| Target | Does |
|---|---|
| `make dev` | runs `go run ./services/api/cmd/api` (:8080), `pnpm --filter web dev` (:5173), and `pnpm --filter admin dev` (:5174) in parallel |
| `make db` | one `docker run` of `postgres:17` (container `hisab-pg`, host port **5433**) + creates both DBs |
| `make migrate` | goose up (the API also migrates on boot) |
| `make seed` / `make reset` | load seed data, or drop + migrate + seed |
| `make gen` | `sqlc generate` |
| `make test` | `go test ./...` (unit + integration against `TEST_DATABASE_URL`) + `pnpm -r typecheck` |
| `make fuzz` | `go test ./internal/tax -fuzz=FuzzReverse -fuzztime=10m` |
| `make backup-local` | `pg_dump` of the prod DB (direct URL) into `./backups/`, for ad-hoc copies |

Both Vite dev servers proxy `/api` to `http://localhost:8080`, which mirrors the Vercel rewrite, so cookies and CSRF behave like prod.

*ponytail: Docker only for Postgres, no compose file. Add one when there is more than one container.*

## 3. Environment variables (`.env.example`)
| Var | Dev value | Notes |
|---|---|---|
| `APP_ENV` | `dev` | `dev` enables `/api/dev/login` and the console email driver. Refused if the DB host isn't local. |
| `PORT` | `8080` | Vercel sets this |
| `DATABASE_URL` | `postgres://postgres@localhost:5433/hisab?sslmode=disable` | Neon **pooled** URL in prod |
| `DATABASE_URL_DIRECT` | same as above | Neon **direct** URL in prod (migrations) |
| `TEST_DATABASE_URL` | `postgres://postgres@localhost:5433/hisab_test?sslmode=disable` | integration tests |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from GCP project **hisab-login** | login only |
| `APP_ORIGIN` / `ADMIN_ORIGIN` | `http://localhost:5173` / `http://localhost:5174` | trusted origins + redirect URIs. Prod: `https://hisab.vercel.app` / `https://hisab-admin.vercel.app` |
| `ADMIN_EMAILS` | `you@gmail.com` | comma-separated allowlist |
| `SESSION_COOKIE_NAME` / `ADMIN_SESSION_COOKIE_NAME` | `__Host-sid` / `__Host-asid` | override to `sid` if a browser balks on localhost |
| `EMAIL_DRIVER` | `console` | `console` \| `gmail` |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | (none) | GCP project **hisab-mailer**, prod only |
| `EMAIL_FROM` | `hisab.app@gmail.com` | the mailer Google account (sent as "Hisab <…>") |

## 4. Google setup
**Login (project `hisab-login`):** APIs & Services → OAuth consent screen (External, scopes `openid email profile`, add a privacy policy URL `https://hisab.vercel.app/privacy`) → Credentials → OAuth client "Web application".
- JS origins: `http://localhost:5173`, `http://localhost:5174`, `https://hisab.vercel.app`, `https://hisab-admin.vercel.app`
- Redirect URIs:
  - `http://localhost:5173/api/auth/google/callback`
  - `http://localhost:5174/api/admin/auth/google/callback`
  - `https://hisab.vercel.app/api/auth/google/callback`
  - `https://hisab-admin.vercel.app/api/admin/auth/google/callback`

**Mailer (project `hisab-mailer`, signed in as the new Google account):**
1. Enable the Gmail API. Consent screen: External, scope `https://www.googleapis.com/auth/gmail.send`. **Publishing status: "In production"** (it stays unverified, which is fine for your own account). Testing-mode refresh tokens expire after 7 days.
2. Create an OAuth client "Web application" with the redirect URI `https://developers.google.com/oauthplayground` (the Playground needs it).
3. Get a refresh token once. The simplest way is the OAuth 2.0 Playground (⚙ → use your own client ID/secret → scope `gmail.send` → authorize as the mailer account → exchange → copy the refresh token).
4. Put the three values in the `hisab-api` Vercel project's env vars.
5. **If mail stops** (token revoked after a password change or security event): repeat step 3. Admin shows `email_sent: false` with a Resend button meanwhile.

The Gmail driver is about 40 lines: refresh the access token via `x/oauth2`, build an RFC 822 message, base64url it, and `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`.

## 5. Deploy (no pipeline needed at this size)
- **Vercel API project `hisab-api`:** import the repo, root directory `services/api`, framework preset **Go** (`services/api/vercel.json` sets `"framework": "go"`). It builds `cmd/api/main.go` and listens on `PORT`. Settings → Functions → region **Singapore (sin1)**, next to Neon. Migrations run on each cold start under a Postgres advisory lock.
- **Vercel frontends:** two more projects from the same repo (root `apps/web` → `hisab`, root `apps/admin` → `hisab-admin`), each with a `vercel.json` rewrite of `/api/:path*` → `https://hisab-api.vercel.app/api/:path*`.
- **Neon:** project in Singapore. Copy the pooled and direct URLs into the `hisab-api` project. Set max compute to 0.25–0.5 CU.
- **Backups (`.github/workflows/backup.yml`):**
  - Nightly at 02:00 IST: `pg_dump --format=custom $NEON_DIRECT_URL | age -r $AGE_PUBLIC_KEY > hisab-YYYY-MM-DD.dump.age`, then `gh release create` in the private repo `hisab-backups`, then prune to 30 daily + 12 monthly.
  - The age **private** key lives only on your machine and in a password manager.
  - **Restore drill (monthly):** create a Neon branch, then `age -d … | pg_restore -d <branch-url>`, then spot-check counts and that the latest invoice PDF renders.

## 6. Seed data (`services/api/seed/seed.sql`, idempotent)
- States (also loaded by a migration).
- Users and businesses:
  - `pending@example.com`: pending
  - `rejected@example.com`: rejected with a note
  - `approved@example.com`: approved, onboarding_step 3
  - `active@example.com`: **active** "Soni Jewellers", Rajasthan 08, valid GSTIN, prefix `SJ/`, three copies, rate board, 8 parties (one registered Delhi party for IGST, one with opening balance), 6 items
  - `suspended@example.com`: suspended
- For the active business:
  - **Bill A** and **Bill B** issued exactly per the vectors, Bill B with the **old gold exchange** (PV/26-27/001)
  - one standalone voucher (paid cash)
  - 20 assorted invoices across two FYs, 2 drafts, 1 cancelled
  - payments: full, partial, on-account, one voided
- Dev login: `POST /api/dev/login {"email": "active@example.com"}`. The login page shows seed users as buttons when `APP_ENV=dev`. Add `admin@example.com` to `ADMIN_EMAILS` locally.

## 7. Testing strategy
| Layer | What | How |
|---|---|---|
| Tax engine | All vectors in `tax-engine.md` §7 (Bill A, B, B′, old gold, POS branches, edge cases) | Go table tests |
| Fuzz | Reverse invariant, round-off range, `cgst == sgst` | `go test -fuzz`: 60 s in CI, 10 min before release |
| Helpers | GSTIN checksum, PAN/IFSC/Udyam regexes, FY boundaries (31 Mar / 1 Apr IST), `inr` words and grouping | Go unit tests |
| DB integration | Real local Postgres (`TEST_DATABASE_URL`). Each test runs in a transaction that's rolled back. Concurrency tests use committed data on a fresh schema. | Go |
| ↳ numbering | 50 goroutines issue concurrently → numbers exactly 1..50. A forced error after the counter update leaves no gap. FY rollover. Starting number. 16-char limit. Invoice and voucher series are independent. | |
| ↳ immutability | UPDATE/DELETE of an issued invoice or voucher fails. The cancel transition works. Cancelling an exchange invoice also cancels its voucher and voids the old gold payment. | |
| ↳ snapshot / PDF | Issue, change party/settings/items/logo, and the PDF bytes are identical. The same snapshot rendered twice gives identical bytes. Golden SHA-256 for Bill A and Bill B. Text extraction contains `₹`, `7,37,864.00`, `Seven Lakh Sixty Thousand`. | |
| ↳ tenant isolation | Seed A and B, hit every tenant endpoint as A with B's IDs → 404. The query-lint test (every tenant query mentions `business_id`). | |
| ↳ payments & ledger | Overpayment rejected under concurrency. Ledger = opening + invoices − payments − on-account vouchers. Old gold payment counted once. | |
| HTTP | Expired session → 401. Logout invalidates. Cross-site POST → 403. Every `/api/admin/*` route → 403 for an app session and for a removed allowlist email. Status gates. OIDC callback against a local stub IdP (bad nonce, `email_verified=false`, wrong aud). | `httptest` + real DB |
| Frontend | `tsc --noEmit`. One Playwright happy path (dev login → onboarding → Bill B with old gold → issue → PDF downloads → record payment) is **optional for MVP** and added before the first paying customer. | |

**CI** (`.github/workflows/ci.yml`, GitHub `postgres:17` service): `go vet`, `staticcheck`, `go test ./...` (incl. 60 s fuzz), `sqlc diff`, `pnpm -r typecheck`.
