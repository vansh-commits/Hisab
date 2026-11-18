import type { HomeData } from "@hisab/api";
import { Link } from "react-router";
import { BillRows } from "../components/bills";
import { btn, Empty } from "../components/ui";
import { api } from "../lib/api";
import { fmtINR } from "../lib/money";
import type { Route } from "./+types/app.home";
import { readOnly, useMe } from "./app";

export async function clientLoader() {
  return api<HomeData>("/home");
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gold-400/40 bg-white p-4">
      <div className="text-sm text-ink/60">{label}</div>
      <div className="money mt-1 text-xl font-semibold sm:text-2xl">{value}</div>
      {sub && <div className="text-xs text-ink/50">{sub}</div>}
    </div>
  );
}

export default function Home({ loaderData: d }: Route.ComponentProps) {
  const me = useMe();
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink/60">Namaste {me.user.name.split(" ")[0]}</p>
          <h1 className="font-display text-3xl font-semibold">{me.business?.trade_name ?? "Dashboard"}</h1>
        </div>
        {!readOnly(me) && <Link to="/app/bills/new" className={btn.primary}>+ New bill</Link>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Today's sales" value={fmtINR(d.today_paise)} sub={`${d.today_count} bills`} />
        <Stat label="This month" value={fmtINR(d.month_paise)} sub={`${d.month_count} bills`} />
        <Link to="/app/customers" className="col-span-2 sm:col-span-1">
          <Stat label="To collect (udhaar)" value={fmtINR(d.outstanding_paise)} sub="All customers →" />
        </Link>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Today's rates (per gram)</h2>
          <Link to="/app/rates" className="text-sm text-gold-600 underline">Update</Link>
        </div>
        {d.rates.length ? (
          <div className="flex flex-wrap gap-2">
            {d.rates.map((r) => (
              <span key={r.metal} className="money rounded-full border border-gold-400/60 bg-white px-3 py-1 text-sm">
                <b>{r.metal}</b> {fmtINR(r.rate_paise)}
              </span>
            ))}
          </div>
        ) : (
          <Empty>No rates yet. <Link to="/app/rates" className="text-gold-600 underline">Add today's rates</Link></Empty>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Recent bills</h2>
          <Link to="/app/bills" className="text-sm text-gold-600 underline">All bills</Link>
        </div>
        {d.recent.length ? <BillRows rows={d.recent} /> : <Empty>Pehla bill banaiye — it takes under a minute.</Empty>}
      </section>
    </>
  );
}
