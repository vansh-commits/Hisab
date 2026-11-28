# UX Plan: Landing, Onboarding, Dashboard

**Principles:** mobile-first (360 px baseline), big tap targets (≥ 48 px), numeric keyboards (`inputmode="decimal"`), forgiving inputs ("13457", "13,457", and "₹13,457.00" all parse), autosave everything, and plain language with Hinglish in marketing and simple English plus Hindi helper text in the app. Hindi helper text shows only in the "हिंदी सहायता" toggle so it doesn't clutter for English-first users. Motion is **subtle and purposeful**: it explains a state change and never blocks input. Everything respects `prefers-reduced-motion`.

## 1. Visual system (CSS variables in `apps/web/app/styles/tokens.css`)
| Token | Value (indicative) |
|---|---|
| `--gold-600` / `--gold-400` / `--gold-100` | #9A7B2F / #C9A44C / #F6EED9 |
| `--ink` | #1E1A16 (warm near-black) |
| `--ivory` | #FBF8F1 (page background) |
| `--maroon-700` | #6B1E2A (accent, sparingly: CTA hover, active step) |
| Display font | Cormorant Garamond 600 (Latin), Tiro Devanagari Hindi (Hindi) |
| UI / body font | Mukta 400/500/600 (Latin + Devanagari designed together) |
| Numerals | `font-variant-numeric: tabular-nums` in all money columns |

Fonts are self-hosted (Fontsource), subset to Latin + Devanagari + ₹, with `font-display: swap`. Only the hero display font is preloaded.

## 2. Landing page (`apps/web`, `/`, prerendered)
Performance budget: LCP < 2.0 s on mobile 4G, JS for `/` < 90 KB gzipped (Motion loaded with `LazyMotion`), no layout shift. The H1 renders statically with no entrance animation (protects LCP). Animations start on scroll.

| # | Section | Content (draft copy, **needs native-speaker review**) | Animation |
|---|---|---|---|
| 1 | **Hero** | H1: "Bill banaiye seconds mein." Sub: "GST-ready invoices for jewellers. सोने जैसा खरा हिसाब." CTA: "Join the waitlist →" / secondary "See a sample bill" | Right side: a handwritten bill (SVG, ink-stroke path draw) **morphs into** a clean printed invoice. Totals count up and a gold shimmer sweeps across the grand total. Loops once. |
| 2 | **Problem** | "Haath ke bill mein galti ho hi jaati hai." Three cards: galat total (wrong total), GST ka hisaab (CGST/SGST confusion), bill book kho gayi (lost bill book). | Cards slide up with stagger via `whileInView`. A red-ink "₹4,22,155" is crossed out and the correct "₹4,22,146.09" writes in (straight from Bill B). |
| 3 | **Features** | Weight × rate + making in one line · Reverse calculation ("total batao, rate hum nikaal denge") · CGST/SGST/IGST automatic · Purana sona exchange on the same bill · PDF with Original/Duplicate/Triplicate · Customer khata (ledger) · Works on phone | Bento grid. Each tile has a micro-demo loop (e.g. typing "760000" fills taxable and tax). |
| 4 | **How it works** | 1. Waitlist join karein → 2. Approval ke baad 5-minute setup → 3. Pehla bill banaiye | Horizontal steps connected by a gold line that draws as you scroll (scroll-linked `useScroll`). |
| 5 | **GST trust points** | Correct CGST/SGST vs IGST by place of supply · Gapless invoice numbers per FY · HSN summary on every bill · Amount in words (lakh/crore) · Invoices locked after issue · Your data stays yours (export anytime) | Checkmarks tick in sequence. |
| 6 | **Sample bill** | Real rendered Bill A preview (image), "Download sample PDF" | Gentle parallax tilt on desktop only |
| 7 | **FAQ** | Kya ye free hai? · Mera data safe hai? · Bina GST registration ke chalega? (Bill of Supply) · Phone pe chalega? · E-invoice? (coming later) | Native `<details>` accordion, height animated via Motion |
| 8 | **Final CTA** | "Apni dukaan ko digital banaiye." Join the waitlist | Soft gold radial glow pulse (CSS only) |
| – | Footer | Privacy, Terms, contact | |

SEO covers: `<title>`/meta per route, Open Graph image, JSON-LD (`SoftwareApplication` + `FAQPage`), `sitemap.xml`, `robots.txt`, `lang="en-IN"`, Hindi spans marked `lang="hi"`, and semantic headings.

