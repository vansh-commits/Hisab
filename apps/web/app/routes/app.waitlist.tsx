import type { Application } from "@hisab/api";
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { Button, Card, Field } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { gstinProblem } from "../lib/gstin";
import type { Route } from "./+types/app.waitlist";
import { useMe } from "./app";

export async function clientLoader() {
  try {
    return (await api<{ application: Application }>("/waitlist")).application;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const f = await request.formData();
  const body = {
    business_name: String(f.get("business_name") ?? ""),
    owner_name: String(f.get("owner_name") ?? ""),
    phone: String(f.get("phone") ?? ""),
    city: String(f.get("city") ?? ""),
    gstin: String(f.get("gstin") ?? "") || null,
  };
  try {
    await api("/waitlist", { method: request.method, body });
    return { ok: true as const };
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return { ok: false as const, message: e.message, fields: e.fields };
    throw e;
  }
}

export default function Waitlist({ loaderData: app, actionData }: Route.ComponentProps) {
  const [editing, setEditing] = useState(false);
  const me = useMe();
  // A successful submit revalidates the loaders, so `app` is fresh and the form closes.
  const showForm = !app || editing;
  if (showForm) {
    return (
      <ApplyForm
        app={app}
        method={app ? "put" : "post"}
        result={actionData}
        onDone={() => setEditing(false)}
      />
    );
  }
  return (
    <Card>
      {app.status === "rejected" ? (
        <>
          <h1 className="font-display text-3xl font-semibold">Application not approved yet</h1>
          {app.review_note && <p className="mt-3 rounded-lg bg-gold-100 p-3">Note from our team: {app.review_note}</p>}
          <p className="mt-3 text-ink/70">Update your details and apply again.</p>
          <Button className="mt-5" onClick={() => setEditing(true)}>
            Edit and re-apply
          </Button>
        </>
      ) : (
        <>
          <div className="text-4xl" aria-hidden>🪔</div>
          <h1 className="mt-2 font-display text-3xl font-semibold">Aap waitlist par hain 🙏</h1>
          <p className="mt-3 text-ink/70">
            We'll email you at <b>{me.user.email}</b> once your account is approved.
          </p>
          <p className="mt-2 text-sm text-ink/60">Mail na dikhe to Spam folder check karein aur "Not spam" mark karein.</p>
        </>
      )}
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink/60">Business</dt><dd>{app.business_name}</dd>
        <dt className="text-ink/60">Owner</dt><dd>{app.owner_name}</dd>
        <dt className="text-ink/60">Phone</dt><dd>{app.phone}</dd>
        <dt className="text-ink/60">City</dt><dd>{app.city}</dd>
        <dt className="text-ink/60">GSTIN</dt><dd>{app.gstin ?? "—"}</dd>
      </dl>
      {app.status === "pending" && (
        <button className="mt-4 text-sm text-gold-600 underline" onClick={() => setEditing(true)}>
          Edit details
        </button>
      )}
    </Card>
  );
}

type Result = { ok: true } | { ok: false; message: string; fields: Record<string, string> } | undefined;

function ApplyForm({ app, method, result, onDone }: { app: Application | null; method: "post" | "put"; result: Result; onDone: () => void }) {
  const [gstin, setGstin] = useState(app?.gstin ?? "");
  const busy = useNavigation().state !== "idle";
  const fields = result && !result.ok ? result.fields : {};
  if (result?.ok && app && method === "put") queueMicrotask(onDone);
  return (
    <Card>
      <h1 className="font-display text-3xl font-semibold">{app ? "Edit your application" : "Join the waitlist"}</h1>
      <p className="mt-2 text-ink/70">5 cheezein bataiye — approval ke baad 5-minute setup.</p>
      <Form method={method} className="mt-6 space-y-4">
        <Field label="Business name" name="business_name" defaultValue={app?.business_name} required maxLength={120} error={fields.business_name} />
        <Field label="Owner name" name="owner_name" defaultValue={app?.owner_name} required maxLength={120} error={fields.owner_name} autoComplete="name" />
        <Field
          label="Mobile number"
          name="phone"
          prefix="+91"
          inputMode="numeric"
          autoComplete="tel-national"
          defaultValue={app?.phone.replace(/^\+91/, "")}
          required
          error={fields.phone}
        />
        <Field label="City" name="city" defaultValue={app?.city} required maxLength={120} error={fields.city} autoComplete="address-level2" />
        <Field
          label="GSTIN (optional)"
          name="gstin"
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          maxLength={15}
          autoCapitalize="characters"
          error={fields.gstin ?? gstinProblem(gstin)}
          hint={gstin.length === 15 && !gstinProblem(gstin) ? "✓ GSTIN looks valid" : "Na ho to khaali chhod dijiye"}
        />
        {result && !result.ok && !Object.keys(fields).length && <p className="text-maroon-700">{result.message}</p>}
        <Button type="submit" disabled={busy || !!gstinProblem(gstin)} className="w-full">
          {busy ? "Saving…" : app ? "Save and re-submit" : "Join the waitlist →"}
        </Button>
      </Form>
    </Card>
  );
}
