import type { Business, Item, MakingMode, Me, MetalRate, Party, Settings, State } from "@hisab/api";
import { createContext, use, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useRevalidator } from "react-router";
import { Check, Field, Select, TextArea } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { gstinProblem } from "../lib/gstin";
import { docNumber, fmtINR, plain, toMilliPct, toPaise } from "../lib/money";

export type Data = { biz: Business; settings: Settings; rates: MetalRate[]; states: State[]; parties: Party[]; items: Item[] };
export type StepProps = {
  d: Data;
  me: Me;
  err: Record<string, string>;
  busy: boolean;
  save: (fn?: () => Promise<unknown>) => void; // save this step, then go to the next one
  goTo: (step: number) => void;
};

// ── small building blocks ────────────────────────────────────────────────


function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      {sub && <p className="mt-2 text-ink/70">{sub}</p>}
    </header>
  );
}

// StepForm is the form the sticky "Next" button submits (form="step-form"); the shell provides save.
export const SaveCtx = createContext<StepProps["save"]>(() => {});

function StepForm({ onSave, children }: { onSave?: (f: FormData) => Promise<unknown>; children?: ReactNode }) {
  const save = use(SaveCtx);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save(onSave && (() => onSave(f)));
  }
  return (
    <form id="step-form" onSubmit={submit} className="space-y-4" noValidate>
      {children}
    </form>
  );
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const strOrNull = (f: FormData, k: string) => str(f, k) || null;
const patchBiz = (body: Partial<Business>) => api("/business", { method: "PATCH", body });
const patchSettings = (body: Partial<Settings>) => api("/settings", { method: "PATCH", body });
const fieldErr = (msg: string, fields: Record<string, string>) => Promise.reject(new ApiError(422, "validation_failed", msg, fields));

function StateSelect({ states, name, value, disabled, error, label = "State" }: { states: State[]; name: string; value?: string | null; disabled?: boolean; error?: string; label?: string }) {
  return (
    <Select label={label} name={name} defaultValue={value ?? ""} disabled={disabled} error={error}>
      <option value="">Select state…</option>
      {states.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name} · {s.code}
        </option>
      ))}
    </Select>
  );
}

// ── steps ────────────────────────────────────────────────────────────────

function Welcome({ me }: StepProps) {
  return (
    <StepForm>
      <div className="rounded-2xl border border-gold-400/40 bg-white p-6 text-center shadow-sm">
        <div className="text-5xl" aria-hidden>✨</div>
        <h1 className="mt-3 font-display text-4xl font-semibold">Namaste {me.user.name.split(" ")[0]}!</h1>
        <p className="mt-3 text-ink/70">5 minute mein setup ho jayega. Har step apne aap save hota hai — beech mein chhod kar baad mein wapas aa sakte hain.</p>
      </div>
    </StepForm>
  );
}

const REG: { v: Business["registration_type"]; t: string; s: string }[] = [
  { v: "regular", t: "Regular GST", s: "You charge GST and issue Tax Invoices (CGST/SGST or IGST)." },
  { v: "composition", t: "Composition scheme", s: "You pay tax at a flat rate and issue a Bill of Supply, no GST on the bill." },
  { v: "unregistered", t: "Not registered", s: "No GSTIN yet. You issue a Bill of Supply." },
];

function GstStatus({ d, err }: StepProps) {
  return (
    <StepForm onSave={(f) => (f.get("registration_type") ? patchBiz({ registration_type: str(f, "registration_type") as Business["registration_type"] }) : fieldErr("Please choose one", {}))}>
      <Heading title="GST status" sub="Isse decide hota hai ki bill Tax Invoice banega ya Bill of Supply." />
      {REG.map((r) => (
        <label key={r.v} className="flex cursor-pointer gap-3 rounded-xl border border-gold-400/50 bg-white p-4 has-checked:border-gold-600 has-checked:bg-gold-100">
          <input type="radio" name="registration_type" value={r.v!} defaultChecked={d.biz.registration_type === r.v} className="mt-1 size-5 accent-gold-600" />
          <span>
            <b>{r.t}</b>
            <span className="block text-sm text-ink/70">{r.s}</span>
          </span>
        </label>
      ))}
      {err.registration_type && <p className="text-maroon-700">{err.registration_type}</p>}
    </StepForm>
  );
}

