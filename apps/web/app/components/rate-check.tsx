import type { MarketRates, MetalRate } from "@hisab/api";
import { TrendingUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { api, ApiError } from "../lib/api";
import { istDay, latest, purityFor, type Snapshot } from "../lib/market";
import { fmtINR, plain, toPaise } from "../lib/money";
import { Field } from "./ui";

const BOARD = ["24K", "22K", "18K", "Silver"];

// Once a day: if the shop's billing rates weren't saved today (IST), ask them to check
// today's rates against IBJA. Saving resets updated_at, so it won't come back until tomorrow.
export function RateCheck() {
  const { revalidate } = useRevalidator();
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [rows, setRows] = useState<{ metal: string; rate: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.search).has("tour")) return; // don't stack on the first-run tour
    try {
      if (sessionStorage.getItem("hisab.rateCheckLater") === istDay(new Date())) return;
    } catch {}
    let off = false;
    (async () => {
      const mine = (await api<{ items: MetalRate[] }>("/metal-rates")).items;
      const updated = mine.map((r) => r.updated_at).filter(Boolean).sort().at(-1);
      if (updated && istDay(updated) === istDay(new Date())) return;
      const market = await api<MarketRates>("/market-rates?days=10").catch(() => null);
      if (off) return;
      const names = [...BOARD, ...mine.map((r) => r.metal).filter((m) => !BOARD.includes(m))];
      setRows(names.map((metal) => {
        const r = mine.find((x) => x.metal === metal)?.rate_paise;
        return { metal, rate: plain(r, 2) };
      }));
      setSnap(market ? latest(market.items) : null);
      setOpen(true);
    })().catch(() => {});
    return () => { off = true; };
  }, []);

  if (!open) return null;
  const ibja = (metal: string) => { const p = purityFor(metal); return p ? snap?.now[p] : undefined; };

  function later() {
    try { sessionStorage.setItem("hisab.rateCheckLater", istDay(new Date())); } catch {}
    setOpen(false);
  }
  async function save() {
    const body: MetalRate[] = [];
    for (const r of rows) {
      if (!r.rate.trim()) continue;
      const p = toPaise(r.rate);
      if (!p) return setMsg(`${r.metal} ka rate check karein`);
      body.push({ metal: r.metal, rate_paise: p });
    }
    if (!body.length) return setMsg("Kam se kam ek rate bhariye");
    setBusy(true);
    try {
      await api("/metal-rates", { method: "PUT", body });
      setOpen(false);
      revalidate();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Save nahi hua, dobara try karein");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center" role="dialog" aria-modal aria-labelledby="rc-title">
      <div className="tour-dim fixed inset-0" aria-hidden onClick={later} />
      <div className="pop-in relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-100 text-gold-600"><TrendingUp aria-hidden className="size-6" /></span>
          <div className="flex-1">
            <h2 id="rc-title" className="font-display text-2xl font-semibold leading-tight">Aaj ka rate set karein</h2>
            <p className="mt-1 text-sm text-ink/70">
              {snap ? <>IBJA {snap.session} rate, {new Date(snap.day + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · per gram, GST alag</> : "IBJA rate abhi nahi mila — apna rate bhariye."}
            </p>
          </div>
          <button onClick={later} className="grid size-9 place-items-center rounded-full text-ink/60 hover:bg-gold-100" aria-label="Close"><X aria-hidden className="size-5" /></button>
        </div>

        <div className="mt-4 space-y-3">
          {rows.map((r, i) => {
            const m = ibja(r.metal);
            return (
              <div key={r.metal} className="grid grid-cols-[1fr_auto] items-end gap-3">
                <Field label={r.metal} prefix="₹" inputMode="decimal" className="money" value={r.rate}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
                <button type="button" disabled={!m} onClick={() => m && setRows(rows.map((x, j) => (j === i ? { ...x, rate: plain(m, 2) } : x)))}
                  className="money mb-0.5 min-h-12 min-w-28 rounded-xl border border-gold-400/60 px-3 text-right text-sm disabled:opacity-40 enabled:hover:bg-gold-100"
                  title={m ? "Use IBJA rate" : "No IBJA rate for this metal"}>
                  <span className="block text-[11px] text-ink/60">IBJA</span>{m ? fmtINR(m) : "—"}
                </button>
              </div>
            );
          })}
        </div>

        {snap && (
          <button type="button" className="mt-3 text-sm font-semibold text-gold-600 underline-offset-4 hover:underline"
            onClick={() => setRows(rows.map((x) => { const m = ibja(x.metal); return m ? { ...x, rate: plain(m, 2) } : x; }))}>
            Sab IBJA rate use karein
          </button>
        )}
        {msg && <p className="mt-3 text-sm text-maroon-700" role="alert">{msg}</p>}
        <div className="mt-5 flex gap-2">
          <button onClick={later} className="min-h-12 rounded-xl px-4 text-ink/70 hover:bg-gold-100">Baad mein</button>
          <button onClick={save} disabled={busy} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-gold-600 px-5 font-semibold text-white transition hover:bg-maroon-700 active:scale-[.98] disabled:opacity-60">
            {busy ? "Saving…" : "Save & billing shuru"}
          </button>
        </div>
        <Link to="/app/market" onClick={() => setOpen(false)} className="mt-3 block text-center text-sm text-gold-600 underline-offset-4 hover:underline">Graph aur market rates dekhein →</Link>
      </div>
    </div>
  );
}