## 3. Auth and waitlist screens
- **`/login`:** a single "Continue with Google" button (official branding), with "Waitlist join karne ke liye bhi yahi" underneath.
- **`/app/waitlist`** (no application): a 5-field form on one screen (business name, owner name, phone with a +91 prefix, city, optional GSTIN with live checksum feedback). On submit a gold checkmark draws in.
- **Pending screen:** "Aap waitlist par hain 🙏". It shows the submitted details (editable), "We'll email you at {email}", and a calm looping illustration (a diya flame).
- **Rejected screen:** shows the admin note and an "Edit and re-apply" button.

## 4. Onboarding wizard (`/app/onboarding`)
**Layout:**
- Mobile: a top progress bar (segments) with "Step 3 of 9 · Invoice numbering", content below, and a sticky bottom bar [Back] [Skip (if optional)] [Next].
- Desktop: a left vertical stepper with the content card on the right and a **live invoice preview** panel that updates as fields change.

| # | Step | Fields | Req? | Smart bits |
|---|---|---|---|---|
| 0 | Welcome | none | n/a | "Namaste {first_name}! 5 minute mein setup ho jayega." Gold particle burst, then the card slides in. |
| 1 | GST status | Regular / Composition / Not registered | ✓ | Decides Tax Invoice vs Bill of Supply. Includes a plain-language explainer. |
| 2 | Business identity | GSTIN (if regular) → legal name, trade name, Udyam (optional) | ✓ | GSTIN typed first auto-derives the **state** and validates the checksum live (green tick / red hint "last character galat lag raha hai"). Udyam has a format mask. |
| 3 | Address & contact | address, city, pincode, state (preselected from GSTIN, locked if GSTIN present), phone, email (prefilled from Google) | ✓ | The state code is shown next to the name ("Rajasthan · 08"). |
| 4 | Logo | upload/crop | optional | Client-side crop and resize to 512 px, WebP/PNG, ≤200 KB before upload. The preview shows the logo on a mini invoice header. |
| 5 | Invoice numbering | prefix, include FY, starting number, min digits, FY reset | ✓ (prefilled) | **Live preview**: `SJ/26-27/0148` with a 16-character meter. Helper: "Purani bill book ka agla number daaliye". |
| 6 | Print settings | number of copies (1–5) + a label for each (default Customer, Store), terms, declaration, jurisdiction, signatory | prefilled | Sensible defaults, so Next works without typing. |
| 7 | Bank details | bank, account, IFSC, branch, UPI ID | optional | IFSC format check. A UPI QR on the invoice is a later feature. |
| 8 | Defaults & rates | default GST rate (3%), making charge mode and value, **today's rates** board (24K/22K/18K/silver) | prefilled | Covers "ask the amounts" (Q1). |
| 9 | Customers | add several (name, phone, state, GSTIN, opening balance, bill/ship address collapsed) | optional | Rows animate in (`layout`). "Baad mein bhi add kar sakte hain". `POST /api/parties/bulk`. |
| 10 | Items | quick presets (22K Jewellery 7113 3%, 18K Jewellery 7113 3%, Gold Bar 0.995 7108 3%, Silver 7106 3%, Job work SAC 9988 5% (a separate charge line, not retail making, which stays in the 3% line)) + custom | optional | Tap a preset chip to add it. Every preset is editable. |
| 11 | Preview & finish | HTML preview of a sample bill with their data (Bill B values), plus a "Download sample PDF" link (server-rendered) | n/a | "Sab sahi lag raha hai?" with edit links back to steps. Finish shows a gold confetti burst (≤ 1.2 s), then the dashboard. |

