import { useState } from "react";
import { useRevalidator, useSearchParams } from "react-router";
import { Button } from "../components/ui";
import { ApiError } from "../lib/api";
import { SaveCtx, STEPS, type StepProps } from "../onboarding/steps";
import type { Route } from "./+types/app.settings";
import { readOnly, useMe } from "./app";
import { clientLoader as onboardingData } from "./app.onboarding";

export const clientLoader = onboardingData;

// Settings reuses the onboarding step forms, one section at a time.
const SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 9];

export default function SettingsPage({ loaderData: d }: Route.ComponentProps) {
  const me = useMe();
  const { revalidate } = useRevalidator();
  const [params, setParams] = useSearchParams();
  const step = Number(params.get("s") ?? 2);
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const S = STEPS[SECTIONS.includes(step) ? step : 2]!;

  async function save(fn?: () => Promise<unknown>) {
    setBusy(true);
    setErr({});
    setMsg(null);
    try {
      if (fn) await fn();
      await revalidate();
      setMsg("Saved ✓");
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) setErr({ ...e.fields, _: e.message });
      else setErr({ _: "Something went wrong" });
    } finally {
      setBusy(false);
    }
  }
  const props: StepProps = { d, me, err, busy, save, goTo: (n) => setParams({ s: String(n) }) };
  return (
    <>
      <h1 className="mb-4 font-display text-3xl font-semibold">Settings</h1>
      <div className="mb-5 flex flex-wrap gap-2">
        {SECTIONS.map((i) => (
          <button key={i} onClick={() => { setParams({ s: String(i) }); setMsg(null); setErr({}); }}
            className={`rounded-full border px-3 py-2 text-sm ${i === step ? "border-gold-600 bg-gold-600 text-white" : "border-gold-400 bg-white"}`}>
            {STEPS[i]!.title}
          </button>
        ))}
      </div>
      <SaveCtx value={save}>
        <S.Body key={step} {...props} />
      </SaveCtx>
      {err._ && <p className="mt-4 rounded-lg bg-maroon-700/10 p-3 text-maroon-700" role="alert">{err._}</p>}
      {msg && <p className="mt-4 text-green-800" role="status">{msg}</p>}
      {!readOnly(me) && step !== 4 && (
        <Button type="submit" form="step-form" className="mt-5 w-full" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      )}
      <p className="mt-6 text-xs text-ink/50">Changing settings never alters bills already issued — they keep the details they were issued with.</p>
    </>
  );
}

