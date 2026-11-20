import { ArrowRight, BookOpen, Calculator, ChartColumn, Check, Coins, FileText, Gem, Lock, RefreshCw, Scale, ShieldCheck, Smartphone, TrendingUp, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BillScreen, DesktopDashboard, Fit, HomeScreen, IssuedScreen, KhataScreen, ParticularsScreen, Phone, RatesScreen, ReportsScreen, Reveal, useInView,
} from "../components/landing-mocks";
import { InViewArt, JewelArt, Ornament, type Jewel } from "../components/jewel-art";

const SITE = "https://hisab-zeta-opal.vercel.app";
const DESC = "GST-ready bills for Indian jewellers: weight × rate + making, CGST/SGST/IGST, old gold exchange, khata and reports. Works on your phone.";

const FAQ = [
  ["Kya ye free hai?", "Early-access ke dauraan haan, free hai. Pricing aane se pehle aapko bata denge."],
  ["Mera data safe hai?", "Data encrypted backups ke saath roz save hota hai. Aapka data sirf aapka hai — kabhi bhi export kar sakte hain. Hum use bechte ya ads ke liye use nahi karte."],
  ["Bina GST registration ke chalega?", "Haan. Composition ya unregistered dukaan ke liye Hisab apne aap Bill of Supply banata hai (bina GST)."],
  ["Phone pe chalega?", "Haan — Hisab phone ke liye hi banaya gaya hai. Bill banaiye, PDF share kijiye, sab phone se."],
  ["E-invoice / e-way bill?", "Abhi nahi. Ye baad mein aayega; bill ke columns pehle se ready hain."],
] as const;

export function meta() {
  const ld = [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Hisab", applicationCategory: "BusinessApplication", operatingSystem: "Web",
      description: DESC, url: SITE, offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return [
    { title: "Hisab — GST billing for jewellers" },
    { name: "description", content: DESC },
    { property: "og:title", content: "Hisab — Bill banaiye seconds mein" },
    { property: "og:description", content: DESC },
    { property: "og:type", content: "website" },
    { property: "og:url", content: SITE },
    { property: "og:image", content: `${SITE}/og.svg` },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: SITE },
    { "script:ld+json": ld },
  ];
}

const cta = "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gold-600 px-6 font-semibold text-white shadow-lg shadow-gold-600/25 transition duration-150 hover:bg-maroon-700 active:scale-[.98]";

// ── The scroll story: as each chapter scrolls past, the sticky phone shows that screen ──

const STORY: { icon: LucideIcon; time: string; title: string; body: string; screen: (on: boolean) => ReactNode }[] = [
  { icon: TrendingUp, time: "10:00", title: "Dukaan khuli, bhav set", body: "Subah ek baar 24K, 22K, 18K aur Silver ka rate daaliye. Din bhar har bill mein wahi rate apne aap.", screen: () => <RatesScreen /> },
  { icon: Gem, time: "10:05", title: "Particulars ek baar, hamesha ke liye", body: "Chain, bangles, ring, job work — HSN, GST, purity, making ek baar. Bill mein bas dropdown.", screen: () => <ParticularsScreen /> },
  { icon: Calculator, time: "11:30", title: "Customer aaya — bill 30 second mein", body: "Customer chuniye, chain chuniye, weight daaliye. CGST/SGST, round off, amount in words — sab khud.", screen: (on) => <BillScreen play={on} /> },
  { icon: Coins, time: "11:31", title: "Purana sona? Usi bill par", body: "“Purana sona lein” tick kijiye — old gold minus, net payable ready, purchase voucher bhi ban gaya.", screen: (on) => <BillScreen oldGold play={on} /> },
  { icon: FileText, time: "11:32", title: "PDF tayyar, WhatsApp par", body: "Customer copy + shop copy PDF, HSN summary ke saath. Ek tap mein customer ko WhatsApp.", screen: () => <IssuedScreen /> },
  { icon: BookOpen, time: "6:00", title: "Shaam ko khata", body: "Kisse kitna lena hai — har customer ka ledger, payments, aur ek tap mein reminder.", screen: () => <KhataScreen /> },
  { icon: ChartColumn, time: "Mahine ke end", title: "CA ke liye reports", body: "GST summary, HSN summary, sales register — CSV download, CA khush.", screen: () => <ReportsScreen /> },
];

