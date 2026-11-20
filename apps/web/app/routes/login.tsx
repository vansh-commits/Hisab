import { Lock, ShieldCheck, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { JewelArt, Ornament, type Jewel } from "../components/jewel-art";

export function meta() {
  return [{ title: "Log in · Hisab" }];
}

const errors: Record<string, string> = {
  denied: "Google login was cancelled.",
  unverified: "Your Google email isn't verified.",
  expired: "Login took too long. Please try again.",
};

const devUsers = ["pending@example.com", "rejected@example.com", "approved@example.com", "suspended@example.com", "new@example.com"];

const SLIDES: [Jewel, string, string][] = [
  ["necklace", "Har gram ka hisab", "Weight, rate, making — bill 1 minute mein"],
  ["ring", "Saaf, sundar GST bill", "Customer copy + shop copy, PDF mein"],
  ["bangles", "Purana sona, naya bill", "Exchange ka hisab apne aap"],
  ["jhumka", "Khata hamesha ready", "Kisse kitna lena hai, ek nazar mein"],
];

function Slides() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((n) => (n + 1) % SLIDES.length), 5000);
    return () => clearTimeout(t);
  }, [i, paused]);

  return (
    <section
      className={`login-bg relative h-[44vh] min-h-80 overflow-hidden text-ivory lg:h-auto lg:min-h-dvh ${paused ? "paused" : ""}`}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      aria-roledescription="carousel" aria-label="Hisab features"
    >
      <a href="/" className="absolute left-5 top-4 z-10 font-display text-2xl font-semibold text-gold-400 lg:left-10 lg:top-8 lg:text-3xl">Hisab</a>
      {SLIDES.map(([kind, title, sub], n) => (
        <div key={kind} className={`login-slide flex flex-col items-center justify-center px-6 pb-14 pt-10 lg:pb-24 ${n === i ? "is-on" : ""}`} aria-hidden={n !== i}>
          <JewelArt key={n === i ? "on" : "off"} kind={kind} draw={n === i ? true : undefined} className="art-glow w-[min(52vw,190px)] lg:w-[min(34vw,400px)]" />
          <div className="login-cap mt-2 text-center lg:mt-6">
            <h2 className="font-display text-3xl font-semibold text-gold-100 lg:text-5xl">{title}</h2>
            <p className="mt-1 text-sm text-ivory/70 lg:mt-3 lg:text-lg">{sub}</p>
          </div>
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-10 z-10 flex justify-center gap-2 lg:bottom-12">
        {SLIDES.map(([kind], n) => (
          <button key={kind} onClick={() => setI(n)} aria-label={`Slide ${n + 1}`} aria-current={n === i}
            className={`relative h-1.5 overflow-hidden rounded-full bg-ivory/25 transition-all duration-500 ${n === i ? "w-10" : "w-3 hover:bg-ivory/50"}`}>
            {n === i && <span key={i} className="dot-progress absolute inset-0 rounded-full bg-gold-400" />}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Login() {
  // Prerendered page: read the query string only after hydration.
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => setParams(new URLSearchParams(location.search)), []);
  const err = params?.get("error");
  const returnTo = params?.get("return_to") ?? "/app";

  async function devLogin(email: string) {
    await fetch("/api/dev/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    location.href = returnTo;
  }

  return (
    <main className="min-h-dvh bg-ivory lg:grid lg:grid-cols-[1.35fr_1fr]">
      <Slides />
      <div className="relative z-10 -mt-8 rounded-t-[2rem] bg-ivory px-6 pb-12 pt-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:px-12">
        <div className="login-in mx-auto w-full max-w-sm">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 text-lg text-white shadow-lg shadow-gold-600/30" aria-hidden>◆</span>
            <span className="text-sm font-semibold uppercase tracking-[.2em] text-gold-600">GST billing for jewellers</span>
          </div>
          <div className="mt-8">
            <h1 className="font-display text-5xl font-semibold">Namaste 🙏</h1>
            <p className="mt-2 text-ink/70">Apne Hisab account mein login kijiye.</p>
          </div>
          {err && <p role="alert" className="mt-5 rounded-xl bg-maroon-700/10 p-3 text-sm text-maroon-700">{errors[err] ?? "Login failed. Please try again."}</p>}
          <div className="mt-8">
            <a
              href={`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`}
              className="sheen flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-gold-400/70 bg-white px-5 font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gold-600/15"
            >
              <GoogleG /> Continue with Google
            </a>
            <p className="mt-3 text-center text-sm text-ink/60">Naye hain? Waitlist join karne ke liye bhi yahi.</p>
          </div>
          <div className="mt-10">
            <Ornament />
            <ul className="mt-6 grid grid-cols-3 gap-2 text-center text-xs text-ink/70">
              {([[ShieldCheck, "GST-ready"], [Lock, "Bills lock rehte hain"], [TrendingUp, "Roz ka rate"]] as const).map(([Icon, t]) => (
                <li key={t} className="flex flex-col items-center gap-1.5"><span className="grid size-9 place-items-center rounded-full bg-gold-100 text-gold-600"><Icon aria-hidden className="size-4" /></span>{t}</li>
              ))}
            </ul>
          </div>
          {import.meta.env.DEV && (
            <div className="mt-8 border-t border-gold-400/40 pt-4 text-sm">
              <p className="mb-2 text-ink/60">Dev login (seed users)</p>
              <div className="flex flex-wrap gap-2">
                {devUsers.map((e) => (
                  <button key={e} onClick={() => devLogin(e)} className="rounded-lg border px-2 py-1 hover:bg-gold-100">
                    {e.split("@")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-10 text-center text-xs text-ink/50">
            <a href="/privacy" className="hover:underline">Privacy</a> · <a href="/terms" className="hover:underline">Terms</a> · <a href="/" className="hover:underline">Hisab home</a>
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