function Identity({ d, err }: StepProps) {
  const registered = d.biz.registration_type !== "unregistered";
  const [gstin, setGstin] = useState(d.biz.gstin ?? d.biz.applicant_gstin ?? "");
  const g = gstin.trim().toUpperCase();
  const state = g.length >= 2 ? d.states.find((s) => s.code === g.slice(0, 2)) : undefined;
  const ok = g.length === 15 && !gstinProblem(g);
  return (
    <StepForm
      onSave={(f) =>
        patchBiz({
          ...(registered ? { gstin: g || null } : {}),
          legal_name: str(f, "legal_name"),
          trade_name: strOrNull(f, "trade_name"),
          udyam_no: strOrNull(f, "udyam_no"),
        })
      }
    >
      <Heading title="Business identity" sub={registered ? "GSTIN pehle daaliye — state apne aap aa jayega." : undefined} />
      {registered && (
        <Field
          label="GSTIN"
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          maxLength={15}
          autoCapitalize="characters"
          className="font-mono"
          error={err.gstin ?? gstinProblem(g)}
          hint={ok ? `✓ Valid · ${state?.name ?? ""} · ${g.slice(0, 2)}` : "15 characters, jaise 08ABCDE1234F1Z5"}
        />
      )}
      <Field label="Legal name (as on GST certificate)" name="legal_name" defaultValue={d.biz.legal_name ?? d.biz.applicant_business_name} required error={err.legal_name} />
      <Field label="Shop / trade name (optional)" name="trade_name" defaultValue={d.biz.trade_name ?? d.biz.applicant_business_name} hint="Bill ke upar bada yahi dikhega" />
      <Field label="Udyam number (optional)" name="udyam_no" defaultValue={d.biz.udyam_no ?? ""} placeholder="UDYAM-RJ-17-0012345" autoCapitalize="characters" error={err.udyam_no} />
    </StepForm>
  );
}

function Address({ d, me, err }: StepProps) {
  const b = d.biz;
  return (
    <StepForm
      onSave={(f) =>
        patchBiz({
          address_line1: str(f, "address_line1"),
          address_line2: strOrNull(f, "address_line2"),
          city: str(f, "city"),
          pincode: strOrNull(f, "pincode"),
          ...(b.gstin ? {} : { state_code: strOrNull(f, "state_code") }),
          phone: strOrNull(f, "phone"),
          email: strOrNull(f, "email"),
        })
      }
    >
      <Heading title="Address & contact" sub="Ye sab bill par print hoga." />
      <Field label="Shop address" name="address_line1" defaultValue={b.address_line1 ?? ""} required autoComplete="address-line1" error={err.address_line1} />
      <Field label="Area / landmark (optional)" name="address_line2" defaultValue={b.address_line2 ?? ""} autoComplete="address-line2" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" name="city" defaultValue={b.city ?? b.applicant_city} required autoComplete="address-level2" error={err.city} />
        <Field label="Pincode" name="pincode" defaultValue={b.pincode ?? ""} inputMode="numeric" maxLength={6} autoComplete="postal-code" error={err.pincode} />
      </div>
      <StateSelect states={d.states} name="state_code" value={b.state_code} disabled={!!b.gstin} error={err.state_code ?? err.gstin} />
      {b.gstin && <p className="-mt-2 text-sm text-ink/60">State comes from your GSTIN.</p>}
      <Field label="Shop phone" name="phone" prefix="+91" inputMode="numeric" defaultValue={(b.phone ?? b.applicant_phone).replace(/^\+91/, "")} autoComplete="tel-national" error={err.phone} />
      <Field label="Email (optional)" name="email" type="email" defaultValue={b.email ?? me.user.email} autoComplete="email" error={err.email} />
    </StepForm>
  );
}

