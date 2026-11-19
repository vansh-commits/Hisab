import { BookOpen, ChartColumn, CircleHelp, Coins, Gem, Plus, ReceiptIndianRupee, Sparkles, TrendingUp, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

// Spotlight story-tour: dims the app, cuts a glowing hole around the real menu item, and points at it
// with a hand-drawn arrow from a story card. Targets are elements with data-tour="…" (first visible wins,
// so phones fall back from a sidebar link to the bottom tab or the "More" menu).
type Step = { targets?: string[]; icon: LucideIcon; title: string; body: string; to?: string; cta?: string };

const STEPS: Step[] = [
  { icon: Sparkles, title: "Aapki dukaan, ab digital", body: "Chaliye ek chhota sa safar karte hain — har cheez kahan hai, ek-ek karke. Aage badhne ke liye “Next” ya → key." },
  { targets: ["rates", "more"], icon: TrendingUp, title: "Subah ki shuruaat: aaj ka bhav", body: "Roz subah 24K, 22K, 18K aur Silver ka rate yahan daaliye. Har naye bill mein ye rate apne aap bhar jayega.", to: "/app/rates", cta: "Rates kholiye" },
  { targets: ["items"], icon: Gem, title: "Aapke particulars", body: "Chain, ring, bangles, job work — jo bhi bechte hain, ek baar yahan add kijiye: HSN, GST, purity, making. Phir bill mein bas dropdown se chuniye.", to: "/app/items", cta: "Particulars kholiye" },
  { targets: ["new-bill"], icon: Plus, title: "Naya bill — seconds mein", body: "Customer chuniye, particular chuniye, weight daaliye. Total, CGST/SGST sab live. “Rate se” ya “Total se” — dono chalte hain. Save & issue = bill number + PDF.", to: "/app/bills/new", cta: "Bill banaiye" },
  { targets: ["old-gold", "more"], icon: Coins, title: "Purana sona", body: "Exchange ho to bill par hi “Purana sona lein” tick kijiye — net payable apne aap kam. Sirf kharidna ho to yahan se voucher banaiye." },
  { targets: ["bills"], icon: ReceiptIndianRupee, title: "Saare bills ek jagah", body: "Search, drafts, PDF / print, WhatsApp share, payment record karna, galat bill cancel karna — sab yahin. Issue hua bill lock rehta hai.", to: "/app/bills", cta: "Bills dekhiye" },
  { targets: ["customers"], icon: BookOpen, title: "Khata — kisse kitna lena hai", body: "Har customer ka udhaar, payments aur poora ledger. Opening balance, on-account payment aur WhatsApp reminder bhi yahin se.", to: "/app/customers", cta: "Khata kholiye" },
  { targets: ["reports", "more"], icon: ChartColumn, title: "CA ke liye reports", body: "Sales register, GST summary, HSN summary, old gold register — month ya FY chuniye, CSV download kijiye." },
  { targets: ["help", "more"], icon: CircleHelp, title: "Bas itna hi!", body: "Ye tour kabhi bhi dobara dekhna ho to “How to use Hisab” dabaiye. Ab pehla bill banate hain?" },
];

type Box = { top: number; left: number; width: number; height: number };
const PAD = 6;
const CARD_W = 340;

function findTarget(keys?: string[]): HTMLElement | null {
  for (const k of keys ?? []) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${k}"]`)) {
      const r = el.getBoundingClientRect();
      if (el.getClientRects().length && r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

export function Tour() {
  const [params, setParams] = useSearchParams();
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(260);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const open = params.get("tour") === "1";

  // Show it once automatically to anyone who hasn't seen it (e.g. shops onboarded before the tour existed).
  useEffect(() => {
    try {
      if (localStorage.getItem("hisab.tourSeen")) return;
      localStorage.setItem("hisab.tourSeen", "1");
      setParams((p) => { p.set("tour", "1"); return p; }, { replace: true });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    setParams((p) => { p.delete("tour"); return p; }, { replace: true });
    setI(0);
  }, [setParams]);

  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;

  // Measure the target (and keep measuring on resize/scroll) so the spotlight tracks it.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      const el = findTarget(step.targets);
      if (!el) return setBox(null);
      const r = el.getBoundingClientRect();
      // Keep the glow on screen (tabs touch the screen edges on phones).
      const left = Math.max(3, r.left - PAD), top = Math.max(3, r.top - PAD);
      const right = Math.min(window.innerWidth - 3, r.right + PAD), bottom = Math.min(window.innerHeight - 3, r.bottom + PAD);
      setBox({ top, left, width: right - left, height: bottom - top });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [open, i, vp.w]);

  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && !last) setI((x) => x + 1);
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, i, last, close]);

  if (!open) return null;

  // Place the card beside the spotlight: right of a sidebar item, above a bottom tab, below a header item.
  const m = 16;
  const cw = Math.min(CARD_W, (vp.w || CARD_W + m * 2) - m * 2);
  const card = { h: cardH };
  let pos: { left: number; top: number };
  let side: "right" | "above" | "below" | "none" = "none";
  if (!box) {
    pos = { left: (vp.w - cw) / 2, top: Math.max(m, (vp.h - card.h) / 2) };
  } else if (box.left + box.width + 76 + cw < vp.w) {
    side = "right";
    pos = { left: box.left + box.width + 76, top: Math.min(Math.max(m, box.top + box.height / 2 - card.h / 2), vp.h - card.h - m) };
  } else if (box.top > vp.h / 2) {
    side = "above";
    pos = { left: Math.min(Math.max(m, box.left + box.width / 2 - cw / 2), vp.w - cw - m), top: Math.max(m, box.top - card.h - 70) };
  } else {
    side = "below";
    pos = { left: Math.min(Math.max(m, box.left + box.width / 2 - cw / 2), vp.w - cw - m), top: box.top + box.height + 70 };
  }

  // Arrow from the card edge to the spotlight edge, as a gentle curve.
  let arrow: string | null = null;
  if (box) {
    const tx = box.left + box.width / 2, ty = box.top + box.height / 2;
    if (side === "right") {
      const sx = pos.left - 6, sy = Math.min(Math.max(pos.top + 40, ty), pos.top + card.h - 24);
      const ex = box.left + box.width + 8;
      arrow = `M ${sx} ${sy} C ${sx - 30} ${sy - 46}, ${ex + 34} ${ty - 46}, ${ex} ${ty}`;
    } else if (side === "above") {
      const sx = Math.min(Math.max(pos.left + 30, tx), pos.left + cw - 30), sy = pos.top + card.h + 6, ey = box.top - 8;
      arrow = `M ${sx} ${sy} C ${sx + 40} ${sy + 30}, ${tx + 40} ${ey - 30}, ${tx} ${ey}`;
    } else if (side === "below") {
      const sx = Math.min(Math.max(pos.left + 30, tx), pos.left + cw - 30), sy = pos.top - 6, ey = box.top + box.height + 8;
      arrow = `M ${sx} ${sy} C ${sx + 40} ${sy - 30}, ${tx + 40} ${ey + 30}, ${tx} ${ey}`;
    }
  }

  const hiddenInMore = box && step.targets && findTarget(step.targets)?.dataset.tour === "more" && step.targets[0] !== "more";
  const Icon = step.icon;
  const primary = "inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-gold-600 px-5 font-semibold text-white transition hover:bg-maroon-700 active:scale-[.98]";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-labelledby="tour-title" aria-describedby="tour-body">
      {box ? (
        <div className="tour-spot pointer-events-none fixed rounded-2xl" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden />
      ) : (
        <div className="tour-dim fixed inset-0" aria-hidden />
      )}
      {arrow && (
        <svg className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden>
          <defs>
            <marker id="tour-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#c9a44c" />
            </marker>
          </defs>
          <path key={i} d={arrow} className="tour-arrow" fill="none" stroke="#c9a44c" strokeWidth="3" strokeLinecap="round" markerEnd="url(#tour-head)" />
        </svg>
      )}
      <div ref={cardRef} key={i} className="tour-card fixed rounded-3xl bg-white p-5 shadow-2xl" style={{ left: pos.left, top: pos.top, width: cw }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-gold-600">Step {i + 1} of {STEPS.length}</span>
          <button onClick={close} className="grid size-9 place-items-center rounded-full text-ink/60 hover:bg-gold-100" aria-label="Close tour"><X aria-hidden className="size-5" /></button>
        </div>
        <div className="mt-2 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-100 text-gold-600"><Icon aria-hidden className="size-6" /></span>
          <h2 id="tour-title" className="font-display text-2xl font-semibold leading-tight">{step.title}</h2>
        </div>
        <p id="tour-body" className="mt-3 leading-relaxed text-ink/80">{step.body}</p>
        {hiddenInMore && <p className="mt-2 text-sm text-ink/60">Phone par ye “More” menu mein milega.</p>}
        {step.to && !last && (
          <Link to={step.to} onClick={close} className="mt-2 inline-block text-sm font-semibold text-gold-600 underline-offset-4 hover:underline">{step.cta} →</Link>
        )}
        <div className="mt-4 flex gap-1" aria-hidden>
          {STEPS.map((_, j) => <span key={j} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${j <= i ? "bg-gold-600" : "bg-gold-100"}`} />)}
        </div>
        <div className="mt-4 flex gap-2">
          {i > 0 && <button onClick={() => setI(i - 1)} className="min-h-12 rounded-xl border border-gold-400 px-4 font-semibold hover:bg-gold-100">Back</button>}
          {last ? (
            <Link ref={nextRef as React.Ref<HTMLAnchorElement>} to="/app/bills/new" onClick={close} className={primary}>Pehla bill banaiye →</Link>
          ) : (
            <button ref={nextRef as React.Ref<HTMLButtonElement>} onClick={() => setI(i + 1)} className={primary}>{i === 0 ? "Shuru karein →" : "Next →"}</button>
          )}
        </div>
        {!last && <button onClick={close} className="mt-3 w-full text-center text-sm text-ink/60 underline-offset-4 hover:underline">Skip tour</button>}
      </div>
    </div>
  );
}
