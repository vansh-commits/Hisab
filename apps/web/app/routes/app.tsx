import type { Me } from "@hisab/api";
import { NavLink, Outlet, redirect, useNavigate, useRouteLoaderData } from "react-router";
import { Tour } from "../components/tour";
import { api, ApiError } from "../lib/api";
import type { Route } from "./+types/app";

// Where each business status belongs. Everything under /app is gated by this.
function homeFor(me: Me): string {
  switch (me.business?.status) {
    case undefined:
    case "pending":
    case "rejected":
      return "/app/waitlist";
    case "approved":
      return "/app/onboarding";
    default:
      return "/app";
  }
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const url = new URL(request.url);
  let me: Me;
  try {
    me = await api<Me>("/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      throw redirect(`/login?return_to=${encodeURIComponent(url.pathname)}`);
    }
    throw e;
  }
  const home = homeFor(me);
  const gated = url.pathname === "/app/waitlist" || url.pathname === "/app/onboarding";
  if (home !== "/app" ? !url.pathname.startsWith(home) : gated) throw redirect(home);
  return me;
}

export function useMe(): Me {
  return useRouteLoaderData("routes/app") as Me;
}

export const readOnly = (me: Me) => me.business?.status === "suspended";

export function HydrateFallback() {
  return <p className="p-8 text-center text-ink/60">Loading…</p>;
}

// Sidebar (desktop) groups everything about the business; phones get a bottom tab bar + "More".
const SIDEBAR: { title?: string; links: { to: string; label: string; icon: string; end?: boolean }[] }[] = [
  { links: [{ to: "/app", label: "Home", icon: "🏠", end: true }] },
  {
    title: "Billing",
    links: [
      { to: "/app/bills/new", label: "New bill", icon: "➕" },
      { to: "/app/bills", label: "All bills", icon: "🧾", end: true },
      { to: "/app/old-gold", label: "Old gold", icon: "🪙" },
    ],
  },
  {
    title: "Business",
    links: [
      { to: "/app/customers", label: "Customers (khata)", icon: "📒" },
      { to: "/app/items", label: "Particulars", icon: "💍" },
      { to: "/app/rates", label: "Today's rates", icon: "📈" },
      { to: "/app/reports", label: "Reports", icon: "📊" },
      { to: "/app/settings", label: "Settings", icon: "⚙️" },
      { to: "/app?tour=1", label: "How to use Hisab", icon: "❓", end: true },
    ],
  },
];

const TABS = [
  { to: "/app", label: "Home", icon: "🏠", end: true },
  { to: "/app/bills", label: "Bills", icon: "🧾", end: true },
  { to: "/app/bills/new", label: "New bill", icon: "➕", primary: true },
  { to: "/app/customers", label: "Khata", icon: "📒" },
  { to: "/app/items", label: "Particulars", icon: "💍" },
];
const MORE = [
  { to: "/app/old-gold", label: "Old gold" },
  { to: "/app/rates", label: "Today's rates" },
  { to: "/app/reports", label: "Reports" },
  { to: "/app/settings", label: "Settings" },
  { to: "/app?tour=1", label: "How to use Hisab" },
];

export default function AppLayout({ loaderData: me }: Route.ComponentProps) {
  const navigate = useNavigate();

  const inApp = me.business?.status === "active" || me.business?.status === "suspended";
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    navigate("/login");
  }
  const side = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${isActive ? "bg-gold-600 font-semibold text-white" : "text-ink/80 hover:bg-gold-100"}`;
  const more = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 ${isActive ? "bg-gold-100 font-semibold" : "hover:bg-gold-100"}`;

  if (!inApp) {
    // Waitlist / onboarding: a plain header, no business navigation yet.
    return (
      <div className="min-h-dvh">
        <header className="flex items-center justify-between border-b border-gold-400/40 bg-white px-4 py-3">
          <span className="font-display text-2xl font-semibold text-gold-600">Hisab</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink/70 sm:inline">{me.user.email}</span>
            <button onClick={logout} className="rounded-lg px-3 py-2 hover:bg-gold-100">Logout</button>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6"><Outlet /></main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-gold-400/40 bg-white px-3 py-4 md:flex print:hidden">
        <NavLink to="/app" className="px-3 font-display text-3xl font-semibold text-gold-600">Hisab</NavLink>
        <p className="mb-4 truncate px-3 text-sm text-ink/60">{me.business?.trade_name}</p>
        <nav className="flex-1 space-y-4 overflow-y-auto">
          {SIDEBAR.map((g, i) => (
            <div key={i}>
              {g.title && <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-ink/40">{g.title}</div>}
              <div className="space-y-0.5">
                {g.links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={l.to.includes("?") ? side({ isActive: false }) : side}>
                    <span aria-hidden className="w-5 text-center">{l.icon}</span>{l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-gold-400/40 pt-3">
          <p className="truncate px-3 text-xs text-ink/60" title={me.user.email}>{me.user.email}</p>
          <button onClick={logout} className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-gold-100">Logout</button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gold-400/40 bg-white/95 px-4 py-2 backdrop-blur md:hidden print:hidden">
          <NavLink to="/app" className="font-display text-2xl font-semibold text-gold-600">Hisab</NavLink>
          <span className="flex-1" />
          <details className="relative">
            <summary className="list-none rounded-lg px-3 py-2 hover:bg-gold-100">More ▾</summary>
            <div className="absolute right-0 z-30 mt-1 grid w-48 rounded-xl border border-gold-400/40 bg-white p-1 shadow-lg">
              {MORE.map((n) => (
                <NavLink key={n.to} to={n.to} className={n.to.includes("?") ? more({ isActive: false }) : more} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>{n.label}</NavLink>
              ))}
              <button onClick={logout} className="rounded-lg px-3 py-2 text-left hover:bg-gold-100">Logout</button>
            </div>
          </details>
        </header>
        {me.business?.status === "suspended" && (
          <p className="bg-maroon-700 px-4 py-2 text-center text-sm text-white">Account suspended — you can view and download old bills, but can't create new ones.</p>
        )}
        <main className="mx-auto max-w-5xl px-4 py-6 pb-24 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>

      <Tour />
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-gold-400/40 bg-white pb-[env(safe-area-inset-bottom)] text-xs md:hidden print:hidden">
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 ${n.primary ? "font-semibold text-gold-600" : ""} ${isActive ? "bg-gold-100" : ""}`}>
            <span aria-hidden className="text-lg">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
