import { useEffect, useState } from "react";
import { Card } from "../components/ui";

export function meta() {
  return [{ title: "Log in · Hisab" }];
}

const errors: Record<string, string> = {
  denied: "Google login was cancelled.",
  unverified: "Your Google email isn't verified.",
  expired: "Login took too long. Please try again.",
};

const devUsers = ["pending@example.com", "rejected@example.com", "approved@example.com", "suspended@example.com", "new@example.com"];

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <Card>
        <h1 className="font-display text-4xl font-semibold">Hisab</h1>
        <p className="mt-2 text-ink/70">GST billing for jewellers</p>
        {err && <p className="mt-4 rounded-lg bg-maroon-700/10 p-3 text-sm text-maroon-700">{errors[err] ?? "Login failed. Please try again."}</p>}
        <a
          href={`/api/auth/google/start?return_to=${encodeURIComponent(returnTo)}`}
          className="mt-6 flex min-h-12 items-center justify-center gap-3 rounded-xl border border-ink/20 bg-white px-5 font-medium hover:bg-gold-100"
        >
          <GoogleG /> Continue with Google
        </a>
        <p className="mt-3 text-center text-sm text-ink/60">Waitlist join karne ke liye bhi yahi.</p>
        {import.meta.env.DEV && (
          <div className="mt-6 border-t pt-4 text-sm">
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
      </Card>
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
