import type { MarketRate, MetalRate, Purity } from "@hisab/api";

export const PURITY: Record<Purity, { label: string; short: string; silver?: boolean }> = {
  gold999: { label: "Gold 999 (24K)", short: "24K" },
  gold995: { label: "Gold 995", short: "995" },
  gold916: { label: "Gold 916 (22K)", short: "22K" },
  gold750: { label: "Gold 750 (18K)", short: "18K" },
  gold585: { label: "Gold 585 (14K)", short: "14K" },
  silver999: { label: "Silver 999", short: "Silver", silver: true },
};

// Billing-board metal name → IBJA purity. Custom metals have no match.
const BOARD: Record<string, Purity> = { "24k": "gold999", "22k": "gold916", "18k": "gold750", "14k": "gold585", silver: "silver999" };
export const purityFor = (metal: string): Purity | undefined => BOARD[metal.trim().toLowerCase()];

export interface Snapshot { day: string; session: "AM" | "PM"; fetchedAt: string; now: Partial<Record<Purity, number>>; prev: Partial<Record<Purity, number>> }

// Latest published session and the one before it (for ▲/▼).
export function latest(items: MarketRate[]): Snapshot | null {
  const keys = [...new Set(items.map((r) => `${r.day} ${r.session}`))].sort(); // "2026-11-20 AM" < "2026-11-20 PM"
  const last = keys.at(-1);
  if (!last) return null;
  const pick = (k?: string) => Object.fromEntries(items.filter((r) => `${r.day} ${r.session}` === k).map((r) => [r.purity, r.paise_per_gram]));
  const [day, session] = last.split(" ") as [string, "AM" | "PM"];
  const fetchedAt = items.filter((r) => r.day === day && r.session === session).map((r) => r.fetched_at).sort().at(-1)!;
  // Previous session that has data for each purity: walk back.
  const prev: Partial<Record<Purity, number>> = {};
  for (const k of keys.slice(0, -1).reverse()) {
    for (const [p, v] of Object.entries(pick(k))) if (!(p in prev)) prev[p as Purity] = v;
    if (Object.keys(prev).length >= 6) break;
  }
  return { day, session, fetchedAt, now: pick(last), prev };
}

// One point per day: PM close, else AM.
export function closes(items: MarketRate[], purity: Purity): { day: string; v: number }[] {
  const m = new Map<string, number>();
  for (const r of items) if (r.purity === purity && (r.session === "PM" || !m.has(r.day))) m.set(r.day, r.paise_per_gram);
  return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, v }));
}

export const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// IST calendar date of a timestamp, YYYY-MM-DD.
export const istDay = (t: string | Date) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// The shop's board with every IBJA-mapped metal set to today's IBJA rate.
// Default board metals are added if missing; custom metals keep their rate.
export function withIBJA(mine: MetalRate[], snap: Snapshot): MetalRate[] {
  const names = [...new Set(["24K", "22K", "18K", "Silver", ...mine.map((r) => r.metal)])];
  return names.flatMap((metal) => {
    const p = purityFor(metal);
    const rate = (p && snap.now[p]) || mine.find((r) => r.metal === metal)?.rate_paise;
    return rate ? [{ metal, rate_paise: rate }] : [];
  });
}
