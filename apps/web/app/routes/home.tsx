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

const cta = "inline-flex min-h-12 items-center justify-center rounded-xl bg-gold-600 px-6 font-semibold text-white shadow-sm transition hover:bg-maroon-700";

function SampleBill({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-gold-400/60 bg-white p-5 text-sm shadow-xl ${className}`} aria-label="Sample bill">
      <div className="flex items-center justify-between border-b border-gold-400/40 pb-3">
        <div>
          <div className="font-display text-xl font-semibold text-gold-600">Soni Jewellers</div>
          <div className="text-xs text-ink/60">Johari Bazaar, Jaipur · GSTIN 08•••••1Z5</div>
        </div>
        <div className="text-right text-xs"><b>TAX INVOICE</b><div className="font-mono">SJ/26-27/0148</div></div>
      </div>
      <table className="money mt-3 w-full">
        <tbody className="[&_td]:py-1">
          <tr><td>22K Jewellery · 7113<div className="text-xs text-ink/60">31.370 g × ₹13,457 + making ₹350/g</div></td><td className="text-right">4,33,125.59</td></tr>
          <tr className="text-ink/70"><td>CGST 1.5%</td><td className="text-right">6,496.88</td></tr>
          <tr className="text-ink/70"><td>SGST 1.5%</td><td className="text-right">6,496.88</td></tr>
          <tr className="text-ink/70"><td>Round off</td><td className="text-right">−0.35</td></tr>
          <tr className="border-t border-gold-400/50 text-base font-semibold"><td>Total</td><td className="shimmer text-right">₹4,46,119.00</td></tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink/60">Rupees Four Lakh Forty-Six Thousand One Hundred Nineteen Only</p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <span className="font-display text-3xl font-semibold text-gold-600">Hisab</span>
        <a href="/login" className="rounded-lg px-4 py-2 font-semibold hover:bg-gold-100">Log in</a>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 md:grid-cols-2 md:pt-16">
        <div>
          <h1 className="font-display text-5xl font-semibold leading-tight md:text-6xl">Bill banaiye seconds mein.</h1>
          <p className="mt-4 text-lg text-ink/80">GST-ready invoices for jewellers. <span lang="hi">सोने जैसा खरा हिसाब.</span></p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/login" className={cta}>Join the waitlist →</a>
            <a href="#sample" className="inline-flex min-h-12 items-center rounded-xl border border-gold-400 px-6 font-semibold hover:bg-gold-100">See a sample bill</a>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gold-100 blur-2xl" aria-hidden />
          <SampleBill className="rise" />
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-4xl font-semibold">Haath ke bill mein galti ho hi jaati hai.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Galat total", <>Calculator pe jaldi mein <s className="text-maroon-700">₹4,22,155</s> likh diya — sahi tha <b>₹4,22,146.09</b>.</>],
              ["GST ka hisaab", "CGST + SGST ya IGST? Customer kahan ka hai, maal kahan ja raha hai — har baar sochna padta hai."],
              ["Bill book kho gayi", "Purani bills dhoondhna, CA ko register dena, number ka gap — sab sir dard."],
            ].map(([t, b], i) => (
              <div key={i} className="reveal rounded-2xl border border-gold-400/40 bg-ivory p-6" style={{ animationDelay: `${i * 80}ms` }}>
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="mt-2 text-ink/75">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-4xl font-semibold">Jeweller ke hisaab se bana hai</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["⚖️", "Weight × rate + making", "Per gram, flat ya % making — ek hi line mein. Aaj ka rate apne aap bhar jata hai."],
            ["🔁", "Total se bill", "Customer ne total bataya? “Total se” chuniye — rate aur GST Hisab nikaal dega."],
            ["🧮", "CGST / SGST / IGST automatic", "Place of supply GST law ke hisaab se. Aapko sochna nahi padega."],
            ["🪙", "Purana sona exchange", "Old gold usi bill par minus — purchase voucher bhi apne aap ban jata hai."],
            ["📄", "PDF: Original / Duplicate", "Ek click mein PDF, WhatsApp pe share. HSN summary aur amount in words ke saath."],
            ["📒", "Customer khata", "Udhaar, payments, opening balance — har customer ka ledger. Reminder bhi bhejiye."],
          ].map(([icon, t, b]) => (
            <div key={t} className="rounded-2xl border border-gold-400/40 bg-white p-6">
              <div className="text-3xl" aria-hidden>{icon}</div>
              <h3 className="mt-3 text-lg font-semibold">{t}</h3>
              <p className="mt-1 text-ink/75">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink py-16 text-ivory">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-4xl font-semibold">Teen step, bas</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {["Waitlist join karein (1 minute)", "Approval ke baad 5-minute setup", "Pehla bill banaiye"].map((s, i) => (
              <li key={s} className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gold-600 font-display text-2xl font-semibold">{i + 1}</span>
                <span className="pt-2 text-lg">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2" id="sample">
        <div>
          <h2 className="font-display text-4xl font-semibold">GST ka bharosa</h2>
          <ul className="mt-6 space-y-3">
            {["Sahi CGST/SGST ya IGST — place of supply ke hisaab se", "Har saal bina gap ke bill numbers", "Har bill par HSN summary", "Amount in words — lakh aur crore mein", "Issue hone ke baad bill lock — sirf cancel ho sakta hai", "Aapka data aapka — kabhi bhi export"].map((t, i) => (
              <li key={t} className="reveal flex gap-3" style={{ animationDelay: `${i * 70}ms` }}>
                <span className="text-green-700" aria-hidden>✓</span>{t}
              </li>
            ))}
          </ul>
        </div>
        <SampleBill className="md:rotate-1" />
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="font-display text-4xl font-semibold">Sawaal-jawaab</h2>
          <div className="mt-6 divide-y divide-gold-400/40 rounded-2xl border border-gold-400/40">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  {q}<span className="transition group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-ink/75">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="glow relative py-20 text-center">
        <h2 className="font-display text-4xl font-semibold md:text-5xl">Apni dukaan ko digital banaiye.</h2>
        <a href="/login" className={`${cta} mt-8`}>Join the waitlist →</a>
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
