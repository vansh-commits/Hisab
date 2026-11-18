import type { InvoiceDetail, PayMode, Warning } from "@hisab/api";
import { useState } from "react";
import { Link, redirect, useRevalidator, useSearchParams } from "react-router";
import { fmtDate, payState } from "../components/bills";
import { Badge, Button, Field } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { fmtINR, plain, toPaise } from "../lib/money";
import type { Route } from "./+types/app.bill";
import { readOnly, useMe } from "./app";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const d = await api<InvoiceDetail>(`/invoices/${params.id}`);
  if (d.invoice.status === "draft") throw redirect(`/app/bills/${params.id}/edit`);
  return d;
}

const MODES: { v: PayMode; label: string }[] = [
  { v: "cash", label: "Cash" },
  { v: "upi", label: "UPI" },
  { v: "bank", label: "Bank" },
  { v: "cheque", label: "Cheque" },
  { v: "card", label: "Card" },
];

async function share(url: string, name: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], name.replace(/\//g, "-") + ".pdf", { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: name });
  } catch {}
  window.open(url, "_blank");
}

export default function Bill({ loaderData: d }: Route.ComponentProps) {
  const me = useMe();
  const { revalidate } = useRevalidator();
  const [params] = useSearchParams();
  const inv = d.invoice;
  const s = d.snapshot!;
  const t = s.totals;
  const due = t.grand_total_paise - d.paid_paise;
  const issued = inv.status === "issued";
  const pdf = `/api/invoices/${inv.id}/pdf`;
  const [msg, setMsg] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setMsg(null);
    try {
      await fn();
      await revalidate();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Something went wrong");
    }
  }

  return (
    <div className="space-y-5">
      {params.get("new") && issued && (
        <div className="step-in rounded-2xl bg-green-50 p-4 text-center">
          <div className="text-3xl" aria-hidden>✅</div>
          <b className="text-lg">Bill {inv.invoice_no} issued</b>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{s.doc.no}</h1>
          <p className="text-ink/70">{s.doc.title} · {fmtDate(s.doc.date)}</p>
          <div className="mt-1 flex gap-2">
            <Badge kind={inv.status}>{inv.status}</Badge>
            {payState({ status: inv.status, grand_total_paise: t.grand_total_paise, paid_paise: d.paid_paise })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center rounded-xl bg-gold-600 px-5 font-semibold text-white">PDF / Print</a>
          <button className="min-h-12 rounded-xl border border-gold-400 px-4 font-semibold" onClick={() => share(pdf, s.doc.no)}>Share</button>
        </div>
      </div>
      {inv.status === "cancelled" && <p className="rounded-xl bg-maroon-700/10 p-3 text-maroon-700">Cancelled: {inv.cancel_reason}</p>}
      {msg && <p className="rounded-xl bg-maroon-700/10 p-3 text-maroon-700" role="alert">{msg}</p>}

      <section className="rounded-2xl border border-gold-400/40 bg-white p-4">
        <div className="text-sm text-ink/60">Bill to</div>
        <div className="font-semibold">{s.buyer.name}</div>
        <div className="text-sm text-ink/70">{[s.buyer.address, s.buyer.state && `${s.buyer.state.name} (${s.buyer.state.code})`, s.buyer.gstin && `GSTIN ${s.buyer.gstin}`, s.buyer.phone].filter(Boolean).join(" · ")}</div>
        {inv.party_id && <Link to={`/app/customers/${inv.party_id}`} className="text-sm text-gold-600 underline">Customer khata →</Link>}
        <table className="money mt-4 w-full text-sm">
          <thead className="text-left text-ink/60">
            <tr><th className="py-1">Item</th><th className="text-right">Wt / qty</th><th className="text-right">Taxable</th></tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.sno} className="border-t border-gold-400/30 align-top">
                <td className="py-2">{l.description} {l.purity && `· ${l.purity}`}<div className="text-xs text-ink/60">HSN {l.hsn ?? "—"}{l.qty_milli ? ` · @ ${fmtINR(l.rate_paise)}${l.rate_derived ? "*" : ""}` : ""}{l.making?.paise ? ` · making ${fmtINR(l.making.paise)}` : ""}</div></td>
                <td className="text-right">{l.qty_milli ? `${plain(l.qty_milli, 3)} ${l.unit}` : ""}</td>
                <td className="text-right">{fmtINR(l.taxable_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="money mt-3 grid grid-cols-2 gap-y-1 border-t border-gold-400/40 pt-3 text-sm">
          <dt>Taxable</dt><dd className="text-right">{fmtINR(t.taxable_paise)}</dd>
          {t.cgst_paise > 0 && <><dt>CGST</dt><dd className="text-right">{fmtINR(t.cgst_paise)}</dd><dt>{t.sgst_label}</dt><dd className="text-right">{fmtINR(t.sgst_paise)}</dd></>}
          {t.igst_paise > 0 && <><dt>IGST</dt><dd className="text-right">{fmtINR(t.igst_paise)}</dd></>}
          {t.round_off_paise !== 0 && <><dt>Round off</dt><dd className="text-right">{fmtINR(t.round_off_paise)}</dd></>}
          <dt className="font-semibold">Bill total</dt><dd className="text-right font-semibold">{fmtINR(t.grand_total_paise)}</dd>
          {s.old_gold && <><dt>Old gold ({s.old_gold.voucher_no})</dt><dd className="text-right">−{fmtINR(s.old_gold.total_paise)}</dd>
            <dt className="font-semibold">Net payable</dt><dd className="text-right font-semibold">{fmtINR(t.net_payable_paise)}</dd></>}
        </dl>
        <p className="mt-2 text-xs text-ink/60">{s.words.grand_total}</p>
        {d.voucher_id && <a href={`/api/purchase-vouchers/${d.voucher_id}/pdf`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-gold-600 underline">Old gold voucher PDF</a>}
      </section>

      <section className="rounded-2xl border border-gold-400/40 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Payments</h2>
          <span className="money text-sm">Received {fmtINR(d.paid_paise)} · <b>Due {fmtINR(Math.max(due, 0))}</b></span>
        </div>
        <ul className="mt-2 divide-y divide-gold-400/30 text-sm">
          {d.payments.map((p) => (
            <li key={p.id} className={`flex items-center justify-between py-2 ${p.voided_at ? "text-ink/40 line-through" : ""}`}>
              <span>{fmtDate(p.received_on)} · {p.mode === "old_gold" ? "Old gold" : p.mode.toUpperCase()} {p.reference && `· ${p.reference}`}</span>
              <span className="flex items-center gap-3">
                <span className="money">{fmtINR(p.amount_paise)}</span>
                {!p.voided_at && p.mode !== "old_gold" && !readOnly(me) && (
                  <button className="text-xs text-maroon-700 no-underline" onClick={() => { const r = prompt("Why void this payment?"); if (r) act(() => api(`/payments/${p.id}/void`, { method: "POST", body: { reason: r } })); }}>Void</button>
                )}
              </span>
            </li>
          ))}
          {!d.payments.length && <li className="py-2 text-ink/60">No payments yet.</li>}
        </ul>
        {issued && due > 0 && !readOnly(me) && <PaymentForm invoiceId={inv.id} due={due} done={revalidate} />}
      </section>

      {issued && !readOnly(me) && (
        <button className="text-sm text-maroon-700 underline"
          onClick={() => { const r = prompt("Reason for cancelling this bill? (The number stays used.)"); if (r) act(() => api(`/invoices/${inv.id}/cancel`, { method: "POST", body: { reason: r } })); }}>
          Cancel this bill
        </button>
      )}
    </div>
  );
}

export function PaymentForm({ invoiceId, partyId, due, done }: { invoiceId?: string; partyId?: string; due?: number; done: () => unknown }) {
  const [amount, setAmount] = useState(due ? plain(due, 2) : "");
  const [mode, setMode] = useState<PayMode>("cash");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<Warning[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const p = toPaise(amount);
    if (!p) return setErr("Enter the amount");
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ warnings: Warning[] }>("/payments", { method: "POST", body: { invoice_id: invoiceId ?? null, party_id: partyId ?? null, amount_paise: p, mode, reference: ref || null } });
      setWarn(r.warnings);
      setRef("");
      await done();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-3 border-t border-gold-400/40 pt-4">
      <h3 className="text-sm font-semibold">Record payment</h3>
      <div className="grid grid-cols-5 gap-1">
        {MODES.map((m) => (
          <button key={m.v} type="button" onClick={() => setMode(m.v)} className={`min-h-12 rounded-xl border text-sm font-semibold ${mode === m.v ? "border-gold-600 bg-gold-600 text-white" : "border-gold-400/60"}`}>{m.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={err} />
        <Field label={mode === "cheque" ? "Cheque no" : "Reference (UTR etc.)"} value={ref} onChange={(e) => setRef(e.target.value)} />
      </div>
      {warn.map((w) => <p key={w.code} className="rounded-lg bg-gold-100 px-2 py-1 text-xs">⚠ {w.message}</p>)}
      <Button type="button" className="w-full" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save payment"}</Button>
    </div>
  );
}
