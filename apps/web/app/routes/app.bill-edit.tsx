import type { Business, Computed, InvoiceDetail, InvoiceInput, Item, LineInput, MakingMode, MetalRate, Page, Party, Settings, State } from "@hisab/api";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Check, Field, Select } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { gstinProblem } from "../lib/gstin";
import { fmtINR, parseScaled, plain } from "../lib/money";
import type { Route } from "./+types/app.bill-edit";

type Data = { biz: Business; settings: Settings; rates: MetalRate[]; items: Item[]; states: State[]; draft: InvoiceDetail | null };

export async function clientLoader({ params }: Route.ClientLoaderArgs): Promise<Data> {
  const [biz, settings, rates, items, states, draft] = await Promise.all([
    api<Business>("/business"),
    api<Settings>("/settings"),
    api<{ items: MetalRate[] }>("/metal-rates"),
    api<{ items: Item[] }>("/items"),
    api<{ items: State[] }>("/states"),
    params.id ? api<InvoiceDetail>(`/invoices/${params.id}`) : Promise.resolve(null),
  ]);
  return { biz, settings, rates: rates.items, items: items.items, states: states.items, draft };
}

// ── form state: strings as typed, converted to API units on the way out ──

type LineForm = {
  kind: "goods" | "charge";
  item_id: string | null;
  description: string;
  hsn: string;
  purity: string;
  huid: string;
  unit: LineInput["unit"];
  gross: string;
  qty: string;
  rate: string;
  makingMode: MakingMode;
  making: string;
  other: string;
  gst: string;
  target: string;
};
type OGForm = { description: string; purity: string; gross: string; less: string; rate: string };
type Buyer = { name: string; address: string; state: string; gstin: string; phone: string; pan: string };
type BillForm = {
  date: string;
  mode: "forward" | "reverse";
  party_id: string | null;
  buyer: Buyer;
  lines: LineForm[];
  og: OGForm[] | null;
  sellerKind: "individual" | "business";
  goodsMovement: boolean;
  pos: string;
  notes: string;
};

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const makingDec = (m: MakingMode) => (m === "percent" ? 3 : 2);

function newLine(s: Settings, item?: Item, rates: MetalRate[] = []): LineForm {
  const rate = item?.metal ? rates.find((r) => r.metal === item.metal)?.rate_paise : undefined;
  const charge = item?.unit === "nos" && item.metal == null && item.hsn?.startsWith("99");
  return {
    kind: charge ? "charge" : "goods",
    item_id: item?.id ?? null,
    description: item?.name ?? "",
    hsn: item?.hsn ?? (charge ? "" : "7113"),
    purity: item?.purity ?? "",
    huid: "",
    unit: item?.unit ?? "g",
    gross: "",
    qty: "",
    rate: plain(rate, 2),
    makingMode: s.default_making_mode,
    making: s.default_making_value ? plain(s.default_making_value, makingDec(s.default_making_mode)) : "",
    other: "",
    gst: plain(item?.gst_rate ?? s.default_gst_rate, 3),
    target: "",
  };
}

function fromInput(i: InvoiceInput): BillForm {
  return {
    date: i.invoice_date,
    mode: i.calc_mode,
    party_id: i.party_id,
    buyer: { name: i.buyer.name, address: i.buyer.address, state: i.buyer.state_code ?? "", gstin: i.buyer.gstin ?? "", phone: i.buyer.phone ?? "", pan: i.buyer.pan ?? "" },
    lines: i.lines.map((l) => ({
      kind: l.kind, item_id: l.item_id, description: l.description, hsn: l.hsn ?? "", purity: l.purity ?? "", huid: l.huid ?? "", unit: l.unit,
      gross: plain(l.gross_weight_mg, 3), qty: l.qty_milli ? plain(l.qty_milli, 3) : "", rate: l.rate_paise ? plain(l.rate_paise, 2) : "",
      makingMode: l.making?.mode ?? "per_gram", making: l.making ? plain(l.making.value, makingDec(l.making.mode)) : "",
      other: l.other_paise ? plain(l.other_paise, 2) : "", gst: plain(l.gst_rate, 3), target: plain(l.target_total_paise, 2),
    })),
    og: i.old_gold ? i.old_gold.lines.map((l) => ({ description: l.description, purity: l.purity ?? "", gross: plain(l.gross_weight_mg, 3), less: plain(l.less_weight_mg, 3), rate: plain(l.rate_paise, 2) })) : null,
    sellerKind: i.old_gold?.seller_kind ?? "individual",
    goodsMovement: i.goods_movement,
    pos: i.place_of_supply_override ?? "",
    notes: i.notes ?? "",
  };
}

