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

const box = "w-full min-h-12 rounded-xl border border-gold-400/60 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-gold-400";

export function Select({ label, error, children, className = "", ...p }: ComponentProps<"select"> & { label: string; error?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select className={box} {...p}>{children}</select>
      {error && <span className="mt-1 block text-sm text-maroon-700">{error}</span>}
    </label>
  );
}

export function TextArea({ label, ...p }: ComponentProps<"textarea"> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <textarea className={box} rows={3} {...p} />
    </label>
  );
}

export function Check({ label, ...p }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-xl border border-gold-400/40 bg-white px-3">
      <input type="checkbox" className="size-5 accent-gold-600" {...p} />
      <span>{label}</span>
    </label>
  );
}

const STATUS: Record<string, string> = {
  draft: "bg-ink/10 text-ink",
  issued: "bg-green-100 text-green-900",
  cancelled: "bg-maroon-700/10 text-maroon-700",
  paid: "bg-green-100 text-green-900",
  partial: "bg-gold-100 text-gold-600",
  due: "bg-maroon-700/10 text-maroon-700",
};

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[kind] ?? "bg-ink/10"}`}>{children}</span>;
}

export function PageTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-3xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-gold-400/60 p-6 text-center text-ink/60">{children}</p>;
}

// LinkButton styles a react-router <Link> like a Button.
export const btn = {
  primary: "inline-flex min-h-12 items-center justify-center rounded-xl bg-gold-600 px-5 font-semibold text-white hover:bg-maroon-700",
  ghost: "inline-flex min-h-12 items-center justify-center rounded-xl border border-gold-400 px-5 font-semibold text-ink hover:bg-gold-100",
};
