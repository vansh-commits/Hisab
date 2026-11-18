import type { Item, MakingMode, MetalRate } from "@hisab/api";
import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { parseScaled, plain } from "../lib/money";
import { Button, Field, Select } from "./ui";

const UNITS: Item["unit"][] = ["g", "pcs", "ct", "pair", "set", "nos"];

// ItemForm creates or edits one particular (items master). Used on the Particulars page and inline on a bill.
export function ItemForm({ item, rates, onSaved, onCancel }: { item?: Item; rates: MetalRate[]; onSaved: (it: Item) => void; onCancel?: () => void }) {
  const [v, setV] = useState({
    name: item?.name ?? "",
    hsn: item?.hsn ?? "7113",
    unit: item?.unit ?? "g",
    purity: item?.purity ?? "",
    gst: plain(item?.gst_rate ?? 3000, 3),
    metal: item?.metal ?? "",
    makingMode: (item?.making_mode ?? "") as MakingMode | "",
    making: item?.making_value != null ? plain(item.making_value, item.making_mode === "percent" ? 3 : 2) : "",
    rate: plain(item?.default_rate_paise, 2),
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });

  async function save() {
    const e: Record<string, string> = {};
    const gst = parseScaled(v.gst, 3);
    if (gst == null) e.gst_rate = "Enter a rate like 3";
    const making = v.makingMode && v.making.trim() ? parseScaled(v.making, v.makingMode === "percent" ? 3 : 2) : null;
    if (v.makingMode && v.making.trim() && making == null) e.making_value = "Enter a number";
    const rate = v.rate.trim() ? parseScaled(v.rate, 2) : null;
    if (v.rate.trim() && rate == null) e.default_rate_paise = "Enter a number";
    if (Object.keys(e).length) return setErr(e);
    const body = {
      name: v.name, hsn: v.hsn.trim() || null, unit: v.unit, purity: v.purity.trim() || null, gst_rate: gst,
      metal: v.metal || null, making_mode: making != null ? v.makingMode : null, making_value: making, default_rate_paise: v.metal ? null : rate,
    };
    setBusy(true);
    try {
      const saved = item
        ? await api<Item>(`/items/${item.id}`, { method: "PATCH", body })
        : await api<Item>("/items", { method: "POST", body });
      onSaved(saved);
    } catch (x) {
      if (x instanceof ApiError) setErr({ ...x.fields, _: x.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-6 gap-3 rounded-2xl border border-gold-400/60 bg-white p-4">
      <div className="col-span-6 sm:col-span-4"><Field label="Particular name" value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. 22K Gold Chain" error={err.name} autoFocus /></div>
      <div className="col-span-3 sm:col-span-2"><Field label="HSN / SAC" value={v.hsn} inputMode="numeric" maxLength={8} onChange={(e) => set({ hsn: e.target.value.replace(/\D/g, "") })} error={err.hsn} /></div>
      <Select className="col-span-3 sm:col-span-2" label="Unit" value={v.unit} onChange={(e) => set({ unit: e.target.value as Item["unit"] })}>
        {UNITS.map((u) => <option key={u} value={u}>{u === "g" ? "grams (g)" : u}</option>)}
      </Select>
      <div className="col-span-3 sm:col-span-2"><Field label="Purity" value={v.purity} onChange={(e) => set({ purity: e.target.value })} placeholder="22K / 916" /></div>
      <div className="col-span-3 sm:col-span-2"><Field label="GST" prefix="%" inputMode="decimal" value={v.gst} onChange={(e) => set({ gst: e.target.value })} error={err.gst_rate} /></div>
      <Select className="col-span-6 sm:col-span-3" label="Rate comes from" value={v.metal} onChange={(e) => set({ metal: e.target.value })}>
        <option value="">Fixed price (enter below)</option>
        {rates.map((r) => <option key={r.metal} value={r.metal}>Today's {r.metal} rate</option>)}
      </Select>
      {!v.metal && <div className="col-span-6 sm:col-span-3"><Field label={`Price per ${v.unit}`} prefix="₹" inputMode="decimal" value={v.rate} onChange={(e) => set({ rate: e.target.value })} error={err.default_rate_paise} hint="Optional" /></div>}
      <Select className="col-span-3" label="Default making" value={v.makingMode} onChange={(e) => set({ makingMode: e.target.value as MakingMode | "" })}>
        <option value="">Shop default</option>
        <option value="per_gram">₹ per gram</option>
        <option value="flat">Flat ₹</option>
        <option value="percent">% of metal</option>
      </Select>
      {v.makingMode && <div className="col-span-3"><Field label="Making value" prefix={v.makingMode === "percent" ? "%" : "₹"} inputMode="decimal" value={v.making} onChange={(e) => set({ making: e.target.value })} error={err.making_value} /></div>}
      {err._ && <p className="col-span-6 text-sm text-maroon-700">{err._}</p>}
      <div className="col-span-6 flex justify-end gap-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : item ? "Save changes" : "Add particular"}</Button>
      </div>
    </div>
  );
}
