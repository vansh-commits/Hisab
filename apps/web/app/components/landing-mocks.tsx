import { BookOpen, ChartColumn, Check, Coins, Download, Gem, House, Plus, ReceiptIndianRupee, Share2, TrendingUp } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Faithful mini replicas of the real app screens for the landing page (no screenshots to go stale).

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// useInView flips once when the element scrolls into view (reveal-on-scroll, works in every browser).
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || !("IntersectionObserver" in window)) return setSeen(true);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && (setSeen(true), io.disconnect()), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.15);
  return (
    <div ref={ref} className={`reveal-up ${seen ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export function Phone({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto w-[260px] rounded-[2.6rem] border-[10px] border-ink bg-ink shadow-2xl shadow-gold-600/20 ${className}`}>
      <div className="absolute left-1/2 top-1.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" aria-hidden />
      <div className="relative h-[520px] overflow-hidden rounded-[2rem] bg-ivory text-[11px] leading-snug text-ink">{children}</div>
    </div>
  );
}

function AppBar({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-gold-400/40 bg-white px-3 pb-2 pt-7">
      <span className="grid size-5 place-items-center rounded-md bg-gradient-to-br from-gold-400 to-gold-600 text-[8px] font-bold text-white">SJ</span>
      <span className="text-ink/40">×</span>
      <span className="font-display text-sm font-semibold text-gold-600">Hisab</span>
      <span className="ml-auto text-[10px] text-ink/50">{title}</span>
    </div>
  );
}

function Tabs({ active }: { active: number }) {
  const t = [House, ReceiptIndianRupee, Plus, BookOpen, Gem];
  return (
    <div className="absolute inset-x-0 bottom-0 grid grid-cols-5 border-t border-gold-400/40 bg-white py-2">
      {t.map((I, i) =>
        i === 2 ? (
          <span key={i} className="mx-auto grid size-7 place-items-center rounded-lg bg-gold-600 text-white"><I className="size-4" /></span>
        ) : (
          <I key={i} className={`mx-auto size-4 ${i === active ? "text-gold-600" : "text-ink/40"}`} />
        ),
      )}
    </div>
  );
}

const Card = ({ children, className = "", delay }: { children: ReactNode; className?: string; delay?: number }) => (
  <div className={`rounded-xl border border-gold-400/40 bg-white p-2.5 ${className}`} style={delay ? { animationDelay: `${delay}ms` } : undefined}>{children}</div>
);

// ── individual screens ───────────────────────────────────────────────────

export function RatesScreen() {
  return (
    <>
      <AppBar title="Aaj ka rate" />
      <div className="space-y-2 p-3">
        <div className="font-display text-lg font-semibold leading-tight">Aaj ka rate set karein</div>
        <p className="text-[10px] text-ink/55">IBJA AM rate · per gram · GST alag</p>
        {[["24K", "12,389", "12,389"], ["22K", "11,400", "11,349"], ["18K", "9,292", "9,292"], ["Silver", "152.53", "152.53"]].map(([m, mine, ibja], i) => (
          <Card key={m} className="mock-pop flex items-center gap-2" delay={i * 90}>
            <span className="w-10 font-semibold">{m}</span>
            <span className="money flex-1 rounded-lg border border-gold-400/60 px-2 py-1">₹ {mine}</span>
            <span className="money rounded-lg bg-gold-100 px-1.5 py-1 text-right text-[9px] leading-tight"><span className="block text-ink/50">IBJA</span>₹{ibja}</span>
          </Card>
        ))}
        <p className="text-[10px] font-semibold text-gold-600">Sab IBJA rate use karein</p>
        <div className="rounded-xl bg-gold-600 py-2.5 text-center font-semibold text-white">Save & billing shuru</div>
      </div>
      <Tabs active={0} />
    </>
  );
}