// toInput converts the form; unparseable numbers are reported with the server's field keys.
function toInput(f: BillForm): { input: InvoiceInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const n = (v: string, dec: number, key: string, required = false): number => {
    if (v.trim() === "") {
      if (required) errors[key] = "required";
      return 0;
    }
    const x = parseScaled(v, dec);
    if (x == null) errors[key] = "enter a number";
    return x ?? 0;
  };
  const opt = (v: string) => v.trim() || null;
  const lines: LineInput[] = f.lines.map((l, i) => {
    const k = `lines[${i}].`;
    const md = makingDec(l.makingMode);
    const making = l.kind === "goods" && l.making.trim() ? { mode: l.makingMode, value: n(l.making, md, k + "making") } : null;
    return {
      kind: l.kind, item_id: l.item_id, description: l.description, hsn: opt(l.hsn), purity: opt(l.purity), huid: opt(l.huid), unit: l.kind === "charge" ? "nos" : l.unit,
      gross_weight_mg: l.gross.trim() ? n(l.gross, 3, k + "gross_weight_mg") : null,
      qty_milli: l.kind === "charge" ? 0 : n(l.qty, 3, k + "qty_milli"),
      rate_paise: l.kind === "charge" ? 0 : n(l.rate, 2, k + "rate_paise"),
      making, other_paise: n(l.other, 2, k + "other_paise"), other_label: null,
      gst_rate: n(l.gst, 3, k + "gst_rate"),
      target_total_paise: f.mode === "reverse" ? n(l.target, 2, k + "target_total_paise") || null : null,
    };
  });
  const og = f.og?.length
    ? {
        seller_kind: f.sellerKind,
        lines: f.og.map((l, i) => ({ description: l.description, purity: opt(l.purity), gross_weight_mg: n(l.gross, 3, `old_gold.lines[${i}].gross_weight_mg`),
          less_weight_mg: n(l.less, 3, `old_gold.lines[${i}].less_weight_mg`), rate_paise: n(l.rate, 2, `old_gold.lines[${i}].rate_paise`) })),
      }
    : null;
  const b = f.buyer;
  return {
    input: {
      invoice_date: f.date, calc_mode: f.mode, party_id: f.party_id,
      buyer: { name: b.name, address: b.address, state_code: opt(b.state), gstin: opt(b.gstin), phone: opt(b.phone), pan: opt(b.pan) },
      goods_movement: f.goodsMovement, place_of_supply_override: opt(f.pos), lines, old_gold: og, notes: f.notes,
    },
    errors,
  };
}

// ── page ─────────────────────────────────────────────────────────────────

