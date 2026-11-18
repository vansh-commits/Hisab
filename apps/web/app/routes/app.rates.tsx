import type { MetalRate } from "@hisab/api";
import { useState } from "react";
import { useRevalidator } from "react-router";
import { Button, Field, PageTitle } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { plain, toPaise } from "../lib/money";
import type { Route } from "./+types/app.rates";

export async function clientLoader() {
  return (await api<{ items: MetalRate[] }>("/metal-rates")).items;
}

const BOARD = ["24K", "22K", "18K", "Silver"];

export default function Rates({ loaderData: rates }: Route.ComponentProps) {
  const { revalidate } = useRevalidator();
  const [rows, setRows] = useState(() => {
    const names = [...BOARD, ...rates.map((r) => r.metal).filter((m) => !BOARD.includes(m))];
    return names.map((m) => ({ metal: m, rate: plain(rates.find((r) => r.metal === m)?.rate_paise, 2) }));
  });
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    const body: MetalRate[] = [];
    for (const r of rows) {
      if (!r.metal.trim() || !r.rate.trim()) continue;
      const p = toPaise(r.rate);
      if (!p) return setMsg(`Check the rate for ${r.metal}`);
      body.push({ metal: r.metal.trim(), rate_paise: p });
    }
    try {
      await api("/metal-rates", { method: "PUT", body });
      setMsg("Saved ✓ — new bills will use these rates.");
      revalidate();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Could not save");
    }
  }
  const updated = rates.map((r) => r.updated_at).filter(Boolean).sort().at(-1);
  return (
    <>
      <PageTitle title="Today's rates" />
      <p className="mb-4 text-sm text-ink/70">Per gram. Naye bill mein item chunne par ye rate apne aap aa jayega.{updated && ` Last updated ${new Date(updated).toLocaleString("en-IN")}.`}</p>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gold-400/40 bg-white p-4">
        {rows.map((r, i) => (
          BOARD.includes(r.metal) || rates.some((x) => x.metal === r.metal) ? (
            <Field key={i} label={r.metal} prefix="₹" inputMode="decimal" className="money" value={r.rate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
          ) : (
            <div key={i} className="col-span-2 grid grid-cols-2 gap-3">
              <Field label="Name" value={r.metal} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, metal: e.target.value } : x)))} />
              <Field label="Rate" prefix="₹" inputMode="decimal" value={r.rate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
            </div>
          )
        ))}
        <button className="col-span-2 text-left text-sm text-gold-600 underline" onClick={() => setRows([...rows, { metal: "", rate: "" }])}>+ Another metal / purity</button>
      </div>
      {msg && <p className="mt-3 text-sm" role="status">{msg}</p>}
      <Button className="mt-4 w-full" onClick={save}>Save rates</Button>
    </>
  );
}