// Market rates dashboard: IBJA cards + a gold area chart that draws in.
const CURVE = [62, 58, 60, 52, 55, 47, 50, 41, 44, 36, 40, 33, 37, 28, 31, 24];
export function MarketScreen() {
  const fill = useId(); // unique: the same mock renders in hidden + visible phones
  const pts = CURVE.map((y, i) => `${(i * 220) / (CURVE.length - 1)},${y}`).join(" ");
  return (
    <>
      <AppBar title="Market rates" />
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-semibold">Market rates</span>
          <span className="rounded-lg border border-gold-400 px-2 py-0.5 text-[10px] font-semibold">↻ Refresh</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[["Gold 999", "12,389", "▲ ₹31 (0.25%)", true], ["Silver 999", "152.53", "▲ ₹1.9 (1.25%)", true], ["Gold 916", "11,349", "▲ ₹28 (0.25%)", true], ["Gold 750", "9,292", "▼ ₹12 (0.13%)", false]].map(([l, v, c, up], i) => (
            <Card key={l as string} className={`mock-pop ${i === 0 ? "ring-1 ring-gold-400" : ""}`} delay={i * 90}>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-gold-600">{l}</span>
              <span className="money block text-sm font-semibold">₹{v}<span className="text-[9px] font-normal text-ink/50">/g</span></span>
              <span className={`money text-[9px] font-semibold ${up ? "text-emerald-700" : "text-red-700"}`}>{c}</span>
            </Card>
          ))}
        </div>
        <Card className="mock-pop" delay={400}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Gold 999</span>
            <span className="flex gap-1 text-[9px]">{["1W", "1M", "3M", "1Y"].map((r) => <span key={r} className={`rounded px-1 ${r === "1M" ? "bg-gold-100 font-semibold text-gold-600" : "text-ink/50"}`}>{r}</span>)}</span>
          </div>
          <svg viewBox="0 0 220 70" className="mt-1 w-full" aria-hidden>
            <defs><linearGradient id={fill} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9a44c" stopOpacity=".45" /><stop offset="1" stopColor="#c9a44c" stopOpacity="0" /></linearGradient></defs>
            <polygon points={`0,70 ${pts} 220,70`} fill={`url(#${fill})`} />
            <polyline points={pts} fill="none" stroke="#9a7b2f" strokeWidth="1.8" strokeLinejoin="round" pathLength={1} className="mock-line" />
          </svg>
          <div className="mt-1 grid grid-cols-3 gap-1 text-[9px]">
            {[["High", "12,560"], ["Low", "11,890"], ["Avg", "12,210"]].map(([k, v]) => <span key={k}><span className="block text-ink/50">{k}</span><b className="money">₹{v}</b></span>)}
          </div>
        </Card>
      </div>
      <Tabs active={0} />
    </>
  );
}

export function ParticularsScreen() {
  return (
    <>
      <AppBar title="Particulars" />
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between"><span className="font-display text-lg font-semibold">Particulars</span><span className="rounded-lg bg-gold-600 px-2 py-1 text-[10px] font-semibold text-white">+ Add</span></div>
        {[["22K Gold Chain", "7113 · 3% · uses 22K rate"], ["22K Bangles", "7113 · 3% · making ₹350/g"], ["18K Diamond Ring", "7113 · 3% · uses 18K rate"], ["Silver Payal", "7113 · 3% · uses Silver"], ["Job work", "SAC 9988 · 5%"]].map(([n, s], i) => (
          <Card key={n} className="mock-pop" delay={i * 80}>
            <div className="font-semibold">{n}</div>
            <div className="text-[10px] text-ink/60">{s}</div>
          </Card>
        ))}
      </div>
      <Tabs active={4} />
    </>
  );
}

