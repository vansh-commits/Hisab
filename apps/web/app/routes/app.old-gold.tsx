import type { MetalRate, Page, PartyBalance, Voucher } from "@hisab/api";
import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { fmtDate } from "../components/bills";
import { Badge, Button, Empty, Field, PageTitle, Select } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { fmtINR, parseScaled, plain } from "../lib/money";
import type { Route } from "./+types/app.old-gold";
import { readOnly, useMe } from "./app";

export async function clientLoader() {
  const [v, p, r] = await Promise.all([api<Page<Voucher>>("/purchase-vouchers"), api<{ items: PartyBalance[] }>("/parties/balances"), api<{ items: MetalRate[] }>("/metal-rates")]);
  return { vouchers: v.items, parties: p.items, rates: r.items };
}

type Row = { description: string; purity: string; gross: string; less: string; rate: string };

export default function OldGold({ loaderData: d }: Route.ComponentProps) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageTitle title="Old gold purchases" action={!readOnly(me) && <Button onClick={() => setOpen(!open)}>{open ? "Close" : "+ Buy old gold"}</Button>} />
      <p className="mb-4 text-sm text-ink/70">Exchange against a new bill is done on the bill itself. Use this when you only buy old gold (pay cash, or credit the customer's khata).</p>
      {open && <VoucherForm d={d} done={() => setOpen(false)} />}
      {d.vouchers.length ? (
        <ul className="divide-y divide-gold-400/30 overflow-hidden rounded-2xl border border-gold-400/40 bg-white">
          {d.vouchers.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{v.voucher_no}</span>
                  {v.status === "cancelled" && <Badge kind="cancelled">cancelled</Badge>}
                  <span className="text-xs text-ink/60">{{ exchange: "Exchange", paid: `Paid ${v.paid_mode ?? ""}`, on_account: "To khata" }[v.settlement]}</span>
                </div>
                <div className="truncate text-sm text-ink/70">{v.seller_name} · {fmtDate(v.voucher_date)} · {plain(v.net_weight_mg, 3)} g</div>
              </div>
              <div className="money text-right font-semibold">{fmtINR(v.total_paise)}</div>
              <a href={`/api/purchase-vouchers/${v.id}/pdf`} target="_blank" rel="noreferrer" className="text-sm text-gold-600 underline">PDF</a>
              {v.status === "issued" && v.settlement !== "exchange" && !readOnly(me) && <CancelVoucher id={v.id} />}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No old gold bought yet.</Empty>
      )}
    </>
  );
}

function CancelVoucher({ id }: { id: string }) {
  const { revalidate } = useRevalidator();
  return (
    <button className="text-xs text-maroon-700" onClick={async () => { const r = prompt("Reason for cancelling?"); if (r) { await api(`/purchase-vouchers/${id}/cancel`, { method: "POST", body: { reason: r } }); revalidate(); } }}>
      Cancel
    </button>
  );
}