function Story() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <section className="relative mx-auto max-w-6xl px-4 py-20" aria-labelledby="story-title">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-gold-600">Ek din, Hisab ke saath</p>
        <h2 id="story-title" className="mt-2 font-display text-4xl font-semibold md:text-5xl">Subah ke bhav se shaam ke khate tak</h2>
      </Reveal>
      <div className="mt-14 grid gap-10 md:grid-cols-[1fr_320px] md:gap-16">
        <ol className="relative">
          <span className="absolute left-[19px] top-2 hidden h-[calc(100%-1rem)] w-px bg-gold-400/40 md:block" aria-hidden />
          {STORY.map((s, i) => (
            <li key={s.title} ref={(el) => { refs.current[i] = el; }} data-i={i}
              className={`relative flex min-h-[46vh] gap-5 pb-10 transition-opacity duration-500 md:min-h-[62vh] ${i === active ? "opacity-100" : "md:opacity-35"}`}>
              <span className={`relative z-10 grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors duration-500 ${i <= active ? "border-gold-600 bg-gold-600 text-white" : "border-gold-400/60 bg-ivory text-gold-600"}`}>
                <s.icon aria-hidden className="size-5" />
              </span>
              <div className="pt-1">
                <div className="text-sm font-semibold text-gold-600">{s.time}</div>
                <h3 className="mt-1 font-display text-3xl font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-md text-lg leading-relaxed text-ink/75">{s.body}</p>
                <div className="mt-6 md:hidden"><Phone>{s.screen(true)}</Phone></div>
              </div>
            </li>
          ))}
        </ol>
        <div className="sticky top-[12vh] hidden h-fit md:block" aria-hidden>
          <div className="absolute -inset-10 -z-10 rounded-full bg-gold-100 blur-3xl" />
          <Phone>
            {STORY.map((s, i) => (
              <div key={i} className={`absolute inset-0 transition-all duration-500 ${i === active ? "translate-y-0 opacity-100" : i < active ? "-translate-y-6 opacity-0" : "translate-y-6 opacity-0"}`}>
                {Math.abs(i - active) <= 1 ? s.screen(i === active) : null}
              </div>
            ))}
          </Phone>
          <div className="mt-5 flex justify-center gap-1.5">
            {STORY.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-6 bg-gold-600" : "w-1.5 bg-gold-400/50"}`} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

// Desktop showcase: the laptop tilts flat as it scrolls into view.
function Showcase() {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  return (
    <section className="relative overflow-hidden bg-ink py-20 text-ivory">
      <InViewArt kind="bangles" className="pointer-events-none absolute -right-16 -top-10 w-64 opacity-30 md:w-96" />
      <InViewArt kind="jhumka" className="pointer-events-none absolute -bottom-8 -left-12 w-48 opacity-25 md:w-72" />
      <div className="relative mx-auto max-w-6xl px-4">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-400">Kahin se bhi</p>
          <h2 className="mt-2 font-display text-4xl font-semibold md:text-5xl">Phone par bhi, computer par bhi</h2>
          <p className="mt-3 text-lg text-ivory/70">Counter par phone se bill, ghar par computer se report — ek hi account, sab sync. Har cheez ek tap door.</p>
        </Reveal>
        <div ref={ref} className="mt-12 hidden [perspective:1600px] md:block">
          <div className={`showcase ${seen ? "is-in" : ""}`}><Fit><DesktopDashboard /></Fit></div>
        </div>
        <Reveal className="mt-10 md:hidden"><Phone className="ring-1 ring-white/20"><HomeScreen /></Phone></Reveal>
      </div>
    </section>
  );
}

const FEATURES: [LucideIcon, string, string][] = [
  [Scale, "Weight × rate + making", "Per gram, flat ya % making — ek hi line mein. Aaj ka rate apne aap."],
  [RefreshCw, "Total se bill", "Customer ne total bataya? “Total se” — rate aur GST Hisab nikaal dega."],
  [Calculator, "CGST / SGST / IGST automatic", "Place of supply GST law ke hisaab se. Aapko sochna nahi padega."],
  [Coins, "Purana sona exchange", "Old gold usi bill par minus — purchase voucher bhi apne aap."],
  [FileText, "PDF: customer + shop copy", "Ek click mein PDF, WhatsApp share. HSN summary, amount in words."],
  [BookOpen, "Customer khata", "Udhaar, payments, opening balance — har customer ka ledger."],
];

const CARD_ART: Jewel[] = ["necklace", "ring", "bangles", "jhumka", "ring", "necklace"];

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <header className="sticky top-0 z-30 border-b border-gold-400/20 bg-ivory/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="font-display text-3xl font-semibold text-gold-600">Hisab</span>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#story" className="hidden rounded-lg px-3 py-2 hover:bg-gold-100 sm:inline">Kaise kaam karta hai</a>
            <a href="#faq" className="hidden rounded-lg px-3 py-2 hover:bg-gold-100 sm:inline">FAQ</a>
            <a href="/login" className="rounded-lg px-4 py-2 font-semibold hover:bg-gold-100">Log in</a>
          </nav>
        </div>
      </header>

      {/* Hero: the phone is already making a bill. */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 md:grid-cols-[1.1fr_1fr] md:pt-16">
        <div className="hero-glow absolute -top-20 right-0 -z-10 size-[520px] rounded-full" aria-hidden />
        <JewelArt kind="necklace" draw className="pointer-events-none absolute -left-28 -top-10 -z-10 w-[340px] opacity-[.10] md:-left-44 md:w-[540px]" />
        <div>
          <span className="rise inline-flex items-center gap-2 rounded-full border border-gold-400/60 bg-white px-3 py-1 text-sm"><ShieldCheck aria-hidden className="size-4 text-green-700" /> GST-ready · Jewellers ke liye</span>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.05] md:text-7xl">Bill banaiye <span className="shimmer">seconds</span> mein.</h1>
          <p className="mt-5 max-w-xl text-lg text-ink/80">Weight daaliye, total paiye. CGST/SGST, purana sona, PDF, khata — sab ek jagah. <span lang="hi">सोने जैसा खरा हिसाब.</span></p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/login" className={cta}>Join the waitlist <ArrowRight aria-hidden className="size-5" /></a>
            <a href="#story" className="inline-flex min-h-12 items-center rounded-xl border border-gold-400 bg-white px-6 font-semibold transition hover:bg-gold-100">Dekhiye kaise →</a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink/70">
            {["Gapless bill numbers", "Bill lock after issue", "Phone + computer"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check aria-hidden className="size-4 text-green-700" /> {t}</li>)}
          </ul>
        </div>
        <div className="float relative">
          <JewelArt kind="ring" draw className="art-glow pointer-events-none absolute -right-10 -top-8 hidden w-28 lg:block" />
          <JewelArt kind="jhumka" draw className="art-glow pointer-events-none absolute -bottom-6 -left-16 hidden w-28 lg:block" />
          <Phone><BillScreen /></Phone>
          <div className="float-chip absolute -left-4 top-24 hidden rounded-2xl border border-gold-400/50 bg-white px-4 py-3 shadow-xl sm:block">
            <div className="text-xs text-ink/60">CGST + SGST</div><div className="money font-semibold">₹12,993.76</div>
          </div>
          <div className="float-chip absolute -right-2 bottom-28 hidden rounded-2xl border border-gold-400/50 bg-white px-4 py-3 shadow-xl [animation-delay:1.2s] sm:block">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><Check aria-hidden className="size-4 text-green-700" /> Bill SJ/26-27/0148</div>
          </div>
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal><h2 className="font-display text-4xl font-semibold md:text-5xl">Haath ke bill mein galti ho hi jaati hai.</h2></Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {([
              ["Galat total", <>Jaldi mein <s className="text-maroon-700">₹4,22,155</s> likh diya — sahi tha <b>₹4,22,146.09</b>.</>],
              ["GST ka hisaab", "CGST + SGST ya IGST? Customer kahan ka hai, maal kahan ja raha hai — har baar sochna."],
              ["Bill book kho gayi", "Purani bills dhoondhna, CA ko register dena, number ka gap — sab sir dard."],
            ] as const).map(([t, b], i) => (
              <Reveal key={t} delay={i * 120}>
                <div className="lift h-full rounded-2xl border border-gold-400/40 bg-ivory p-6">
                  <h3 className="text-lg font-semibold">{t}</h3>
                  <p className="mt-2 text-ink/75">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div id="story"><Story /></div>

      <Showcase />

      <section className="mx-auto max-w-6xl px-4 py-20">
        <Reveal><Ornament className="mb-6 !mx-0" /><h2 className="font-display text-4xl font-semibold md:text-5xl">Jeweller ke hisaab se bana hai</h2></Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([Icon, t, b], i) => (
            <Reveal key={t} delay={(i % 3) * 100}>
              <div className="lift group relative isolate h-full overflow-hidden rounded-2xl border border-gold-400/40 bg-white p-6">
                <InViewArt kind={CARD_ART[i % CARD_ART.length]!} className="pointer-events-none absolute -right-3 -top-3 -z-10 w-32 opacity-70 transition-opacity group-hover:opacity-100" />
                <span className="grid size-12 place-items-center rounded-2xl bg-gold-100 text-gold-600 transition group-hover:bg-gold-600 group-hover:text-white"><Icon aria-hidden className="size-6" /></span>
                <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-ink/75">{b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2">
          <Reveal>
            <h2 className="font-display text-4xl font-semibold md:text-5xl">GST ka bharosa</h2>
            <ul className="mt-8 space-y-4">
              {([[Calculator, "Sahi CGST/SGST ya IGST — place of supply ke hisaab se"], [FileText, "Har saal bina gap ke bill numbers"], [ChartColumn, "Har bill par HSN summary, amount in words"], [Lock, "Issue hone ke baad bill lock — sirf cancel"], [ShieldCheck, "Roz encrypted backup — aapka data aapka"], [Smartphone, "Phone aur computer dono par"]] as const).map(([Icon, t], i) => (
                <Reveal key={t} delay={i * 80}>
                  <li className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-green-50 text-green-800"><Icon aria-hidden className="size-5" /></span>{t}</li>
                </Reveal>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={150}><Phone className="rotate-2"><IssuedScreen /></Phone></Reveal>
        </div>
      </section>

      <section id="faq" className="py-20">
        <div className="mx-auto max-w-3xl px-4">
          <Reveal><Ornament className="mb-6" /><h2 className="text-center font-display text-4xl font-semibold md:text-5xl">Sawaal-jawaab</h2></Reveal>
          <div className="mt-8 divide-y divide-gold-400/40 overflow-hidden rounded-2xl border border-gold-400/40 bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {q}<span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-100 text-gold-600 transition group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="faq-a mt-3 text-ink/75">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="glow relative overflow-hidden py-24 text-center">
        <InViewArt kind="jhumka" className="pointer-events-none absolute left-[6%] top-10 hidden w-40 opacity-50 md:block" />
        <InViewArt kind="jhumka" className="pointer-events-none absolute right-[6%] top-10 hidden w-40 -scale-x-100 opacity-50 md:block" />
        <Reveal>
          <Ornament className="mb-6" />
          <h2 className="font-display text-4xl font-semibold md:text-6xl">Apni dukaan ko digital banaiye.</h2>
          <p className="mt-4 text-lg text-ink/70">Waitlist join kijiye — approval ke baad 5 minute ka setup.</p>
          <a href="/login" className={`${cta} mt-8`}>Join the waitlist <ArrowRight aria-hidden className="size-5" /></a>
        </Reveal>
      </section>

      <footer className="border-t border-gold-400/40 py-8 text-center text-sm text-ink/60">
        <a href="/privacy" className="mx-3 hover:underline">Privacy</a>
        <a href="/terms" className="mx-3 hover:underline">Terms</a>
        <a href="mailto:vanshcommits@gmail.com" className="mx-3 hover:underline">Contact</a>
        <p className="mt-3">© 2026 Hisab</p>
      </footer>
    </div>
  );
}
