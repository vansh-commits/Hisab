import type { InvoiceRow } from "@hisab/api";
import { Link } from "react-router";
import { fmtINR } from "../lib/money";
import { Badge } from "./ui";

export const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function payState(r: { status: string; grand_total_paise: number; paid_paise: number }) {
  if (r.status !== "issued") return null;
  if (r.paid_paise >= r.grand_total_paise) return <Badge kind="paid">Paid</Badge>;
  if (r.paid_paise > 0) return <Badge kind="partial">Part paid</Badge>;
  return <Badge kind="due">Due</Badge>;
}

// BillRows: one tappable row per bill (cards on phone, same markup on desktop).
export function BillRows({ rows }: { rows: InvoiceRow[] }) {
  return (
    <ul className="divide-y divide-gold-400/30 overflow-hidden rounded-2xl border border-gold-400/40 bg-white">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center hover:bg-gold-100/50">
          <Link to={r.status === "draft" ? `/app/bills/${r.id}/edit` : `/app/bills/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{r.invoice_no ?? "Draft"}</span>
                {r.status !== "issued" && <Badge kind={r.status}>{r.status}</Badge>}
                {payState(r)}
              </div>
              <div className="truncate text-sm text-ink/70">{r.buyer_name || "Cash customer"} · {fmtDate(r.invoice_date)}</div>
            </div>
            <div className={`money text-right font-semibold ${r.status === "cancelled" ? "text-ink/40 line-through" : ""}`}>
              {fmtINR(r.net_payable_paise)}
              {r.old_gold_paise > 0 && <div className="text-xs font-normal text-ink/50">after old gold</div>}
            </div>
          </Link>
          {r.status !== "draft" ? (
            <a href={`/api/invoices/${r.id}/pdf`} target="_blank" rel="noreferrer" aria-label={`PDF of ${r.invoice_no}`}
              className="mx-3 rounded-lg border border-gold-400/60 px-2 py-1 text-xs font-semibold text-gold-600 hover:bg-gold-100">PDF</a>
          ) : <span className="w-4" />}
        </li>
      ))}
    </ul>
  );
}