// BillScreen types a weight and lets the total run up, like a real bill being made.
export function BillScreen({ play = true, oldGold = false }: { play?: boolean; oldGold?: boolean }) {
  const full = "31.370";
  const [n, setN] = useState(reduced() || !play ? full.length : 0);
  useEffect(() => {
    if (!play || reduced()) return setN(full.length);
    setN(0);
    let k = 0;
    const t = setInterval(() => {
      k++;
      setN(k);
      if (k >= full.length) clearInterval(t);
    }, 220);
    return () => clearInterval(t);
  }, [play]);
  const done = n >= full.length;
  return (
    <>
      <AppBar title="New bill" />
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-semibold">New bill</span>
          <span className="flex rounded-lg border border-gold-400 p-0.5 text-[9px] font-semibold"><span className="rounded-md bg-gold-600 px-1.5 py-0.5 text-white">Rate se</span><span className="px-1.5 py-0.5">Total se</span></span>
        </div>
        <Card><div className="text-[9px] text-ink/50">Bill to</div><div className="font-semibold">Meena Traders ▾</div></Card>
        <Card className="space-y-1.5">
          <div className="text-[9px] text-ink/50">Particular</div>
          <div className="font-semibold">22K Gold Chain · HSN 7113 · 3% ▾</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-lg border border-gold-400/60 px-2 py-1"><div className="text-[8px] text-ink/50">Net wt (g)</div><div className="money font-semibold">{full.slice(0, n)}<span className={done ? "hidden" : "caret"}>|</span></div></div>
            <div className="rounded-lg border border-gold-400/60 px-2 py-1"><div className="text-[8px] text-ink/50">Rate ₹/g</div><div className="money font-semibold">13,457</div></div>
          </div>
          <div className="text-right text-[10px] text-ink/60">Making ₹350/g · Taxable <b className="text-ink">{done ? "₹4,33,125.59" : "…"}</b></div>
        </Card>
        {oldGold && (
          <Card className="mock-pop border-gold-600/60 bg-gold-100/60">
            <div className="flex items-center gap-1 font-semibold"><Check className="size-3 text-green-700" /> Purana sona lein</div>
            <div className="text-[10px] text-ink/70">Old bangles 22K · 10.200 g net @ ₹12,800 → <b>−₹1,30,560.00</b></div>
          </Card>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-11 border-t border-gold-400/40 bg-white p-3 shadow-[0_-6px_16px_rgba(0,0,0,.06)]">
        <div className="flex justify-between text-[10px] text-ink/60"><span>Maharashtra (27) · CGST + SGST</span><span>₹6,496.88 each</span></div>
        <div className="mt-1 flex items-baseline justify-between">
          <span>{oldGold ? "Net payable" : "Total"}</span>
          <span className={`money text-xl font-bold transition-opacity duration-500 ${done ? "opacity-100" : "opacity-30"}`}>{oldGold ? "₹3,15,559.00" : "₹4,46,119.00"}</span>
        </div>
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-1.5"><span className="rounded-lg border border-gold-400 px-3 py-2 font-semibold">Draft</span><span className="rounded-lg bg-gold-600 py-2 text-center font-semibold text-white">Save &amp; issue</span></div>
      </div>
      <Tabs active={2} />
    </>
  );
}

export function IssuedScreen() {
  return (
    <>
      <AppBar title="SJ/26-27/0148" />
      <div className="space-y-2 p-3">
        <div className="mock-pop rounded-xl bg-green-50 p-3 text-center"><div className="mx-auto grid size-8 place-items-center rounded-full bg-green-600 text-white"><Check className="size-5" /></div><b className="mt-1 block">Bill SJ/26-27/0148 issued</b></div>
        <div className="grid grid-cols-2 gap-1.5"><span className="flex items-center justify-center gap-1 rounded-lg bg-gold-600 py-2 font-semibold text-white"><Download className="size-3" /> PDF</span><span className="flex items-center justify-center gap-1 rounded-lg border border-gold-400 py-2 font-semibold"><Share2 className="size-3" /> WhatsApp</span></div>
        <div className="rounded-lg border border-gold-400/50 bg-white p-2.5 shadow-sm">
          <div className="flex justify-between border-b border-gold-400/40 pb-1.5"><div><div className="font-display text-sm font-semibold text-gold-600">Soni Jewellers</div><div className="text-[8px] text-ink/50">GSTIN 27•••••1ZV</div></div><div className="text-right text-[8px]"><b>TAX INVOICE</b><div className="font-mono">SJ/26-27/0148</div></div></div>
          <div className="money mt-1.5 space-y-0.5 text-[9px]">
            <div className="flex justify-between"><span>22K Gold Chain · 31.370 g</span><span>4,33,125.59</span></div>
            <div className="flex justify-between text-ink/60"><span>CGST 1.5%</span><span>6,496.88</span></div>
            <div className="flex justify-between text-ink/60"><span>SGST 1.5%</span><span>6,496.88</span></div>
            <div className="flex justify-between border-t border-gold-400/40 pt-0.5 font-semibold"><span>Total</span><span>₹4,46,119.00</span></div>
          </div>
          <div className="mt-1 text-[7px] text-ink/50">Rupees Four Lakh Forty-Six Thousand One Hundred Nineteen Only</div>
        </div>
      </div>
      <Tabs active={1} />
    </>
  );
}

export function KhataScreen() {
  return (
    <>
      <AppBar title="Khata" />
      <div className="space-y-2 p-3">
        <div className="flex items-baseline justify-between"><span className="font-display text-lg font-semibold">Meena Traders</span><span className="money font-bold text-maroon-700">₹1,25,559</span></div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]"><span className="rounded-lg bg-gold-600 py-1.5 text-center font-semibold text-white">Receive payment</span><span className="rounded-lg border border-gold-400 py-1.5 text-center font-semibold">WhatsApp reminder</span></div>
        <div className="overflow-hidden rounded-xl border border-gold-400/40 bg-white">
          {[["Opening", "", "15,000"], ["Bill SJ/0148", "+4,46,119", "4,61,119"], ["Old gold", "−1,30,560", "3,30,559"], ["UPI 4321", "−2,00,000", "1,30,559"], ["Cash", "−5,000", "1,25,559"]].map(([a, b, c], i) => (
            <div key={a} className="mock-pop flex justify-between border-t border-gold-400/30 px-2 py-1.5 first:border-0" style={{ animationDelay: `${i * 90}ms` }}>
              <span>{a}</span><span className="money text-ink/60">{b}</span><span className="money font-semibold">{c}</span>
            </div>
          ))}
        </div>
      </div>
      <Tabs active={3} />
    </>
  );
}

export function ReportsScreen() {
  const bars = [38, 62, 45, 80, 58, 92, 70];
  return (
    <>
      <AppBar title="Reports" />
      <div className="space-y-2 p-3">
        <div className="font-display text-lg font-semibold">Reports</div>
        <div className="flex flex-wrap gap-1 text-[9px]">{["Sales register", "GST summary", "HSN", "Old gold"].map((t, i) => <span key={t} className={`rounded-full border px-2 py-0.5 ${i === 1 ? "border-gold-600 bg-gold-600 text-white" : "border-gold-400"}`}>{t}</span>)}</div>
        <Card>
          <div className="flex h-24 items-end gap-1.5">{bars.map((h, i) => <span key={i} className="mock-bar flex-1 rounded-t bg-gradient-to-t from-gold-600 to-gold-400" style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />)}</div>
          <div className="mt-1 text-center text-[9px] text-ink/50">Monthly taxable value</div>
        </Card>
        <Card className="money space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span>Taxable</span><b>₹38,42,190.00</b></div>
          <div className="flex justify-between"><span>CGST</span><span>₹57,632.85</span></div>
          <div className="flex justify-between"><span>SGST</span><span>₹57,632.85</span></div>
        </Card>
        <div className="flex items-center justify-center gap-1 rounded-lg border border-gold-400 py-2 font-semibold"><Download className="size-3" /> Download CSV for CA</div>
      </div>
      <Tabs active={0} />
    </>
  );
}

// Desktop: the dashboard with the sidebar, inside a browser frame.
export function DesktopDashboard() {
  const nav: [typeof House, string][] = [[House, "Home"], [Plus, "New bill"], [ReceiptIndianRupee, "All bills"], [Coins, "Old gold"], [BookOpen, "Customers"], [Gem, "Particulars"], [TrendingUp, "Today's rates"], [ChartColumn, "Reports"]];
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white text-ink shadow-2xl shadow-gold-600/20">
      <div className="flex items-center gap-1.5 border-b border-ink/10 bg-ink/[.03] px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#ff5f57]" /><span className="size-2.5 rounded-full bg-[#febc2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto rounded-md bg-white px-10 py-0.5 text-[10px] text-ink/50">hisab.app/app</span>
      </div>
      <div className="grid grid-cols-[150px_1fr] text-[11px]">
        <div className="space-y-0.5 border-r border-gold-400/40 p-2.5">
          <div className="mb-2 flex items-center gap-1"><span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-gold-400 to-gold-600 text-[8px] font-bold text-white">SJ</span><span className="text-ink/40">×</span><span className="font-display text-base font-semibold text-gold-600">Hisab</span></div>
          {nav.map(([I, l], i) => <div key={l} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${i === 0 ? "bg-gold-600 font-semibold text-white" : "text-ink/70"}`}><I className="size-3" />{l}</div>)}
        </div>
        <div className="bg-ivory p-4">
          <div className="text-[10px] text-ink/50">Tuesday, 18 November</div>
          <div className="font-display text-xl font-semibold">Namaste Ramesh 🙏</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[["Today's sales", "₹4,46,119.00"], ["This month", "₹38,42,190.00"], ["To collect", "₹2,15,400.00"]].map(([a, b]) => <Card key={a}><div className="text-[9px] text-ink/60">{a}</div><div className="money mt-1 text-sm font-semibold">{b}</div></Card>)}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">{["New bill", "Receive payment", "Buy old gold", "Update rates"].map((a) => <Card key={a} className="flex items-center gap-1.5"><span className="size-4 rounded bg-gold-600" />{a}</Card>)}</div>
          <div className="mt-3 overflow-hidden rounded-xl border border-gold-400/40 bg-white">
            {[["SJ/26-27/0148", "Meena Traders", "₹4,46,119.00", "Paid"], ["SJ/26-27/0147", "Cash customer", "₹62,410.00", "Due"], ["SJ/26-27/0146", "Rakesh Jain", "₹1,18,903.00", "Part paid"]].map(([a, b, c, d]) => (
              <div key={a} className="flex items-center gap-2 border-t border-gold-400/30 px-3 py-2 first:border-0"><span className="font-mono">{a}</span><span className="flex-1 text-ink/60">{b}</span><span className={`rounded-full px-1.5 text-[9px] font-semibold ${d === "Paid" ? "bg-green-100 text-green-900" : d === "Due" ? "bg-maroon-700/10 text-maroon-700" : "bg-gold-100 text-gold-600"}`}>{d}</span><span className="money font-semibold">{c}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Fit renders children at a fixed design width and scales them down to the available width,
// so the laptop mockup looks like a shrunken screenshot on phones instead of reflowing.
export function Fit({ width = 960, children }: { width?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ s: number; h?: number }>({ s: 1 });
  useEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const s = Math.min(1, o.clientWidth / width);
      setFit({ s, h: i.offsetHeight * s });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className="overflow-hidden" style={{ height: fit.h }}>
      <div ref={inner} style={{ width, transform: `scale(${fit.s})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

// HomeScreen: the dashboard as it looks on a phone (used where the laptop mockup would be too small).
export function HomeScreen() {
  return (
    <>
      <AppBar title="Home" />
      <div className="space-y-2 p-3">
        <div className="text-[10px] text-ink/50">Tuesday, 18 November</div>
        <div className="font-display text-lg font-semibold">Namaste Ramesh 🙏</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[["Today's sales", "₹4,46,119.00"], ["This month", "₹38,42,190.00"]].map(([a, b], i) => (
            <Card key={a} className="mock-pop" delay={i * 90}><div className="text-[9px] text-ink/60">{a}</div><div className="money mt-0.5 font-semibold">{b}</div></Card>
          ))}
          <Card className="mock-pop col-span-2" delay={180}><div className="text-[9px] text-ink/60">To collect (udhaar)</div><div className="money mt-0.5 font-semibold text-maroon-700">₹2,15,400.00</div></Card>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-semibold">
          {["New bill", "Receive payment", "Buy old gold", "Update rates"].map((a) => (
            <Card key={a} className="flex items-center gap-1.5 !p-2"><span className="size-4 shrink-0 rounded bg-gold-600" />{a}</Card>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-gold-400/40 bg-white">
          {[["SJ/26-27/0148", "Meena Traders", "₹4,46,119", "Paid"], ["SJ/26-27/0147", "Cash customer", "₹62,410", "Due"]].map(([a, b, c, d]) => (
            <div key={a} className="flex items-center justify-between border-t border-gold-400/30 px-2 py-1.5 first:border-0">
              <span><span className="block font-mono text-[9px]">{a}</span><span className="text-[9px] text-ink/60">{b}</span></span>
              <span className="text-right"><span className="money block font-semibold">{c}</span><span className={`text-[8px] font-semibold ${d === "Paid" ? "text-green-800" : "text-maroon-700"}`}>{d}</span></span>
            </div>
          ))}
        </div>
      </div>
      <Tabs active={0} />
    </>
  );
}
