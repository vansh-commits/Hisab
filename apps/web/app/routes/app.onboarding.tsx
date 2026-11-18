import type { Business, Item, MetalRate, Page, Party, Settings, State } from "@hisab/api";
import { useState, type CSSProperties } from "react";
import { useNavigate, useRevalidator } from "react-router";
import { Button } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { SaveCtx, STEPS, type Data, type StepProps } from "../onboarding/steps";
import type { Route } from "./+types/app.onboarding";
import { useMe } from "./app";

export async function clientLoader(): Promise<Data> {
  const [biz, settings, rates, states, parties, items] = await Promise.all([
    api<Business>("/business"),
    api<Settings>("/settings"),
    api<{ items: MetalRate[] }>("/metal-rates"),
    api<{ items: State[] }>("/states"),
    api<Page<Party>>("/parties"),
    api<{ items: Item[] }>("/items"),
  ]);
  return { biz, settings, rates: rates.items, states: states.items, parties: parties.items, items: items.items };
}

const last = STEPS.length - 1;

export default function Onboarding({ loaderData: d }: Route.ComponentProps) {
  const me = useMe();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const step = Math.min(d.biz.onboarding_step, last);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  // go saves the current step (if given), records progress, and reloads data, so a reload resumes here.
  async function go(to: number, save?: () => Promise<unknown>) {
    setBusy(true);
    setErr({});
    try {
      if (save) await save();
      if (step === last && to > last) {
        window.location.assign("/app?tour=1"); // full reload (the layout's cached /me still says "approved"), then the tour
        return;
      }
      await api("/onboarding", { method: "PATCH", body: { step: to } });
      setDir(to >= step ? 1 : -1);
      await revalidate();
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) setErr({ ...e.fields, _: e.message });
      else setErr({ _: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const S = STEPS[step]!;
  const props: StepProps = { d, me, err, busy, save: (fn) => go(step + 1, fn), goTo: (n) => go(n) };
  return (
    <div className="pb-28">
      <p className="text-sm text-ink/60">
        Step {step + 1} of {STEPS.length} · {S.title}
      </p>
      <div className="mt-2 flex gap-1" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-gold-600" : "bg-gold-100"}`} />
        ))}
      </div>

      <div key={step} className="step-in mt-6" style={{ "--dir": dir } as CSSProperties}>
        <SaveCtx value={props.save}>
          <S.Body {...props} />
        </SaveCtx>
        {err._ && <p className="mt-4 rounded-lg bg-maroon-700/10 p-3 text-maroon-700" role="alert">{err._}</p>}
      </div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-gold-400/40 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          {step > 0 && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          <span className="flex-1" />
          {S.optional && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => go(step + 1)}>
              Skip
            </Button>
          )}
          <Button type="submit" form="step-form" disabled={busy}>
            {busy ? "Saving…" : step === last ? "Finish 🎉" : step === 0 ? "Shuru karein →" : "Next →"}
          </Button>
        </div>
      </nav>
    </div>
  );
}
