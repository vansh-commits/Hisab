import { useState } from "react";

// Phase 0 checks 1 & 2: cookie through the Vercel rewrite, and rewrite latency.
export default function Debug() {
  const [log, setLog] = useState<string[]>([]);

  async function call(method: "GET" | "POST") {
    const t0 = performance.now();
    try {
      const res = await fetch("/api/debug/cookie", { method });
      const body = await res.text();
      const ms = Math.round(performance.now() - t0);
      setLog((l) => [`${method} ${res.status} in ${ms} ms → ${body}`, ...l]);
    } catch (e) {
      setLog((l) => [`${method} failed: ${String(e)}`, ...l]);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Phase 0 debug</h1>
      <div className="mt-6 flex gap-3">
        <button className="rounded bg-gold-600 px-4 py-2 text-white" onClick={() => call("POST")}>1. Set cookie</button>
        <button className="rounded border border-gold-600 px-4 py-2" onClick={() => call("GET")}>2. Read cookie</button>
      </div>
      <pre className="money mt-6 whitespace-pre-wrap text-sm">{log.join("\n")}</pre>
    </main>
  );
}