**Mechanics:**
- **Autosave:** each step is a react-hook-form instance with a zod schema. On Next it PATCHes the resource and `PATCH /api/onboarding {step}`. Fields also autosave on blur (debounced 800 ms) with a tiny "Saved ✓" indicator. Reloading resumes at `onboarding_step`.
- **Back** never loses data (it's already saved). **Skip** only appears on optional steps.
- **Animation:** `AnimatePresence mode="wait"` with direction-aware slide (x ± 24 px) + fade in 220 ms. The progress bar fill uses a spring. Validation errors do a gentle 4 px shake (never on every keystroke). Reduced motion: crossfade only.
- **Components:** `WizardShell`, `StepHeader`, `ProgressSegments`, `StepNav`, `GstinField`, `StateSelect`, `MoneyField`, `WeightField`, `RateField` (milli-percent ↔ "3%"), `LogoCropper`, `NumberingPreview`, `PartyRowsEditor`, `ItemPresetChips`, `InvoicePreview` (HTML mirror of the PDF for instant feedback).

## 5. Dashboard (`/app`)
**Navigation:** a bottom tab bar on mobile (Home · Bills · **+ New Bill** (big gold FAB) · Customers · More) and a left sidebar on desktop.

### New invoice (the critical flow, target < 30 s for a repeat customer)
1. **Customer:** a search box (name or phone, trigram). "Walk-in" is the default chip. "+ New customer" opens an inline sheet. Selecting a party fills buyer, state, GSTIN, and POS.
2. **Lines:** item search or preset chip pre-fills HSN, purity, GST rate, making, and **today's rate**. The user enters **net weight** (and optionally gross).
   - The amount computes live via the TS engine.
   - The amount computes live from `POST /api/invoices/compute` (debounced 300 ms), with a subtle shimmer on totals while waiting.
   - **The jeweller picks per bill:** a segmented toggle at the top of the bill, **"Rate se"** (enter rate, get total) or **"Total se"** (enter the all-in amount per line, and the rate is back-calculated and shown as "derived"). It defaults to the last mode used on that device.
   - "+ Add line" / "+ Making as separate line" / "+ Stone/other charges".
3. **Purana sona (old gold), optional:** a "+ Purana sona lein" button under the lines opens rows with description, purity, gross wt, less wt (stone/wastage), net wt (auto), rate/g, and amount (live). The rate pre-fills from the rate board. It shows "Old gold total ₹1,30,560.00". If it exceeds the bill, an inline message suggests a separate purchase voucher. A small toggle "Personal gehna / Dealer" sets `seller_kind` (default personal).
4. **Totals panel** (sticky on mobile, collapsible):
   - taxable, CGST/SGST or IGST, TCS if switched on for this bill (a collapsed "TCS (scrap sale)" toggle, off by default), round off, **grand total**, then **Less: old gold** and **Net payable** in large type, with amount in words
   - **Place of supply** shown as a chip ("Rajasthan · 08, CGST+SGST"). Tapping it opens: "Goods transported to buyer?" (registered buyers only), delivery state, and a manual override.
   - The POS is derived from the rule in `tax-engine.md` §3.
5. **Actions:** **Save & Print** (issue → PDF, primary), Save draft, More (refs: e-way bill no., buyer order no., dispatch, terms of delivery, ship-to override, reverse charge).
6. **After issue:** an Issued ✓ screen with the number, then Download PDF / Print / Share (Web Share API with the PDF file) / Record payment (prefilled full amount, modes as big buttons: Cash · UPI · Bank · Cheque).

Warnings are shown non-blocking inline: PAN for > ₹2 lakh, cash ≥ ₹2 lakh, a date earlier than the last invoice, and an unregistered buyer ≥ ₹50k missing their address.

### Other screens
- **Bills list:** search (number/buyer), filters (status, date range presets "Aaj / Is mahine / FY"), paid/partial/unpaid chips, infinite scroll.
- **Invoice view:** an HTML render of the snapshot plus buttons. Cancel requires a reason in a confirm dialog that states "This number stays used. You'll need a new bill."
- **Purana sona (standalone purchase):** reached from More. Seller (party or walk-in), the same "Personal gehna / Dealer" toggle, the same old gold rows, and settlement: Cash / UPI / Bank paid out, or "Customer ke khate mein jama" (on account). Shows the voucher number after save, with a PDF.
- **Customers:** list with outstanding balance. Detail page shows the ledger (opening, invoices, payments, running balance) and "Record payment".
- **Items:** list and edit. **Rates board** for a quick daily update (one screen, four fields).
- **Reports:** Sales register / GST summary / HSN summary / Old gold register, with date range and CSV download.
- **Settings:** the same forms as onboarding steps, grouped (Business, Invoice & print, Bank, Defaults, Template). Template settings have column/field toggles, an accent colour picker (gold presets), and an HTML preview with a "Download sample PDF" button. PDFs are English only.

## 6. Admin portal (`apps/admin`)
A dense desktop-first table UI with no marketing polish:
- **Queue:** pending applications, row expand, Approve/Reject with an optional note, and an email status badge.
- **Clients:** search/filter by status, invoice count, last active, and detail with suspend/reactivate.
- **Metrics:** cards for pending, active, invoices 7/30 d, and DB size vs the 1 GB cap.
- **Audit:** filterable table.
