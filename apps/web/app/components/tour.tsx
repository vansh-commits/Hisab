import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

// The first-run tour: shown after onboarding (/app?tour=1) and from "How to use Hisab" in the menu.
const STEPS = [
  { icon: "🎉", title: "Setup ho gaya!", body: "Ek minute ka tour — Hisab mein kya kahan hai. Skip karna ho to kabhi bhi “Skip” dabaiye; menu mein “How to use Hisab” se dobara dekh sakte hain." },
  { icon: "📈", title: "1. Roz subah: today's rates", body: "“Today's rates” mein 24K, 22K, 18K, Silver ka aaj ka rate daaliye. Bill banate waqt ye rate apne aap bhar jayega.", to: "/app/rates", cta: "Open rates" },
  { icon: "💍", title: "2. Particulars — jo aap bechte hain", body: "Chain, ring, bangles, silver, job work… ek baar add kijiye: HSN, GST %, purity, making. Bill mein dropdown se chuniye — sab apne aap aa jayega.", to: "/app/items", cta: "Open particulars" },
  { icon: "➕", title: "3. Naya bill", body: "Customer dropdown se chuniye (ya walk-in), particular chuniye, weight daaliye — total, CGST/SGST sab live dikhega. “Rate se” ya “Total se” — dono chalte hain. “Save & issue” dabate hi bill number lag jata hai.", to: "/app/bills/new", cta: "Try a bill" },
  { icon: "🪙", title: "4. Purana sona", body: "Exchange ho to bill par hi “Purana sona lein” tick kijiye — net payable apne aap kam ho jayega. Sirf kharidna ho to “Old gold” page se voucher banaiye." },
  { icon: "🧾", title: "5. Saare bills", body: "“All bills” mein search, drafts, PDF / print, WhatsApp share, payment record karna aur galat bill cancel karna — sab yahin. Issue hua bill badla nahi ja sakta, sirf cancel.", to: "/app/bills", cta: "Open bills" },
  { icon: "📒", title: "6. Customers (khata)", body: "Har customer ka udhaar, payments aur ledger. Opening balance, on-account payment aur WhatsApp reminder bhi yahin se.", to: "/app/customers", cta: "Open khata" },
  { icon: "📊", title: "7. Reports for your CA", body: "Sales register, GST summary, HSN summary, old gold register — month ya FY chuniye aur CSV download kijiye." },
];

export function Tour() {
  const [params, setParams] = useSearchParams();
  const [i, setI] = useState(0);
  // Show it once automatically to anyone who hasn't seen it (e.g. shops onboarded before the tour existed).
  useEffect(() => {
    try {
      if (localStorage.getItem("hisab.tourSeen")) return;
      localStorage.setItem("hisab.tourSeen", "1");
      setParams((p) => { p.set("tour", "1"); return p; }, { replace: true });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (params.get("tour") !== "1") return null;
  const close = () => {
    params.delete("tour");
    setParams(params, { replace: true });
    setI(0);
  };
  const s = STEPS[i]!;
  const last = i === STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/50 p-4 sm:place-items-center" role="dialog" aria-modal aria-labelledby="tour-title">
      <div key={i} className="step-in w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, j) => <span key={j} className={`h-1.5 w-5 rounded-full ${j <= i ? "bg-gold-600" : "bg-gold-100"}`} />)}
          </div>
          <button className="text-sm text-ink/60 underline" onClick={close}>Skip</button>
        </div>
        <div className="mt-5 text-5xl" aria-hidden>{s.icon}</div>
        <h2 id="tour-title" className="mt-3 font-display text-3xl font-semibold">{s.title}</h2>
        <p className="mt-3 leading-relaxed text-ink/80">{s.body}</p>
        {s.to && <Link to={s.to} onClick={close} className="mt-3 inline-block text-sm font-semibold text-gold-600 underline">{s.cta} →</Link>}
        <div className="mt-6 flex gap-2">
          {i > 0 && <button className="min-h-12 rounded-xl border border-gold-400 px-5 font-semibold" onClick={() => setI(i - 1)}>Back</button>}
          {last ? (
            <Link to="/app/bills/new" onClick={close} className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-gold-600 font-semibold text-white">Pehla bill banaiye →</Link>
          ) : (
            <button className="min-h-12 flex-1 rounded-xl bg-gold-600 font-semibold text-white" onClick={() => setI(i + 1)}>Next →</button>
          )}
        </div>
      </div>
    </div>
  );
}
