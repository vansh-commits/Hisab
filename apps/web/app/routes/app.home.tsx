import type { HomeData } from "@hisab/api";
import { ArrowRight, BookOpen, CalendarDays, Coins, IndianRupee, Plus, Receipt, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { BillRows } from "../components/bills";
import { btn, Empty } from "../components/ui";
import { api } from "../lib/api";
import { fmtINR } from "../lib/money";
import { useCountUp } from "../lib/motion";
import type { Route } from "./+types/app.home";
import { readOnly, useMe } from "./app";

export async function clientLoader() {
  return api<HomeData>("/home");
}

function Stat({ label, paise, sub, icon: Icon, tone }: { label: string; paise: number; sub: string; icon: LucideIcon; tone: string }) {
  const v = useCountUp(paise);
  return (
    <div className="lift h-full rounded-2xl border border-gold-400/40 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink/70">{label}</span>
        <span className={`grid size-9 place-items-center rounded-xl ${tone}`}><Icon aria-hidden className="size-[18px]" /></span>
      </div>
      <div className="money mt-2 text-xl font-semibold sm:text-2xl">{fmtINR(v)}</div>
      <div className="text-xs text-ink/60">{sub}</div>
    </div>
  );
}

const ACTIONS: { to: string; label: string; sub: string; icon: LucideIcon }[] = [
  { to: "/app/bills/new", label: "New bill", sub: "Rate se ya total se", icon: Plus },
  { to: "/app/customers", label: "Receive payment", sub: "From the khata", icon: Wallet },
  { to: "/app/old-gold", label: "Buy old gold", sub: "Purchase voucher", icon: Coins },
  { to: "/app/rates", label: "Update rates", sub: "Aaj ka bhav", icon: TrendingUp },
];

export default function Home({ loaderData: d }: Route.ComponentProps) {
  const me = useMe();
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-ink/60"><CalendarDays aria-hidden className="size-4" /> {today}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Namaste {me.user.name.split(" ")[0]} 🙏</h1>
        </div>
        {!readOnly(me) && <Link to="/app/bills/new" className={btn.primary}><Plus aria-hidden className="size-5" /> New bill</Link>}
      </div>

      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Today's sales" paise={d.today_paise} sub={`${d.today_count} bills`} icon={IndianRupee} tone="bg-green-50 text-green-800" />
        <Stat label="This month" paise={d.month_paise} sub={`${d.month_count} bills`} icon={Receipt} tone="bg-gold-100 text-gold-600" />
        <Link to="/app/customers" className="col-span-2 rounded-2xl sm:col-span-1">
          <Stat label="To collect (udhaar)" paise={d.outstanding_paise} sub="All customers →" icon={BookOpen} tone="bg-maroon-700/10 text-maroon-700" />
        </Link>
      </div>

      {!readOnly(me) && (
        <div className="stagger mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ACTIONS.map((a) => (
            <Link key={a.to} to={a.to} className="lift group flex items-center gap-3 rounded-2xl border border-gold-400/40 bg-white p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-600 text-white transition group-hover:rotate-[-6deg]"><a.icon aria-hidden className="size-5" /></span>
              <span className="min-w-0"><b className="block truncate">{a.label}</b><span className="block truncate text-xs text-ink/60">{a.sub}</span></span>
            </Link>
          ))}
        </div>
      )}

      <section className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><TrendingUp aria-hidden className="size-4 text-gold-600" /> Today's rates (per gram)</h2>
          <Link to="/app/rates" className="text-sm text-gold-600 underline-offset-4 hover:underline">Update</Link>
        </div>
        {d.rates.length ? (
          <div className="stagger flex flex-wrap gap-2">
            {d.rates.map((r) => (
              <span key={r.metal} className="money rounded-full border border-gold-400/60 bg-white px-3 py-1.5 text-sm">
                <b>{r.metal}</b> {fmtINR(r.rate_paise)}
              </span>
            ))}
          </div>
        ) : (
          <Empty>No rates yet. <Link to="/app/rates" className="text-gold-600 underline">Add today's rates</Link></Empty>
        )}
      </section>

      <section className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><Receipt aria-hidden className="size-4 text-gold-600" /> Recent bills</h2>
          <Link to="/app/bills" className="flex items-center gap-1 text-sm text-gold-600 underline-offset-4 hover:underline">All bills <ArrowRight aria-hidden className="size-4" /></Link>
        </div>
        {d.recent.length ? <BillRows rows={d.recent} /> : <Empty>Pehla bill banaiye — it takes under a minute.</Empty>}
      </section>
    </>
  );
}