function VoucherForm({ d, done }: { d: { parties: PartyBalance[]; rates: MetalRate[] }; done: () => void }) {
  const { revalidate } = useRevalidator();
  const rate22 = plain(d.rates.find((r) => r.metal === "22K")?.rate_paise, 2);
  const [rows, setRows] = useState<Row[]>([{ description: "Old gold ornaments", purity: "22K", gross: "", less: "", rate: rate22 }]);
  const [seller, setSeller] = useState({ name: "", phone: "", address: "", pan: "" });
  const [kind, setKind] = useState<"individual" | "business">("individual");
  const [settlement, setSettlement] = useState<"paid" | "on_account">("paid");
  const [mode, setMode] = useState("cash");
  const [party, setParty] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const lines = rows.map((r) => ({ description: r.description, purity: r.purity || null, gross_weight_mg: parseScaled(r.gross, 3) ?? 0, less_weight_mg: parseScaled(r.less, 3) ?? 0, rate_paise: parseScaled(r.rate, 2) ?? 0 }));
  const key = JSON.stringify(lines);
  useEffect(() => {
    const t = setTimeout(() => api<{ total_paise: number }>("/purchase-vouchers/compute", { method: "POST", body: { lines } }).then((r) => setTotal(r.total_paise), () => setTotal(null)), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  async function save() {
    const p = d.parties.find((x) => x.id === party);
    try {
      await api("/purchase-vouchers", { method: "POST", body: {
        party_id: party || null, seller_kind: kind, settlement, paid_mode: settlement === "paid" ? mode : null, lines,
        seller: { name: p?.name ?? seller.name, phone: (p?.phone ?? seller.phone) || null, address: p ? "" : seller.address, pan: seller.pan || null, state_code: null, gstin: null },
      } });
      await revalidate();
      done();
    } catch (e) {
      if (e instanceof ApiError) setErr({ ...e.fields, _: e.message });
    }
  }
  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-gold-400/40 bg-white p-4">
      <Select label="Customer (from khata)" value={party} onChange={(e) => setParty(e.target.value)} error={err.party_id}>
        <option value="">Not in khata — type seller below</option>
        {d.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      {!party && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Seller name" value={seller.name} onChange={(e) => setSeller({ ...seller, name: e.target.value })} error={err["seller.name"]} />
          <Field label="Phone" value={seller.phone} onChange={(e) => setSeller({ ...seller, phone: e.target.value })} />
          <Field label="Address" value={seller.address} onChange={(e) => setSeller({ ...seller, address: e.target.value })} />
          <Field label="PAN (optional)" value={seller.pan} maxLength={10} onChange={(e) => setSeller({ ...seller, pan: e.target.value.toUpperCase() })} error={err["seller.pan"]} />
        </div>
      )}
      <div className="flex gap-4 text-sm">
        {(["individual", "business"] as const).map((k) => <label key={k} className="flex items-center gap-2"><input type="radio" checked={kind === k} onChange={() => setKind(k)} className="accent-gold-600" />{k === "individual" ? "Personal jewellery" : "Unregistered dealer"}</label>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-6 gap-3 border-t border-gold-400/30 pt-3">
          <div className="col-span-4"><Field label="Description" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} /></div>
          <div className="col-span-2"><Field label="Purity" value={r.purity} onChange={(e) => setRow(i, { purity: e.target.value })} /></div>
          <div className="col-span-2"><Field label="Gross (g)" inputMode="decimal" value={r.gross} onChange={(e) => setRow(i, { gross: e.target.value })} error={err[`lines[${i}].gross_weight_mg`]} /></div>
          <div className="col-span-2"><Field label="Less (g)" inputMode="decimal" value={r.less} onChange={(e) => setRow(i, { less: e.target.value })} /></div>
          <div className="col-span-2"><Field label="Rate ₹/g" inputMode="decimal" value={r.rate} onChange={(e) => setRow(i, { rate: e.target.value })} error={err[`lines[${i}].rate_paise`]} /></div>
        </div>
      ))}
      <button className="text-sm text-gold-600 underline" onClick={() => setRows([...rows, { description: "Old gold", purity: "", gross: "", less: "", rate: rate22 }])}>+ Another piece</button>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Settlement" value={settlement} onChange={(e) => setSettlement(e.target.value as "paid" | "on_account")}>
          <option value="paid">Paid now</option>
          <option value="on_account">Credit to khata</option>
        </Select>
        {settlement === "paid" && (
          <Select label="Paid by" value={mode} onChange={(e) => setMode(e.target.value)} error={err.paid_mode}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="cheque">Cheque</option>
          </Select>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="money text-xl font-bold">{total != null ? fmtINR(total) : "—"}</span>
        <Button onClick={save} disabled={total == null}>Save voucher</Button>
      </div>
      {err._ && <p className="text-sm text-maroon-700">{err._}</p>}
    </div>
  );
}
