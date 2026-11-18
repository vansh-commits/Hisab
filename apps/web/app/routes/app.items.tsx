import type { Item, MetalRate } from "@hisab/api";
import { useState } from "react";
import { useRevalidator } from "react-router";
import { ItemForm } from "../components/item-form";
import { Button, Empty, PageTitle } from "../components/ui";
import { api } from "../lib/api";
import { fmtINR } from "../lib/money";
import type { Route } from "./+types/app.items";
import { readOnly, useMe } from "./app";

export async function clientLoader() {
  const [items, rates] = await Promise.all([api<{ items: Item[] }>("/items"), api<{ items: MetalRate[] }>("/metal-rates")]);
  return { items: items.items, rates: rates.items };
}

export default function Items({ loaderData: { items, rates } }: Route.ComponentProps) {
  const me = useMe();
  const { revalidate } = useRevalidator();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [q, setQ] = useState("");
  const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.hsn?.includes(q));
  const done = () => { setEditing(null); revalidate(); };
  const rateOf = (i: Item) => (i.metal ? rates.find((r) => r.metal === i.metal)?.rate_paise : i.default_rate_paise);

  async function remove(i: Item) {
    if (!confirm(`Delete "${i.name}"? Old bills keep their details.`)) return;
    await api(`/items/${i.id}`, { method: "DELETE" });
    revalidate();
  }

  return (
    <>
      <PageTitle title="Particulars" action={!readOnly(me) && editing !== "new" && <Button onClick={() => setEditing("new")}>+ Add particular</Button>} />
      <p className="mb-4 text-sm text-ink/70">Jo cheezein aap bechte hain — chain, ring, bangles, silver, job work. Bill banate waqt dropdown se chuniye; HSN, GST aur aaj ka rate apne aap bhar jayega.</p>
      {editing === "new" && <div className="mb-5"><ItemForm rates={rates} onSaved={done} onCancel={() => setEditing(null)} /></div>}
      {items.length > 6 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search particulars" className="mb-3 min-h-12 w-full rounded-xl border border-gold-400/60 bg-white px-3" />}
      {shown.length ? (
        <ul className="stagger space-y-2">
          {shown.map((i) =>
            editing === i.id ? (
              <li key={i.id}><ItemForm item={i} rates={rates} onSaved={done} onCancel={() => setEditing(null)} /></li>
            ) : (
              <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold-400/40 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{i.name} {i.purity && <span className="font-normal text-ink/60">· {i.purity}</span>}</div>
                  <div className="text-sm text-ink/60">
                    HSN {i.hsn ?? "—"} · GST {i.gst_rate / 1000}% · per {i.unit}
                    {i.metal ? ` · uses today's ${i.metal} rate` : ""}
                    {i.making_mode && ` · making ${i.making_mode === "percent" ? `${(i.making_value ?? 0) / 1000}%` : fmtINR(i.making_value ?? 0) + (i.making_mode === "per_gram" ? "/g" : "")}`}
                  </div>
                </div>
                {rateOf(i) != null && <span className="money text-sm font-semibold">{fmtINR(rateOf(i)!)}</span>}
                {!readOnly(me) && (
                  <span className="flex gap-1">
                    <button className="rounded-lg px-3 py-2 text-sm text-gold-600 hover:bg-gold-100" onClick={() => setEditing(i.id)}>Edit</button>
                    <button className="rounded-lg px-3 py-2 text-sm text-maroon-700 hover:bg-maroon-700/10" onClick={() => remove(i)}>Delete</button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      ) : (
        <Empty>No particulars yet. Add what you sell — e.g. “22K Gold Jewellery”, HSN 7113, 3%.</Empty>
      )}
    </>
  );
}
