import type { ComponentProps, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...p }: ComponentProps<"button"> & { variant?: "primary" | "ghost" }) {
  const base = "min-h-12 rounded-xl px-5 font-semibold transition disabled:opacity-50";
  const look =
    variant === "primary"
      ? "bg-gold-600 text-white hover:bg-maroon-700"
      : "border border-gold-400 text-ink hover:bg-gold-100";
  return <button className={`${base} ${look} ${className}`} {...p} />;
}

// Field: label + input + error/hint, sized for thumbs (≥ 48 px).
export function Field({ label, error, hint, prefix, ...p }: ComponentProps<"input"> & { label: string; error?: string | null; hint?: ReactNode; prefix?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <span className={`flex min-h-12 items-center rounded-xl border bg-white px-3 focus-within:ring-2 focus-within:ring-gold-400 ${error ? "border-maroon-700" : "border-gold-400/60"}`}>
        {prefix && <span className="mr-2 text-ink/60">{prefix}</span>}
        <input className="w-full bg-transparent py-3 outline-none" aria-invalid={!!error} {...p} />
      </span>
      {error ? <span className="mt-1 block text-sm text-maroon-700">{error}</span> : hint && <span className="mt-1 block text-sm text-ink/60">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gold-400/40 bg-white p-5 shadow-sm sm:p-8 ${className}`}>{children}</div>;
}
