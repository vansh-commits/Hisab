import type { Me } from "@hisab/api";
import { useState } from "react";
import { NavLink, Outlet, redirect, useLocation, useNavigate, useNavigation, useRouteLoaderData } from "react-router";
import { AppShellSkeleton, PageSkeleton } from "../components/skeleton";
import { Tour } from "../components/tour";
import { BookOpen, ChartColumn, ChevronDown, CircleHelp, Coins, Gem, House, LogOut, Plus, Receipt, Settings, TrendingUp, type LucideIcon } from "lucide-react";
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
  return <AppShellSkeleton path={useLocation().pathname} />;
}

// Brand: the shop's logo (or initials) × Hisab — the shop comes first, it's their app.
function Brand({ me, compact = false }: { me: Me; compact?: boolean }) {
  const b = me.business;
  const [broken, setBroken] = useState(false);
  const name = b?.trade_name ?? "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "H";
  const box = compact ? "size-9 rounded-lg text-sm" : "size-11 rounded-xl text-base";
  return (
    <NavLink to="/app" className="group flex min-w-0 items-center gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600" aria-label={`${name} × Hisab — home`}>
      {b?.logo_id && !broken ? (
        <img src={`/api/logos/${b.logo_id}`} alt="" onError={() => setBroken(true)} className={`${box} shrink-0 border border-gold-400/40 bg-white object-contain p-0.5 transition group-hover:scale-105`} />
      ) : (
        <span className={`${box} grid shrink-0 place-items-center bg-gradient-to-br from-gold-400 to-gold-600 font-semibold text-white shadow-sm transition group-hover:scale-105`} aria-hidden>{initials}</span>
      )}
      <span className="text-ink/40" aria-hidden>×</span>
      <span className={`font-display font-semibold text-gold-600 ${compact ? "text-2xl" : "text-3xl"}`}>Hisab</span>
    </NavLink>
  );
}

// Body swaps in a page-shaped skeleton while the next page's data loads; same-page refreshes just dim.
// Each new page fades/slides in (keyed by path) so moving around feels continuous.
function Body() {
  const nav = useNavigation();
  const here = useLocation();
  if (nav.state === "loading" && nav.location.pathname !== here.pathname) return <PageSkeleton path={nav.location.pathname} />;
  return (
    <div key={here.pathname} className={`page-in transition-opacity duration-200 ${nav.state === "loading" ? "opacity-60" : ""}`}>
      <Outlet />
    </div>
  );
}

type Link = { to: string; label: string; icon: LucideIcon; tour?: string; end?: boolean };

// Sidebar (desktop) groups everything about the business; phones get a bottom tab bar + "More".
// data-tour marks what the guided tour spotlights.
const SIDEBAR: { title?: string; links: Link[] }[] = [
  { links: [{ to: "/app", label: "Home", icon: House, end: true, tour: "home" }] },
  {
    title: "Billing",
    links: [
      { to: "/app/bills/new", label: "New bill", icon: Plus, tour: "new-bill" },
      { to: "/app/bills", label: "All bills", icon: Receipt, end: true, tour: "bills" },
      { to: "/app/old-gold", label: "Old gold", icon: Coins, tour: "old-gold" },
    ],
  },
  {
    title: "Business",
    links: [
      { to: "/app/customers", label: "Customers (khata)", icon: BookOpen, tour: "customers" },
      { to: "/app/items", label: "Particulars", icon: Gem, tour: "items" },
      { to: "/app/rates", label: "Today's rates", icon: TrendingUp, tour: "rates" },
      { to: "/app/reports", label: "Reports", icon: ChartColumn, tour: "reports" },
      { to: "/app/settings", label: "Settings", icon: Settings, tour: "settings" },
    ],
  },
];

const TABS: (Link & { primary?: boolean })[] = [
  { to: "/app", label: "Home", icon: House, end: true, tour: "home" },
  { to: "/app/bills", label: "Bills", icon: Receipt, end: true, tour: "bills" },
  { to: "/app/bills/new", label: "New bill", icon: Plus, primary: true, tour: "new-bill" },
  { to: "/app/customers", label: "Khata", icon: BookOpen, tour: "customers" },
  { to: "/app/items", label: "Particulars", icon: Gem, tour: "items" },
];
const MORE: Link[] = [
  { to: "/app/old-gold", label: "Old gold", icon: Coins, tour: "old-gold" },
  { to: "/app/rates", label: "Today's rates", icon: TrendingUp, tour: "rates" },
  { to: "/app/reports", label: "Reports", icon: ChartColumn, tour: "reports" },
  { to: "/app/settings", label: "Settings", icon: Settings, tour: "settings" },
];

