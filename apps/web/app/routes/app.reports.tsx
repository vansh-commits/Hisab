import { Form, useSearchParams } from "react-router";
import { Empty, PageTitle, btn } from "../components/ui";
import { api } from "../lib/api";
import { fmtINR, plain } from "../lib/money";
import type { Route } from "./+types/app.reports";

const REPORTS = {
  "sales-register": "Sales register",
  "gst-summary": "GST summary",
  "hsn-summary": "HSN summary",
  "old-gold-register": "Old gold register",
} as const;
type Kind = keyof typeof REPORTS;

const ist = () => new Date(Date.now() + 330 * 60_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
function presets() {
  const t = ist();
  const y = t.getUTCFullYear(), m = t.getUTCMonth();
  const fy = m < 3 ? y - 1 : y;
  return [
    { label: "This month", from: iso(new Date(Date.UTC(y, m, 1))), to: iso(t) },
    { label: "Last month", from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    { label: "This FY", from: `${fy}-04-01`, to: iso(t) },
    { label: "Last FY", from: `${fy - 1}-04-01`, to: `${fy}-03-31` },
  ];
}

type Row = Record<string, string | number | boolean | null>;

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const q = new URL(request.url).searchParams;
  const kind = (q.get("r") as Kind) in REPORTS ? (q.get("r") as Kind) : "sales-register";
  const p = presets()[0]!;
  const from = q.get("from") || p.from, to = q.get("to") || p.to;
  const data = await api<{ items: Row[]; quantities?: Row[] }>(`/reports/${kind}?from=${from}&to=${to}`);
  return { kind, from, to, ...data };
}

const money = (k: string) => k.endsWith("_paise");
const COLS: Record<Kind, [string, string][]> = {
  "sales-register": [["invoice_no", "Bill"], ["invoice_date", "Date"], ["buyer_name", "Buyer"], ["buyer_gstin", "GSTIN"], ["taxable_paise", "Taxable"], ["cgst_paise", "CGST"], ["sgst_paise", "SGST"], ["igst_paise", "IGST"], ["grand_total_paise", "Total"], ["status", "Status"]],
  "gst-summary": [["month", "Month"], ["b2b", "Type"], ["supply_type", "Supply"], ["invoices", "Bills"], ["taxable_paise", "Taxable"], ["cgst_paise", "CGST"], ["sgst_paise", "SGST"], ["igst_paise", "IGST"], ["total_paise", "Total"]],
  "hsn-summary": [["hsn", "HSN"], ["gst_rate", "Rate"], ["taxable_paise", "Taxable"], ["cgst_paise", "CGST"], ["sgst_paise", "SGST"], ["igst_paise", "IGST"]],
  "old-gold-register": [["voucher_no", "Voucher"], ["voucher_date", "Date"], ["seller_name", "Seller"], ["seller_kind", "Kind"], ["settlement", "Settlement"], ["invoice_no", "Bill"], ["net_weight_mg", "Net wt (g)"], ["total_paise", "Amount"], ["status", "Status"]],
};

function cell(k: string, v: Row[string]) {
  if (v == null) return "—";
  if (money(k)) return fmtINR(Number(v));
  if (k === "net_weight_mg") return plain(Number(v), 3);
  if (k === "gst_rate") return `${Number(v) / 1000}%`;
  if (k === "b2b") return v ? "B2B" : "B2C";
  return String(v);
}

export default function Reports({ loaderData: d }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const cols = COLS[d.kind];
  const totals = cols.filter(([k]) => money(k)).map(([k]) => [k, d.items.filter((r) => r.status !== "cancelled").reduce((s, r) => s + Number(r[k] ?? 0), 0)] as const);
  const csv = `/api/reports/${d.kind}?from=${d.from}&to=${d.to}&format=csv`;
  return (
    <>
      <PageTitle title="Reports" action={<a href={csv} className={btn.ghost}>Download CSV</a>} />
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(REPORTS) as Kind[]).map((k) => {
          const p = new URLSearchParams(params);
          p.set("r", k);
          return <a key={k} href={`?${p}`} className={`rounded-full border px-3 py-2 text-sm ${d.kind === k ? "border-gold-600 bg-gold-600 text-white" : "border-gold-400 bg-white"}`}>{REPORTS[k]}</a>;
        })}
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {presets().map((p) => <a key={p.label} href={`?r=${d.kind}&from=${p.from}&to=${p.to}`} className={`rounded-lg px-3 py-1 ${d.from === p.from && d.to === p.to ? "bg-gold-100 font-semibold" : "underline"}`}>{p.label}</a>)}
      </div>
      <Form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="r" value={d.kind} />
        <input type="date" name="from" defaultValue={d.from} className="min-h-12 rounded-xl border border-gold-400/60 bg-white px-3" aria-label="From" />
        <input type="date" name="to" defaultValue={d.to} className="min-h-12 rounded-xl border border-gold-400/60 bg-white px-3" aria-label="To" />
        <button className={btn.ghost}>Show</button>
      </Form>
      {d.items.length ? (
        <div className="overflow-x-auto rounded-2xl border border-gold-400/40 bg-white">
          <table className="money w-full text-sm">
            <thead className="bg-gold-100 text-left"><tr>{cols.map(([k, l]) => <th key={k} className={`whitespace-nowrap px-3 py-2 ${money(k) ? "text-right" : ""}`}>{l}</th>)}</tr></thead>
            <tbody>
              {d.items.map((r, i) => (
                <tr key={i} className={`border-t border-gold-400/30 ${r.status === "cancelled" ? "text-ink/40 line-through" : ""}`}>
                  {cols.map(([k]) => <td key={k} className={`whitespace-nowrap px-3 py-2 ${money(k) ? "text-right" : ""}`}>{cell(k, r[k] ?? null)}</td>)}
                </tr>
              ))}
              <tr className="border-t border-gold-400/60 font-semibold">
                {cols.map(([k], i) => <td key={k} className={`px-3 py-2 ${money(k) ? "text-right" : ""}`}>{i === 0 ? "Total" : money(k) ? fmtINR(totals.find((t) => t[0] === k)![1]) : ""}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nothing in this period.</Empty>
      )}
      {d.kind === "hsn-summary" && d.quantities && d.quantities.length > 0 && (
        <p className="mt-3 text-sm text-ink/70">Quantities: {d.quantities.map((q) => `${q.hsn || "—"} ${plain(Number(q.qty_milli), 3)} ${q.unit}`).join(" · ")}</p>
      )}
      <p className="mt-3 text-xs text-ink/50">Cancelled bills are listed but left out of the totals.</p>
    </>
  );
}
