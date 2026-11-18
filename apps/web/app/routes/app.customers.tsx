import type { PartyBalance, State } from "@hisab/api";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button, Empty, Field, PageTitle, Select } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { fmtINR, toPaise } from "../lib/money";
import type { Route } from "./+types/app.customers";
import { readOnly, useMe } from "./app";

export async function clientLoader() {
  const [b, s] = await Promise.all([api<{ items: PartyBalance[] }>("/parties/balances"), api<{ items: State[] }>("/states")]);
  return { parties: b.items, states: s.items };
}

export default function Customers({ loaderData: { parties, states } }: Route.ComponentProps) {
  const me = useMe();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const shown = parties.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.phone?.includes(q));
  const total = parties.reduce((s, p) => s + Math.max(p.balance_paise, 0), 0);
  return (
    <>
      <PageTitle title="Customers (khata)" action={!readOnly(me) && <Button onClick={() => setAdding(!adding)}>{adding ? "Close" : "+ Customer"}</Button>} />
      {adding && <PartyForm states={states} />}
      <p className="money mb-3 text-sm text-ink/70">Total to collect: <b className="text-ink">{fmtINR(total)}</b></p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="mb-3 min-h-12 w-full rounded-xl border border-gold-400/60 bg-white px-3" />
      {shown.length ? (
        <ul className="divide-y divide-gold-400/30 overflow-hidden rounded-2xl border border-gold-400/40 bg-white">
          {shown.map((p) => (
            <li key={p.id}>
              <Link to={`/app/customers/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gold-100/50">
                <span><b>{p.name}</b> <span className="text-sm text-ink/60">{p.phone}</span></span>
                <span className={`money font-semibold ${p.balance_paise > 0 ? "text-maroon-700" : p.balance_paise < 0 ? "text-green-800" : "text-ink/50"}`}>
                  {p.balance_paise < 0 ? "Advance " : ""}{fmtINR(Math.abs(p.balance_paise))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No customers yet.</Empty>
      )}
    </>
  );
}

export function PartyForm({ states, party, onDone }: { states: State[]; party?: { id: string; name: string; phone: string | null; gstin: string | null; pan: string | null; bill_address: string; bill_state_code: string | null; opening_balance_paise: number }; onDone?: () => void }) {
  const navigate = useNavigate();
  const [err, setErr] = useState<Record<string, string>>({});
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim() || null;
    const opening = s("opening") ? toPaise(s("opening")!) : 0;
    if (opening == null) return setErr({ opening_balance_paise: "enter an amount" });
    const body = { name: s("name") ?? "", phone: s("phone"), gstin: s("gstin"), pan: s("pan"), bill_address: s("address") ?? "", bill_state_code: s("state"), opening_balance_paise: opening };
    try {
      const p = party
        ? await api<{ id: string }>(`/parties/${party.id}`, { method: "PATCH", body })
        : await api<{ id: string }>("/parties", { method: "POST", body });
      onDone ? onDone() : navigate(`/app/customers/${p.id}`);
    } catch (x) {
      if (x instanceof ApiError) setErr({ ...x.fields, _: x.message });
    }
  }
  return (
    <form onSubmit={submit} className="mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-gold-400/40 bg-white p-4">
      <div className="col-span-2"><Field label="Name" name="name" defaultValue={party?.name} required error={err.name} /></div>
      <Field label="Phone" name="phone" inputMode="tel" defaultValue={party?.phone ?? ""} />
      <Field label="Opening balance (they owe)" name="opening" prefix="₹" inputMode="decimal" defaultValue={party ? String(party.opening_balance_paise / 100) : ""} error={err.opening_balance_paise} />
      <div className="col-span-2"><Field label="Address" name="address" defaultValue={party?.bill_address} /></div>
      <Select label="State" name="state" defaultValue={party?.bill_state_code ?? ""} error={err.bill_state_code}>
        <option value="">—</option>
        {states.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.code}</option>)}
      </Select>
      <Field label="GSTIN" name="gstin" maxLength={15} defaultValue={party?.gstin ?? ""} error={err.gstin} />
      <Field label="PAN" name="pan" maxLength={10} defaultValue={party?.pan ?? ""} error={err.pan} />
      {err._ && <p className="col-span-2 text-sm text-maroon-700">{err._}</p>}
      <Button className="col-span-2">{party ? "Save changes" : "Add customer"}</Button>
    </form>
  );
}