const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600";

export default function AppLayout({ loaderData: me }: Route.ComponentProps) {
  const navigate = useNavigate();
  const inApp = me.business?.status === "active" || me.business?.status === "suspended";
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    navigate("/login");
  }
  const side = ({ isActive }: { isActive: boolean }) =>
    `group relative flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] transition-colors duration-150 ${ring} ${
      isActive ? "bg-gold-600 font-semibold text-white shadow-sm" : "text-ink/75 hover:bg-gold-100 hover:text-ink"
    }`;
  const tourLink = `${side({ isActive: false })} w-full text-left`;

  if (!inApp) {
    // Waitlist / onboarding: a plain header, no business navigation yet.
    return (
      <div className="min-h-dvh">
        <header className="flex items-center justify-between border-b border-gold-400/40 bg-white px-4 py-3">
          <span className="font-display text-2xl font-semibold text-gold-600">Hisab</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink/70 sm:inline">{me.user.email}</span>
            <button onClick={logout} className={`cursor-pointer rounded-lg px-3 py-2 hover:bg-gold-100 ${ring}`}>Logout</button>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6"><Body /></main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-gold-400/40 bg-white px-3 py-4 md:flex print:hidden">
        <div className="px-2"><Brand me={me} /></div>
        <p className="mb-4 mt-2 truncate px-3 text-sm font-semibold text-ink/70">{me.business?.trade_name}</p>
        <nav className="flex-1 space-y-5 overflow-y-auto" aria-label="Main">
          {SIDEBAR.map((g, i) => (
            <div key={i}>
              {g.title && <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-ink/50">{g.title}</div>}
              <div className="space-y-0.5">
                {g.links.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={side} data-tour={l.tour}>
                    <l.icon aria-hidden className="size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-110" strokeWidth={2} />
                    {l.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-gold-400/40 pt-3">
          <NavLink to="/app?tour=1" className={tourLink} data-tour="help">
            <CircleHelp aria-hidden className="size-[18px]" /> How to use Hisab
          </NavLink>
          <button onClick={logout} className={tourLink}>
            <LogOut aria-hidden className="size-[18px]" /> Logout
          </button>
          <p className="truncate px-3 pt-1 text-xs text-ink/50" title={me.user.email}>{me.user.email}</p>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gold-400/40 bg-white/90 px-4 py-2 backdrop-blur md:hidden print:hidden">
          <Brand me={me} compact />
          <span className="flex-1" />
          <details className="group relative" data-tour="more">
            <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-3 hover:bg-gold-100 ${ring}`}>
              More <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="pop-in absolute right-0 z-30 mt-1 grid w-56 rounded-2xl border border-gold-400/40 bg-white p-1.5 shadow-xl">
              {MORE.map((n) => (
                <NavLink key={n.to} to={n.to} className={side} data-tour={n.tour} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>
                  <n.icon aria-hidden className="size-[18px]" /> {n.label}
                </NavLink>
              ))}
              <NavLink to="/app?tour=1" className={tourLink} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>
                <CircleHelp aria-hidden className="size-[18px]" /> How to use Hisab
              </NavLink>
              <button onClick={logout} className={tourLink}><LogOut aria-hidden className="size-[18px]" /> Logout</button>
            </div>
          </details>
        </header>
        {me.business?.status === "suspended" && (
          <p className="bg-maroon-700 px-4 py-2 text-center text-sm text-white">Account suspended — you can view and download old bills, but can't create new ones.</p>
        )}
        <main className="mx-auto max-w-5xl px-4 py-6 pb-28 md:px-8 md:pb-10">
          <Body />
        </main>
      </div>

      <Tour />
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-gold-400/40 bg-white/95 pb-[env(safe-area-inset-bottom)] text-[11px] backdrop-blur md:hidden print:hidden">
        {TABS.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} data-tour={n.tour}
            className={({ isActive }) => `relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 transition-colors ${ring} ${isActive ? "font-semibold text-gold-600" : "text-ink/60"}`}>
            {({ isActive }) => (
              <>
                {n.primary ? (
                  <span className="grid size-11 place-items-center rounded-2xl bg-gold-600 text-white shadow-md shadow-gold-600/30 transition active:scale-95"><n.icon aria-hidden className="size-6" /></span>
                ) : (
                  <n.icon aria-hidden className={`size-[22px] transition-transform ${isActive ? "scale-110" : ""}`} strokeWidth={isActive ? 2.4 : 2} />
                )}
                {!n.primary && n.label}
                {isActive && !n.primary && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold-600" aria-hidden />}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
