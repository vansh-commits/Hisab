import type { InvoiceRow, Ledger, Party, Settings, State } from "@hisab/api";
import { useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { fmtDate } from "../components/bills";
import { btn } from "../components/ui";
import { api } from "../lib/api";
import { fmtINR } from "../lib/money";
import type { Route } from "./+types/app.customer";
import { PaymentForm } from "./app.bill";
import { PartyForm } from "./app.customers";
import { readOnly, useMe } from "./app";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [party, ledger, states, bills, settings] = await Promise.all([
    api<Party>(`/parties/${params.id}`),
    api<Ledger>(`/parties/${params.id}/ledger`),
    api<{ items: State[] }>("/states"),
    api<{ items: InvoiceRow[] }>(`/invoices?status=issued&party_id=${params.id}`),
    api<Settings>("/settings"),
  ]);
  return { party, ledger, states: states.items, unpaid: bills.items.filter((b) => b.net_payable_paise > b.paid_paise), upi: settings.upi_id };
}

const LABEL: Record<string, string> = { invoice: "Bill", payment: "Payment", old_gold: "Old gold (exchange)", voucher: "Old gold bought", voucher_paid: "Paid for old gold" };

export default function Customer({ loaderData: { party, ledger, states, unpaid, upi } }: Route.ComponentProps) {
  const me = useMe();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const bal = ledger.closing_balance_paise;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{party.name}</h1>
          <p className="text-sm text-ink/70">{[party.phone, party.gstin && `GSTIN ${party.gstin}`, party.bill_address].filter(Boolean).join(" · ")}</p>
          {party.archived_at && <p className="text-sm text-maroon-700">Archived</p>}
        </div>
        <div className="text-right">
          <div className="text-sm text-ink/60">{bal >= 0 ? "To collect" : "Advance"}</div>
          <div className={`money text-2xl font-bold ${bal > 0 ? "text-maroon-700" : "text-green-800"}`}>{fmtINR(Math.abs(bal))}</div>
        </div>
      </div>
      {!readOnly(me) && (
        <div className="flex flex-wrap gap-2">
          <Link to="/app/bills/new" className={btn.primary}>New bill</Link>
          <button className={btn.ghost} onClick={() => setPay(!pay)}>Receive payment</button>
          <button className={btn.ghost} onClick={() => setEdit(!edit)}>Edit</button>
          {party.phone && bal > 0 && <a className={btn.ghost} href={`https://wa.me/${party.phone.replace(/\D/g, "").replace(/^(?=\d{10}$)/, "91")}?text=${encodeURIComponent(reminder(party.name, me.business?.trade_name ?? "", unpaid, bal, upi))}`} target="_blank" rel="noreferrer">WhatsApp reminder</a>}
        </div>
      )}
      {edit && (
        <>
          <PartyForm states={states} party={party} onDone={() => { setEdit(false); revalidate(); }} />
          <button className="text-sm text-maroon-700 underline" onClick={async () => { if (confirm("Delete this customer? (Kept as archived if they have bills.)")) { await api(`/parties/${party.id}`, { method: "DELETE" }); navigate("/app/customers"); } }}>
            Delete customer
          </button>
        </>
      )}
      {pay && <div className="rounded-2xl border border-gold-400/40 bg-white p-4"><p className="text-sm text-ink/70">On-account payment (not linked to one bill).</p><PaymentForm partyId={party.id} done={() => { setPay(false); return revalidate(); }} /></div>}

      <section className="overflow-x-auto rounded-2xl border border-gold-400/40 bg-white">
        <table className="money w-full text-sm">
          <thead className="bg-gold-100 text-left">
            <tr><th className="px-3 py-2">Date</th><th>Entry</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="px-3 text-right">Balance</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-gold-400/30"><td className="px-3 py-2" colSpan={4}>Opening balance</td><td className="px-3 text-right">{fmtINR(ledger.opening_balance_paise)}</td></tr>
            {ledger.entries.map((e, i) => (
              <tr key={i} className="border-t border-gold-400/30">
                <td className="whitespace-nowrap px-3 py-2">{fmtDate(e.date)}</td>
                <td>{e.type === "invoice" ? <Link to={`/app/bills/${e.id}`} className="text-gold-600 underline">{LABEL[e.type]} {e.ref}</Link> : `${LABEL[e.type] ?? e.type} ${e.ref}`}</td>
                <td className="text-right">{e.debit_paise ? fmtINR(e.debit_paise) : ""}</td>
                <td className="text-right">{e.credit_paise ? fmtINR(e.credit_paise) : ""}</td>
                <td className="px-3 text-right">{fmtINR(e.balance_paise)}</td>
              </tr>
            ))}
            <tr className="border-t border-gold-400/60 font-semibold"><td className="px-3 py-2" colSpan={4}>Closing balance</td><td className="px-3 text-right">{fmtINR(bal)}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

// reminder is the WhatsApp text: greeting, each unpaid bill, the khata total and how to pay.
// ponytail: only the latest 50 issued bills are checked (one /invoices page); older dues still count in the total.
function reminder(name: string, shop: string, unpaid: InvoiceRow[], bal: number, upi: string | null) {
  const lines = [`Namaste ${name} ji 🙏`, "", shop ? `${shop} se payment reminder.` : "Payment reminder."];
  if (unpaid.length) {
    lines.push("", unpaid.length === 1 ? "Aapka ye bill pending hai:" : "Aapke ye bills pending hain:", "");
    for (const b of [...unpaid].reverse()) lines.push(`• Bill ${b.invoice_no} (${fmtDate(b.invoice_date)}) — ${fmtINR(b.net_payable_paise - b.paid_paise)} pending`);
  }
  lines.push("", `*Total pending: ${fmtINR(bal)}*`, "");
  if (upi) lines.push(`UPI se bhi pay kar sakte hain: ${upi}`, "");
  lines.push("Agar payment ho chuka hai to is message ko ignore karein.", "", "Thank you!", shop);
  return lines.join("\n").trim();
}
