import type { MarketRates, Purity } from "@hisab/api";
import { ArrowRight, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { api } from "../lib/api";
import { closes, fmtDay, latest, PURITY } from "../lib/market";
import { fmtINR } from "../lib/money";
import type { Route } from "./+types/app.market";

export function meta() {
  return [{ title: "Market rates · Hisab" }];
}

export async function clientLoader() {
  return api<MarketRates>("/market-rates?days=400");
}

const CARDS: Purity[] = ["gold999", "gold916", "gold750", "silver999"];
const RANGES = [["1W", 7], ["1M", 30], ["3M", 91], ["1Y", 365]] as const;
const rupees = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");

function Change({ now, prev, className = "" }: { now?: number; prev?: number; className?: string }) {
  if (!now || !prev) return <span className={`text-ink/50 ${className}`}>—</span>;
  const d = now - prev;
  const up = d >= 0;
  return (
    <span className={`money font-semibold ${up ? "text-emerald-700" : "text-red-700"} ${className}`}>
      {up ? "▲" : "▼"} {rupees(Math.abs(d))} ({((Math.abs(d) / prev) * 100).toFixed(2)}%)
    </span>
  );
}

function Chart({ data }: { data: { day: string; v: number }[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || !data.length) return;
    let chart: import("lightweight-charts").IChartApi | undefined;
    let off = false;
    import("lightweight-charts").then(({ createChart, AreaSeries, ColorType }) => {
      if (off || !el.current) return;
      chart = createChart(el.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#6b6258", fontFamily: "inherit", attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { color: "#efe6d2" } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { vertLine: { color: "#c9a44c", labelBackgroundColor: "#9a7b2f" }, horzLine: { color: "#c9a44c", labelBackgroundColor: "#9a7b2f" } },
        localization: { locale: "en-IN", priceFormatter: (v: number) => "₹" + Math.round(v).toLocaleString("en-IN") },
        handleScroll: false,
        handleScale: false,
      });
      const s = chart.addSeries(AreaSeries, { lineColor: "#9a7b2f", topColor: "rgba(201,164,76,.45)", bottomColor: "rgba(201,164,76,.02)", lineWidth: 2, priceLineVisible: false });
      s.setData(data.map((p) => ({ time: p.day, value: p.v / 100 })));
      chart.timeScale().fitContent();
    });
    return () => { off = true; chart?.remove(); };
  }, [data]);
  return <div ref={el} className="h-64 w-full sm:h-80" role="img" aria-label="Price chart" />;
}

export default function Market({ loaderData }: Route.ComponentProps) {
  const [m, setM] = useState(loaderData);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Purity>("gold999");
  const [range, setRange] = useState<number>(30);
  const snap = useMemo(() => latest(m.items), [m]);
  const all = useMemo(() => closes(m.items, sel), [m, sel]);
  const data = useMemo(() => {
    const from = new Date(Date.now() - range * 864e5).toISOString().slice(0, 10);
    return all.filter((p) => p.day >= from);
  }, [all, range]);
  const year = all.filter((p) => p.day >= new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)).map((p) => p.v);
  const vals = data.map((p) => p.v);

  async function refresh() {
    setBusy(true);
    try { setM(await api<MarketRates>("/market-rates/refresh?days=400", { method: "POST" })); } catch { setM({ ...m, stale: true }); }
    setBusy(false);
  }

  const unit = PURITY[sel].silver ? "kg" : "10g";
  const per = (p: number) => (PURITY[sel].silver ? p * 1000 : p * 10);

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Market rates</h1>
        <button onClick={refresh} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gold-400 bg-white px-4 font-semibold transition hover:bg-gold-100 disabled:opacity-60">
          <RefreshCw aria-hidden className={`size-4 ${busy ? "animate-spin" : ""}`} /> {busy ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="mb-4 text-sm text-ink/70">
        IBJA benchmark · per gram · GST alag.
        {snap && <> Latest: <b>{snap.session} rate, {fmtDay(snap.day)}</b> · checked {new Date(snap.fetchedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.</>}
      </p>
      {m.stale && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-xl bg-maroon-700/10 p-3 text-sm text-maroon-700">
          <TriangleAlert aria-hidden className="size-4 shrink-0" /> IBJA se naya rate nahi mil paya. Pichla rate dikha rahe hain.
        </p>
      )}

      {!snap ? (
        <p className="rounded-2xl border border-gold-400/40 bg-white p-6 text-center text-ink/70">Abhi koi rate nahi hai. Refresh dabaiye.</p>
      ) : (
        <>
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CARDS.map((p) => {
              const v = snap.now[p];
              return (
                <button key={p} onClick={() => setSel(p)} aria-pressed={sel === p}
                  className={`rounded-2xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${sel === p ? "border-gold-600 ring-2 ring-gold-400/50" : "border-gold-400/40"}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gold-600">{PURITY[p].label}</span>
                  <span className="money mt-1 block text-2xl font-semibold">{v ? fmtINR(v) : "—"}<span className="text-sm font-normal text-ink/50">/g</span></span>
                  {v && <span className="money block text-xs text-ink/60">{rupees(PURITY[p].silver ? v * 1000 : v * 10)} / {PURITY[p].silver ? "kg" : "10g"}</span>}
                  <Change now={v} prev={snap.prev[p]} className="mt-2 block text-xs" />
                </button>
              );
            })}
          </div>

          <section className="mt-5 rounded-2xl border border-gold-400/40 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{PURITY[sel].label}</h2>
                {data.length > 1 && <Change now={vals.at(-1)} prev={vals[0]} className="text-sm" />}
                {data.length > 1 && <span className="text-sm text-ink/50"> in {RANGES.find(([, d]) => d === range)?.[0]}</span>}
              </div>
              <div className="flex rounded-xl bg-gold-100 p-1" role="group" aria-label="Range">
                {RANGES.map(([l, d]) => (
                  <button key={l} onClick={() => setRange(d)} aria-pressed={range === d}
                    className={`min-h-9 rounded-lg px-3 text-sm font-semibold transition ${range === d ? "bg-white text-gold-600 shadow-sm" : "text-ink/60 hover:text-ink"}`}>{l}</button>
                ))}
              </div>
            </div>
            {data.length > 1 ? <Chart data={data} /> : <p className="py-16 text-center text-sm text-ink/60">Is range ke liye data kam hai.</p>}
            {vals.length > 0 && (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gold-400/30 pt-4 text-sm sm:grid-cols-4">
                {([["High", Math.max(...vals)], ["Low", Math.min(...vals)], ["Average", vals.reduce((a, b) => a + b, 0) / vals.length], ["52-week high", Math.max(...year)]] as const).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink/60">{k}</dt>
                    <dd className="money font-semibold">{fmtINR(Math.round(v))}<span className="font-normal text-ink/50">/g</span></dd>
                    <dd className="money text-xs text-ink/50">{rupees(per(v))} / {unit}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-ink/50">Source: IBJA (ibjarates.com). Weekend aur holiday par rate nahi aata.</span>
        <Link to="/app/rates" className="inline-flex items-center gap-1 font-semibold text-gold-600 underline-offset-4 hover:underline">Apne billing rate badlein <ArrowRight aria-hidden className="size-4" /></Link>
      </div>
    </>
  );
}