// Logo: shrink in the browser to ≤512 px, PNG (keeps transparency) or JPEG on white, under 200 KB.
// PNG/JPEG only: the PDF library can't embed WebP.
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = (type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));
  const png = await blob("image/png");
  if (png && png.size <= 200 * 1024) return png;
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  for (const q of [0.9, 0.75, 0.5]) {
    const b = await blob("image/jpeg", q);
    if (b && b.size <= 200 * 1024) return b;
  }
  throw new Error("This image is too large even after resizing");
}

function Logo({ d }: StepProps) {
  const { revalidate } = useRevalidator();
  const [msg, setMsg] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setMsg("Uploading…");
    try {
      const fd = new FormData();
      fd.append("file", await shrink(file), "logo");
      const r = await fetch("/api/business/logo", { method: "PUT", body: fd });
      if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Upload failed");
      setMsg(null);
      await revalidate();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function remove() {
    await api("/business/logo", { method: "DELETE" });
    await revalidate();
  }
  return (
    <StepForm>
      <Heading title="Logo" sub="Optional. Bill ke header mein dikhega." />
      <div className="flex items-center gap-4 rounded-2xl border border-gold-400/40 bg-white p-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-gold-100">
          {d.biz.logo_id ? <img src={`/api/logos/${d.biz.logo_id}`} alt="Your logo" className="size-full object-contain" /> : <span className="text-3xl" aria-hidden>🏪</span>}
        </div>
        <div>
          <b className="font-display text-xl">{d.biz.trade_name ?? d.biz.legal_name}</b>
          <p className="text-sm text-ink/60">{d.biz.city}</p>
        </div>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-gold-600 bg-white font-semibold text-gold-600">
        {d.biz.logo_id ? "Change logo" : "Choose logo image"}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {d.biz.logo_id && (
        <button type="button" onClick={remove} className="text-sm text-maroon-700 underline">
          Remove logo
        </button>
      )}
      {msg && <p className="text-sm text-ink/70">{msg}</p>}
    </StepForm>
  );
}

function Numbering({ d, err }: StepProps) {
  const s = d.settings;
  const [prefix, setPrefix] = useState(s.invoice_prefix);
  const [fy, setFy] = useState(s.include_fy);
  const [digits, setDigits] = useState(s.number_min_digits);
  const [start, setStart] = useState(String(s.next_no));
  const n = Number(start) || 1;
  const preview = docNumber(prefix, fy, digits, n);
  const over = preview.length > 16;
  return (
    <StepForm
      onSave={async (f) => {
        if (!/^\d{1,8}$/.test(start) || n < 1) return fieldErr("Enter a starting number", { starting_no: "whole number, 1 or more" });
        await patchSettings({ invoice_prefix: prefix, include_fy: fy, number_min_digits: digits, fy_reset: f.get("fy_reset") === "on" });
        if (n !== s.next_no) await api("/settings/number-series", { method: "PUT", body: { starting_no: n } });
      }}
    >
      <Heading title="Invoice numbering" sub="Purani bill book ka agla number daaliye — wahi se shuru karenge." />
      <div className="rounded-2xl bg-ink p-5 text-center text-ivory">
        <div className="text-sm text-ivory/60">Next bill number</div>
        <div className="mt-1 font-mono text-3xl tracking-wide">{preview}</div>
        <div className={`mt-2 text-sm ${over ? "text-red-300" : "text-ivory/60"}`}>{preview.length}/16 characters{over && " — too long for GST"}</div>
      </div>
      <Field label="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9/-]/g, ""))} maxLength={8} hint="Letters, numbers, / or -, e.g. SJ/" error={err.invoice_prefix} />
      <Check label="Include financial year (26-27/)" checked={fy} onChange={(e) => setFy(e.target.checked)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starting number" value={start} onChange={(e) => setStart(e.target.value.replace(/\D/g, ""))} inputMode="numeric" error={err.starting_no} />
        <Select label="Minimum digits" value={digits} onChange={(e) => setDigits(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((x) => (
            <option key={x} value={x}>{x} ({"0".repeat(x - 1)}1)</option>
          ))}
        </Select>
      </div>
      <Check label="Restart from 1 every April" name="fy_reset" defaultChecked={s.fy_reset} />
    </StepForm>
  );
}

function Print({ d, me }: StepProps) {
  const s = d.settings;
  return (
    <StepForm
      onSave={(f) => {
        const copies = f.getAll("copies").map(String) as Settings["copies"];
        if (!copies.length) return fieldErr("Choose at least one copy", {});
        return patchSettings({ copies, terms: str(f, "terms"), declaration: str(f, "declaration"), jurisdiction: str(f, "jurisdiction"), signatory_name: str(f, "signatory_name") });
      }}
    >
      <Heading title="Print settings" sub="Defaults theek hain — seedha Next bhi daba sakte hain." />
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium">Copies in each PDF</legend>
        {(["original", "duplicate", "triplicate"] as const).map((c) => (
          <Check key={c} name="copies" value={c} defaultChecked={s.copies.includes(c)} label={c[0]!.toUpperCase() + c.slice(1)} />
        ))}
      </fieldset>
      <Field label="Jurisdiction line" name="jurisdiction" defaultValue={s.jurisdiction || `Subject to ${d.biz.city ?? ""} jurisdiction`} />
      <Field label="Authorised signatory" name="signatory_name" defaultValue={s.signatory_name || me.user.name} />
      <TextArea label="Terms (optional)" name="terms" defaultValue={s.terms} placeholder="Goods once sold will not be taken back." />
      <TextArea label="Declaration" name="declaration" defaultValue={s.declaration} />
    </StepForm>
  );
}

function Bank({ d, err }: StepProps) {
  const s = d.settings;
  return (
    <StepForm
      onSave={(f) =>
        patchSettings({
          bank_name: strOrNull(f, "bank_name"),
          bank_account_name: strOrNull(f, "bank_account_name"),
          bank_account_no: strOrNull(f, "bank_account_no"),
          bank_ifsc: strOrNull(f, "bank_ifsc"),
          bank_branch: strOrNull(f, "bank_branch"),
          upi_id: strOrNull(f, "upi_id"),
        })
      }
    >
      <Heading title="Bank details" sub="Optional. Bill par payment ke liye print hoga." />
      <Field label="Bank name" name="bank_name" defaultValue={s.bank_name ?? ""} />
      <Field label="Account holder name" name="bank_account_name" defaultValue={s.bank_account_name ?? d.biz.legal_name ?? ""} />
      <Field label="Account number" name="bank_account_no" defaultValue={s.bank_account_no ?? ""} inputMode="numeric" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="IFSC" name="bank_ifsc" defaultValue={s.bank_ifsc ?? ""} autoCapitalize="characters" maxLength={11} placeholder="HDFC0001234" error={err.bank_ifsc} />
        <Field label="Branch" name="bank_branch" defaultValue={s.bank_branch ?? ""} />
      </div>
      <Field label="UPI ID" name="upi_id" defaultValue={s.upi_id ?? ""} placeholder="shop@okhdfcbank" />
    </StepForm>
  );
}

const MAKING: Record<MakingMode, { label: string; unit: string; dec: number }> = {
  per_gram: { label: "₹ per gram", unit: "₹/g", dec: 2 },
  flat: { label: "Flat ₹ per item", unit: "₹", dec: 2 },
  percent: { label: "% of metal value", unit: "%", dec: 3 },
};
const BOARD = ["24K", "22K", "18K", "Silver"];

function Defaults({ d, err }: StepProps) {
  const s = d.settings;
  const [mode, setMode] = useState<MakingMode>(s.default_making_mode);
  const metals = [...BOARD, ...d.rates.map((r) => r.metal).filter((m) => !BOARD.includes(m))];
  return (
    <StepForm
      onSave={async (f) => {
        const fields: Record<string, string> = {};
        const gst = toMilliPct(str(f, "gst"));
        if (gst == null || gst > 28000) fields.default_gst_rate = "Enter a rate like 3";
        const making = str(f, "making") === "" ? 0 : MAKING[mode].dec === 2 ? toPaise(str(f, "making")) : toMilliPct(str(f, "making"));
        if (making == null) fields.default_making_value = "Enter a number";
        const rates: MetalRate[] = [];
        for (const m of metals) {
          const v = str(f, "rate:" + m);
          if (!v) continue;
          const p = toPaise(v);
          if (!p) fields["rate:" + m] = "Enter ₹ per gram, e.g. 13457";
          else rates.push({ metal: m, rate_paise: p });
        }
        if (Object.keys(fields).length) return fieldErr("Please fix the highlighted fields", fields);
        await patchSettings({ default_gst_rate: gst!, default_making_mode: mode, default_making_value: making! });
        await api("/metal-rates", { method: "PUT", body: rates });
      }}
    >
      <Heading title="Defaults & today's rates" sub="Naye bill mein ye apne aap bhar jayenge. Rates roz badal sakte hain." />
      <Field label="Default GST rate" name="gst" defaultValue={plain(s.default_gst_rate, 3)} inputMode="decimal" prefix="%" hint="Gold & silver jewellery: 3%" error={err.default_gst_rate} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Making charge" value={mode} onChange={(e) => setMode(e.target.value as MakingMode)}>
          {Object.entries(MAKING).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <Field label="Amount" name="making" defaultValue={s.default_making_mode === mode ? plain(s.default_making_value, MAKING[mode].dec) : ""} inputMode="decimal" prefix={MAKING[mode].unit} error={err.default_making_value} />
      </div>
      <fieldset className="rounded-2xl border border-gold-400/40 bg-white p-4">
        <legend className="px-1 text-sm font-medium">Today's rates (₹ per gram)</legend>
        <div className="grid grid-cols-2 gap-3">
          {metals.map((m) => (
            <Field key={m} label={m} name={"rate:" + m} defaultValue={plain(d.rates.find((r) => r.metal === m)?.rate_paise, 2)} inputMode="decimal" prefix="₹" className="money" error={err["rate:" + m]} />
          ))}
        </div>
      </fieldset>
    </StepForm>
  );
}

// Rows editor shared by customers and items: blank rows are ignored, server errors map back by row.
function useRows<T extends Record<string, string>>(blank: T, initial = 0) {
  const [rows, setRows] = useState<T[]>(() => Array.from({ length: initial }, () => ({ ...blank })));
  const filled = () => rows.map((r, i) => [r, i] as const).filter(([r]) => Object.values(r).some((v) => v.trim()));
  const set = (i: number, k: keyof T, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return { rows, setRows, filled, set, add: (r: T = blank) => setRows([...rows, r]), del: (i: number) => setRows(rows.filter((_, j) => j !== i)) };
}

// remap turns "[2].name" (index into the sent list) into "[5].name" (index into the visible rows).
async function bulk(path: string, sent: (readonly [unknown, number])[], body: unknown[]) {
  try {
    await api(path, { method: "POST", body });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    const fields = Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k.replace(/^\[(\d+)\]/, (_, i) => `[${sent[Number(i)]?.[1]}]`), v]));
    throw new ApiError(e.status, e.code, e.message, fields);
  }
}

const rowErr = (err: Record<string, string>, i: number) =>
  Object.entries(err).filter(([k]) => k.startsWith(`[${i}]`)).map(([k, v]) => `${k.replace(/^\[\d+\]\.?/, "") || "row"}: ${v}`).join(" · ");

function Customers({ d, err }: StepProps) {
  const r = useRows({ name: "", phone: "", state: "", gstin: "", opening: "" }, d.parties.length ? 0 : 1);
  return (
    <StepForm
      onSave={async () => {
        const sent = r.filled();
        if (!sent.length) return;
        const body = sent.map(([x]) => ({
          name: x.name,
          phone: x.phone || null,
          bill_state_code: x.state || null,
          gstin: x.gstin || null,
          opening_balance_paise: x.opening ? toPaise(x.opening) ?? NaN : 0,
        }));
        const bad = body.findIndex((b) => Number.isNaN(b.opening_balance_paise));
        if (bad >= 0) return fieldErr("Check the opening balance", { [`[${sent[bad]![1]}].opening`]: "enter an amount like 15000" });
        await bulk("/parties/bulk", sent, body);
        r.setRows([]);
      }}
    >
      <Heading title="Customers" sub="Optional. Jinka udhaar chalta hai unka opening balance daal dijiye. Baad mein bhi add kar sakte hain." />
      {d.parties.length > 0 && (
        <ul className="rounded-2xl border border-gold-400/40 bg-white p-4 text-sm">
          {d.parties.map((p) => (
            <li key={p.id} className="flex justify-between py-1">
              <span>{p.name}</span>
              <span className="money text-ink/60">{p.opening_balance_paise ? fmtINR(p.opening_balance_paise) : ""}</span>
            </li>
          ))}
        </ul>
      )}
      {r.rows.map((x, i) => (
        <fieldset key={i} className="row-in space-y-3 rounded-2xl border border-gold-400/40 bg-white p-4">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium">Customer {d.parties.length + i + 1}</legend>
            <button type="button" className="text-sm text-maroon-700" onClick={() => r.del(i)}>Remove</button>
          </div>
          <Field label="Name" value={x.name} onChange={(e) => r.set(i, "name", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" value={x.phone} onChange={(e) => r.set(i, "phone", e.target.value)} inputMode="tel" />
            <Field label="Opening balance" value={x.opening} onChange={(e) => r.set(i, "opening", e.target.value)} inputMode="decimal" prefix="₹" hint="They owe you" />
          </div>
          <Select label="State" value={x.state} onChange={(e) => r.set(i, "state", e.target.value)}>
            <option value="">Same as shop / unknown</option>
            {d.states.map((s) => <option key={s.code} value={s.code}>{s.name} · {s.code}</option>)}
          </Select>
          <Field label="GSTIN (if business customer)" value={x.gstin} onChange={(e) => r.set(i, "gstin", e.target.value.toUpperCase())} maxLength={15} error={gstinProblem(x.gstin)} />
          {rowErr(err, i) && <p className="text-sm text-maroon-700">{rowErr(err, i)}</p>}
        </fieldset>
      ))}
      <button type="button" className="min-h-12 w-full rounded-xl border border-dashed border-gold-600 font-semibold text-gold-600" onClick={() => r.add()}>
        + Add customer
      </button>
    </StepForm>
  );
}

const PRESETS = [
  { name: "22K Jewellery", hsn: "7113", purity: "22K", metal: "22K", gst: "3", unit: "g" },
  { name: "18K Jewellery", hsn: "7113", purity: "18K", metal: "18K", gst: "3", unit: "g" },
  { name: "Gold Bar 0.995", hsn: "7108", purity: "0.995", metal: "24K", gst: "3", unit: "g" },
  { name: "Silver", hsn: "7106", purity: "", metal: "Silver", gst: "3", unit: "g" },
  { name: "Job work", hsn: "9988", purity: "", metal: "", gst: "5", unit: "nos" },
];

function Items({ d, err }: StepProps) {
  const r = useRows({ name: "", hsn: "", purity: "", metal: "", gst: "3", unit: "g" });
  const have = new Set([...d.items.map((x) => x.name), ...r.rows.map((x) => x.name)]);
  return (
    <StepForm
      onSave={async () => {
        const sent = r.filled();
        if (!sent.length) return;
        const body = sent.map(([x]) => ({ name: x.name, hsn: x.hsn || null, purity: x.purity || null, metal: x.metal || null, gst_rate: toMilliPct(x.gst) ?? -1, unit: x.unit }));
        await bulk("/items/bulk", sent, body);
        r.setRows([]);
      }}
    >
      <Heading title="Items" sub="Optional. Chip dabaiye — item add ho jayega. Sab editable hai." />
      <div className="flex flex-wrap gap-2">
        {PRESETS.filter((p) => !have.has(p.name)).map((p) => (
          <button key={p.name} type="button" onClick={() => r.add({ ...p })} className="min-h-11 rounded-full border border-gold-400 bg-white px-4 text-sm hover:bg-gold-100">
            + {p.name} <span className="text-ink/50">{p.hsn} · {p.gst}%</span>
          </button>
        ))}
        <button type="button" onClick={() => r.add()} className="min-h-11 rounded-full border border-dashed border-gold-600 px-4 text-sm text-gold-600">
          + Custom item
        </button>
      </div>
      {d.items.length > 0 && (
        <ul className="rounded-2xl border border-gold-400/40 bg-white p-4 text-sm">
          {d.items.map((x) => (
            <li key={x.id} className="flex justify-between py-1">
              <span>{x.name}</span>
              <span className="text-ink/60">HSN {x.hsn ?? "—"} · {x.gst_rate / 1000}%</span>
            </li>
          ))}
        </ul>
      )}
      {r.rows.map((x, i) => (
        <fieldset key={i} className="row-in grid grid-cols-6 gap-3 rounded-2xl border border-gold-400/40 bg-white p-4">
          <div className="col-span-6 flex justify-end">
            <button type="button" className="text-sm text-maroon-700" onClick={() => r.del(i)}>Remove</button>
          </div>
          <div className="col-span-6"><Field label="Name" value={x.name} onChange={(e) => r.set(i, "name", e.target.value)} /></div>
          <div className="col-span-2"><Field label="HSN/SAC" value={x.hsn} onChange={(e) => r.set(i, "hsn", e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} /></div>
          <div className="col-span-2"><Field label="Purity" value={x.purity} onChange={(e) => r.set(i, "purity", e.target.value)} /></div>
          <div className="col-span-2"><Field label="GST" value={x.gst} onChange={(e) => r.set(i, "gst", e.target.value)} inputMode="decimal" prefix="%" /></div>
          {rowErr(err, i) && <p className="col-span-6 text-sm text-maroon-700">{rowErr(err, i)}</p>}
        </fieldset>
      ))}
    </StepForm>
  );
}

// Sample bill with their details and the Bill B figures from docs/tax-engine.md.
function Preview({ d, err, goTo }: StepProps) {
  const b = d.biz;
  const s = d.settings;
  const state = d.states.find((x) => x.code === b.state_code);
  const taxInvoice = b.registration_type === "regular";
  const taxable = 43312559;
  const grand = taxInvoice ? 44611900 : 43312600;
  const missingStep: Record<string, number> = { registration_type: 1, legal_name: 2, gstin: 2, address_line1: 3, city: 3, state_code: 3 };
  const missing = Object.keys(err).filter((k) => k in missingStep);
  return (
    <StepForm onSave={() => api("/onboarding/complete", { method: "POST" })}>
      <Heading title="Sab sahi lag raha hai?" sub="Aapke details ke saath ek sample bill. Kuch badalna ho to Edit dabaiye." />
      {missing.length > 0 && (
        <div className="rounded-xl bg-maroon-700/10 p-3 text-maroon-700" role="alert">
          Pehle ye bharna zaroori hai:
          {missing.map((k) => (
            <button key={k} type="button" className="ml-2 underline" onClick={() => goTo(missingStep[k]!)}>
              {k.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      )}
      <article className="overflow-hidden rounded-2xl border border-gold-400/50 bg-white text-sm shadow-sm">
        <header className="flex gap-3 border-b border-gold-400/40 p-4">
          {b.logo_id && <img src={`/api/logos/${b.logo_id}`} alt="" className="size-14 object-contain" />}
          <div className="flex-1">
            <div className="font-display text-2xl font-semibold text-gold-600">{b.trade_name ?? b.legal_name}</div>
            <div className="text-ink/70">{[b.address_line1, b.address_line2, b.city, b.pincode].filter(Boolean).join(", ")}</div>
            <div className="text-ink/70">{state ? `${state.name} (${state.code})` : ""}{b.gstin ? ` · GSTIN ${b.gstin}` : ""}</div>
          </div>
          <button type="button" className="self-start text-gold-600 underline" onClick={() => goTo(2)}>Edit</button>
        </header>
        <div className="flex justify-between bg-gold-100 px-4 py-2">
          <b>{taxInvoice ? "TAX INVOICE" : "BILL OF SUPPLY"}</b>
          <span className="font-mono">
            {s.preview} <button type="button" className="ml-1 font-sans text-gold-600 underline" onClick={() => goTo(5)}>Edit</button>
          </span>
        </div>
        <table className="money w-full">
          <tbody className="[&_td]:px-4 [&_td]:py-1.5">
            <tr><td>22K Jewellery · HSN 7113<div className="text-xs text-ink/60">31.370 g @ ₹13,457.00 + making ₹350/g</div></td><td className="text-right">{fmtINR(taxable)}</td></tr>
            {taxInvoice && (
              <>
                <tr><td>CGST 1.5%</td><td className="text-right">{fmtINR(649688)}</td></tr>
                <tr><td>SGST 1.5%</td><td className="text-right">{fmtINR(649688)}</td></tr>
              </>
            )}
            <tr><td>Round off</td><td className="text-right">{taxInvoice ? "−₹0.35" : "₹0.41"}</td></tr>
            <tr className="border-t border-gold-400/40 text-base font-semibold"><td>Total</td><td className="text-right">{fmtINR(grand)}</td></tr>
          </tbody>
        </table>
        <footer className="grid gap-1 border-t border-gold-400/40 p-4 text-xs text-ink/70">
          {s.bank_name && <div>Bank: {s.bank_name} · A/c {s.bank_account_no} · IFSC {s.bank_ifsc}</div>}
          {s.terms && <div>{s.terms}</div>}
          <div>{s.jurisdiction}</div>
          <div className="text-right">For {b.trade_name ?? b.legal_name}<br /><br />{s.signatory_name}<br />Authorised Signatory</div>
          <div className="flex gap-3 text-gold-600">
            <button type="button" className="underline" onClick={() => goTo(6)}>Edit print</button>
            <button type="button" className="underline" onClick={() => goTo(7)}>Edit bank</button>
          </div>
        </footer>
      </article>
      <p className="text-center text-sm text-ink/60">Copies: {s.copies.join(", ")}</p>
    </StepForm>
  );
}

export const STEPS: { title: string; optional?: boolean; Body: (p: StepProps) => ReactNode }[] = [
  { title: "Welcome", Body: Welcome },
  { title: "GST status", Body: GstStatus },
  { title: "Business identity", Body: Identity },
  { title: "Address & contact", Body: Address },
  { title: "Logo", optional: true, Body: Logo },
  { title: "Invoice numbering", Body: Numbering },
  { title: "Print settings", Body: Print },
  { title: "Bank details", optional: true, Body: Bank },
  { title: "Defaults & rates", Body: Defaults },
  { title: "Customers", optional: true, Body: Customers },
  { title: "Items", optional: true, Body: Items },
  { title: "Preview & finish", Body: Preview },
];