export default function BillEdit({ loaderData: d }: Route.ComponentProps) {
  const navigate = useNavigate();
  const editing = d.draft?.invoice;
  const [f, setF] = useState<BillForm>(() => {
    if (editing) return fromInput(editing.input);
    let mode: BillForm["mode"] = "forward";
    try {
      if (localStorage.getItem("hisab.calcMode") === "reverse") mode = "reverse";
    } catch {}
    return { date: today(), mode, party_id: null, buyer: { name: "", address: "", state: d.biz.state_code ?? "", gstin: "", phone: "", pan: "" },
      lines: [newLine(d.settings)], og: null, sellerKind: "individual", goodsMovement: false, pos: "", notes: "" };
  });
  const [computed, setComputed] = useState<Computed | null>(d.draft?.computed ?? null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { input, errors: localErr } = toInput(f);
  const key = JSON.stringify(input);

  // Live totals from the one tax engine (server), debounced.
  useEffect(() => {
    if (Object.keys(localErr).length) {
      setErr(localErr);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setComputed(await api<Computed>("/invoices/compute", { method: "POST", body: { input } }));
        setErr({});
        setMsg(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 422) {
          setErr(e.fields);
          setMsg(Object.keys(e.fields).length ? null : e.message);
        }
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (patch: Partial<BillForm>) => setF((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<LineForm>) => setF((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const setOG = (i: number, patch: Partial<OGForm>) => setF((x) => ({ ...x, og: x.og!.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const e = (k: string) => err[k];

  function addItem(item?: Item) {
    const line = newLine(d.settings, item, d.rates);
    setF((x) => {
      const first = x.lines[0];
      const blank = x.lines.length === 1 && first && !first.description && !first.qty && !first.target;
      return { ...x, lines: blank ? [line] : [...x.lines, line] };
    });
  }

  async function save(issue: boolean) {
    if (Object.keys(localErr).length) return;
    setBusy(true);
    setMsg(null);
    try {
      let id = editing?.id;
      if (issue && !computed) throw new ApiError(422, "x", "Totals are not ready yet");
      if (id) {
        await api(`/invoices/${id}`, { method: "PUT", body: { input } });
        if (issue) await api(`/invoices/${id}/issue`, { method: "POST", body: { expected_grand_total_paise: computed!.grand_total_paise } });
      } else {
        const r = await api<{ invoice: { id: string } }>("/invoices", { method: "POST", body: { input, issue, expected_grand_total_paise: issue ? computed!.grand_total_paise : undefined } });
        id = r.invoice.id;
      }
      navigate(issue ? `/app/bills/${id}?new=1` : "/app/bills?status=draft");
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.fields);
        setMsg(e.code === "totals_mismatch" ? "Totals were refreshed — please check and press Save again." : e.message);
        if (e.code === "totals_mismatch") setComputed(null);
      } else setMsg("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const reverse = f.mode === "reverse";
  const c = computed;
  const posName = c && d.states.find((s) => s.code === c.place_of_supply)?.name;
  const taxInvoice = d.biz.registration_type === "regular";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold">{editing ? "Edit draft" : "New bill"}</h1>
          <div className="inline-flex rounded-xl border border-gold-400 p-1" role="radiogroup" aria-label="Calculation mode">
            {(["forward", "reverse"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={f.mode === m}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${f.mode === m ? "bg-gold-600 text-white" : ""}`}
                onClick={() => { set({ mode: m }); try { localStorage.setItem("hisab.calcMode", m); } catch {} }}>
                {m === "forward" ? "Rate se" : "Total se"}
              </button>
            ))}
          </div>
        </div>

        <BuyerSection d={d} f={f} set={set} e={e} />

        {d.items.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Quick add item">
            {d.items.map((it) => (
              <button key={it.id} type="button" onClick={() => addItem(it)} className="min-h-10 rounded-full border border-gold-400 bg-white px-3 text-sm hover:bg-gold-100">
                + {it.name}
              </button>
            ))}
          </div>
        )}

        {f.lines.map((l, i) => (
          <fieldset key={i} className="space-y-3 rounded-2xl border border-gold-400/40 bg-white p-4">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-semibold">
                Item {i + 1} {l.kind === "charge" && <span className="font-normal text-ink/60">· charge (job work / repair)</span>}
              </legend>
              {f.lines.length > 1 && <button type="button" className="text-sm text-maroon-700" onClick={() => set({ lines: f.lines.filter((_, j) => j !== i) })}>Remove</button>}
            </div>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-4"><Field label="Description" value={l.description} onChange={(x) => setLine(i, { description: x.target.value })} error={e(`lines[${i}].description`)} /></div>
              <div className="col-span-2"><Field label={l.kind === "charge" ? "SAC" : "HSN"} value={l.hsn} inputMode="numeric" maxLength={8} onChange={(x) => setLine(i, { hsn: x.target.value.replace(/\D/g, "") })} error={e(`lines[${i}].hsn`)} /></div>
              {l.kind === "goods" ? (
                <>
                  <div className="col-span-3 sm:col-span-2"><Field label={l.unit === "g" ? "Net wt (g)" : `Qty (${l.unit})`} value={l.qty} inputMode="decimal" onChange={(x) => setLine(i, { qty: x.target.value })} error={e(`lines[${i}].qty_milli`)} /></div>
                  <div className="col-span-3 sm:col-span-2"><Field label="Gross wt (g)" value={l.gross} inputMode="decimal" onChange={(x) => setLine(i, { gross: x.target.value })} error={e(`lines[${i}].gross_weight_mg`)} /></div>
                  {reverse ? (
                    <div className="col-span-6 sm:col-span-2"><Field label="Line total incl. GST" prefix="₹" value={l.target} inputMode="decimal" onChange={(x) => setLine(i, { target: x.target.value })} error={e(`lines[${i}].target_total_paise`)} /></div>
                  ) : (
                    <div className="col-span-6 sm:col-span-2"><Field label={`Rate (₹/${l.unit})`} prefix="₹" value={l.rate} inputMode="decimal" onChange={(x) => setLine(i, { rate: x.target.value })} error={e(`lines[${i}].rate_paise`)} /></div>
                  )}
                  {!reverse && (
                    <>
                      <Select className="col-span-3 sm:col-span-2" label="Making" value={l.makingMode} onChange={(x) => setLine(i, { makingMode: x.target.value as MakingMode })}>
                        <option value="per_gram">₹ per gram</option>
                        <option value="flat">Flat ₹</option>
                        <option value="percent">% of metal</option>
                      </Select>
                      <div className="col-span-3 sm:col-span-2"><Field label="Making value" prefix={l.makingMode === "percent" ? "%" : "₹"} value={l.making} inputMode="decimal" onChange={(x) => setLine(i, { making: x.target.value })} error={e(`lines[${i}].making`)} /></div>
                    </>
                  )}
                  <div className="col-span-3 sm:col-span-1"><Field label="GST" prefix="%" value={l.gst} inputMode="decimal" onChange={(x) => setLine(i, { gst: x.target.value })} error={e(`lines[${i}].gst_rate`)} /></div>
                  <div className="col-span-3 sm:col-span-1"><Field label="Purity" value={l.purity} onChange={(x) => setLine(i, { purity: x.target.value })} /></div>
                </>
              ) : (
                <>
                  {reverse ? (
                    <div className="col-span-4"><Field label="Total incl. GST" prefix="₹" value={l.target} inputMode="decimal" onChange={(x) => setLine(i, { target: x.target.value })} error={e(`lines[${i}].target_total_paise`)} /></div>
                  ) : (
                    <div className="col-span-4"><Field label="Amount" prefix="₹" value={l.other} inputMode="decimal" onChange={(x) => setLine(i, { other: x.target.value })} error={e(`lines[${i}].other_paise`)} /></div>
                  )}
                  <div className="col-span-2"><Field label="GST" prefix="%" value={l.gst} inputMode="decimal" onChange={(x) => setLine(i, { gst: x.target.value })} error={e(`lines[${i}].gst_rate`)} /></div>
                </>
              )}
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-gold-600">More (HUID, stone / other charges)</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="HUID" value={l.huid} maxLength={6} onChange={(x) => setLine(i, { huid: x.target.value.toUpperCase() })} />
                {l.kind === "goods" && !reverse && <Field label="Other charges (stones etc.)" prefix="₹" value={l.other} inputMode="decimal" onChange={(x) => setLine(i, { other: x.target.value })} error={e(`lines[${i}].other_paise`)} />}
              </div>
            </details>
            {c?.lines[i] && (
              <p className="money text-right text-sm text-ink/70">
                {c.lines[i].rate_derived && <>Rate {fmtINR(c.lines[i].rate_paise)}/g · </>}
                Taxable <b className="text-ink">{fmtINR(c.lines[i].taxable_paise)}</b>
              </p>
            )}
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-12 flex-1 rounded-xl border border-dashed border-gold-600 font-semibold text-gold-600" onClick={() => addItem()}>+ Add item</button>
          <button type="button" className="min-h-12 rounded-xl border border-dashed border-gold-400 px-4 text-sm text-ink/70"
            onClick={() => set({ lines: [...f.lines, { ...newLine(d.settings), kind: "charge", hsn: "9988", gst: "5", description: "Job work charges", unit: "nos" }] })}>
            + Charge line
          </button>
        </div>

        <fieldset className="rounded-2xl border border-gold-400/40 bg-white p-4">
          <Check label={<b>Purana sona lein (old gold exchange)</b>} checked={!!f.og} onChange={(x) => set({ og: x.target.checked ? [{ description: "Old gold ornaments", purity: "22K", gross: "", less: "", rate: "" }] : null })} />
          {f.og && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2 text-sm">
                {(["individual", "business"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2"><input type="radio" checked={f.sellerKind === k} onChange={() => set({ sellerKind: k })} className="accent-gold-600" />{k === "individual" ? "Customer's own jewellery" : "Unregistered dealer"}</label>
                ))}
              </div>
              {f.og.map((l, i) => (
                <div key={i} className="grid grid-cols-6 gap-3 border-t border-gold-400/30 pt-3">
                  <div className="col-span-4"><Field label="Description" value={l.description} onChange={(x) => setOG(i, { description: x.target.value })} /></div>
                  <div className="col-span-2"><Field label="Purity" value={l.purity} onChange={(x) => setOG(i, { purity: x.target.value })} /></div>
                  <div className="col-span-2"><Field label="Gross (g)" value={l.gross} inputMode="decimal" onChange={(x) => setOG(i, { gross: x.target.value })} error={e(`old_gold.lines[${i}].gross_weight_mg`)} /></div>
                  <div className="col-span-2"><Field label="Less (g)" value={l.less} inputMode="decimal" onChange={(x) => setOG(i, { less: x.target.value })} /></div>
                  <div className="col-span-2"><Field label="Rate ₹/g" value={l.rate} inputMode="decimal" onChange={(x) => setOG(i, { rate: x.target.value })} error={e(`old_gold.lines[${i}].rate_paise`)} /></div>
                  {c?.old_gold?.lines[i] && <p className="money col-span-6 text-right text-sm">Net {plain(c.old_gold.lines[i].net_weight_mg, 3)} g · <b>{fmtINR(c.old_gold.lines[i].amount_paise)}</b></p>}
                </div>
              ))}
              <button type="button" className="text-sm text-gold-600 underline" onClick={() => set({ og: [...f.og!, { description: "Old gold", purity: "", gross: "", less: "", rate: "" }] })}>+ Another piece</button>
            </div>
          )}
        </fieldset>

        <details className="rounded-2xl border border-gold-400/40 bg-white p-4">
          <summary className="cursor-pointer font-semibold">More options</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Bill date" type="date" value={f.date} onChange={(x) => set({ date: x.target.value })} error={e("invoice_date")} />
            <Select label="Place of supply (override)" value={f.pos} onChange={(x) => set({ pos: x.target.value })}>
              <option value="">Automatic</option>
              {d.states.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.code}</option>)}
            </Select>
            {f.buyer.gstin && <Check label="Goods are transported to the buyer" checked={f.goodsMovement} onChange={(x) => set({ goodsMovement: x.target.checked })} />}
            <Field label="Notes on bill" value={f.notes} onChange={(x) => set({ notes: x.target.value })} />
          </div>
        </details>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="fixed inset-x-0 bottom-14 z-10 border-t border-gold-400/40 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,.06)] md:bottom-0 lg:static lg:rounded-2xl lg:border lg:shadow-sm">
          {c ? (
            <>
              <details className="text-sm lg:open" open={typeof window !== "undefined" && window.innerWidth >= 1024}>
                <summary className="cursor-pointer text-ink/70">
                  {taxInvoice ? `${posName ?? c.place_of_supply} (${c.place_of_supply}) · ${c.supply_type === "intra" ? `CGST + ${c.sgst_label}` : "IGST"}` : "Bill of Supply · no GST"}
                </summary>
                <dl className="money mt-2 grid grid-cols-2 gap-y-1">
                  <dt>Taxable</dt><dd className="text-right">{fmtINR(c.taxable_paise)}</dd>
                  {c.cgst_paise > 0 && <><dt>CGST</dt><dd className="text-right">{fmtINR(c.cgst_paise)}</dd><dt>{c.sgst_label}</dt><dd className="text-right">{fmtINR(c.sgst_paise)}</dd></>}
                  {c.igst_paise > 0 && <><dt>IGST</dt><dd className="text-right">{fmtINR(c.igst_paise)}</dd></>}
                  {c.round_off_paise !== 0 && <><dt>Round off</dt><dd className="text-right">{fmtINR(c.round_off_paise)}</dd></>}
                  <dt className="font-semibold">Bill total</dt><dd className="text-right font-semibold">{fmtINR(c.grand_total_paise)}</dd>
                  {c.old_gold && <><dt>Less old gold</dt><dd className="text-right">−{fmtINR(c.old_gold.total_paise)}</dd></>}
                </dl>
                <p className="mt-2 text-xs text-ink/60">{c.words.net_payable}</p>
              </details>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-sm">{c.old_gold ? "Net payable" : "Total"}</span>
                <span className="money text-2xl font-bold">{fmtINR(c.net_payable_paise)}</span>
              </div>
              {c.warnings.map((w) => <p key={w.code} className="mt-1 rounded-lg bg-gold-100 px-2 py-1 text-xs">⚠ {w.message}</p>)}
            </>
          ) : (
            <p className="text-sm text-ink/60">{msg ?? "Enter weight and rate to see the total."}</p>
          )}
          {msg && c && <p className="mt-2 text-sm text-maroon-700" role="alert">{msg}</p>}
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => save(false)}>Draft</Button>
            <Button type="button" disabled={busy || !c} onClick={() => save(true)}>{busy ? "Saving…" : "Save & issue"}</Button>
          </div>
        </div>
        <div className="h-56 lg:hidden" aria-hidden />
      </aside>
    </div>
  );
}

// BuyerSection: search saved customers, or type a walk-in buyer.
function BuyerSection({ d, f, set, e }: { d: Data; f: BillForm; set: (p: Partial<BillForm>) => void; e: (k: string) => string | undefined }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Party[]>([]);
  const [open, setOpen] = useState(!!(f.buyer.address || f.buyer.gstin));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const b = f.buyer;
  const setB = (p: Partial<Buyer>) => set({ buyer: { ...b, ...p } });
  function search(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    if (!v.trim()) return setHits([]);
    timer.current = setTimeout(async () => setHits((await api<Page<Party>>(`/parties?q=${encodeURIComponent(v)}`)).items.slice(0, 6)), 250);
  }
  function pick(p: Party) {
    set({ party_id: p.id, buyer: { name: p.name, address: p.bill_address, state: p.bill_state_code ?? d.biz.state_code ?? "", gstin: p.gstin ?? "", phone: p.phone ?? "", pan: p.pan ?? "" } });
    setQ("");
    setHits([]);
  }
  return (
    <fieldset className="space-y-3 rounded-2xl border border-gold-400/40 bg-white p-4">
      <legend className="text-sm font-semibold">Customer</legend>
      {f.party_id ? (
        <div className="flex items-center justify-between rounded-xl bg-gold-100 px-3 py-2">
          <span><b>{b.name}</b> {b.phone && <span className="text-sm text-ink/60">· {b.phone}</span>}</span>
          <button type="button" className="text-sm text-maroon-700" onClick={() => set({ party_id: null, buyer: { name: "", address: "", state: d.biz.state_code ?? "", gstin: "", phone: "", pan: "" } })}>Change</button>
        </div>
      ) : (
        <div className="relative">
          <Field label="Search saved customer (name / phone)" value={q} onChange={(x) => search(x.target.value)} placeholder="Type to search… or fill walk-in details below" />
          {hits.length > 0 && (
            <ul className="absolute inset-x-0 z-10 mt-1 overflow-hidden rounded-xl border border-gold-400/50 bg-white shadow-lg">
              {hits.map((p) => (
                <li key={p.id}><button type="button" className="w-full px-3 py-3 text-left hover:bg-gold-100" onClick={() => pick(p)}>{p.name} <span className="text-sm text-ink/60">{p.phone}</span></button></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!f.party_id && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name (walk-in)" value={b.name} onChange={(x) => setB({ name: x.target.value })} error={e("buyer.name")} />
          <Field label="Phone" value={b.phone} inputMode="tel" onChange={(x) => setB({ phone: x.target.value })} />
        </div>
      )}
      <button type="button" className="text-sm text-gold-600 underline" onClick={() => setOpen(!open)}>{open ? "Hide" : "Address, state, GSTIN, PAN"}</button>
      {open && (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="Address" value={b.address} onChange={(x) => setB({ address: x.target.value })} error={e("buyer.address")} /></div>
          <Select label="State" value={b.state} onChange={(x) => setB({ state: x.target.value })} error={e("buyer.state_code")}>
            <option value="">—</option>
            {d.states.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.code}</option>)}
          </Select>
          <Field label="GSTIN" value={b.gstin} maxLength={15} onChange={(x) => setB({ gstin: x.target.value.toUpperCase() })} error={e("buyer.gstin") ?? gstinProblem(b.gstin)} />
          <Field label="PAN" value={b.pan} maxLength={10} onChange={(x) => setB({ pan: x.target.value.toUpperCase() })} error={e("buyer.pan")} />
        </div>
      )}
      {(e("buyer.address") || e("buyer.state_code")) && !open && <p className="text-sm text-maroon-700">Address and state are needed for this bill — tap above.</p>}
    </fieldset>
  );
}
