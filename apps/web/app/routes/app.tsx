import type { Me } from "@hisab/api";
import { NavLink, Outlet, redirect, useLocation, useNavigate, useRouteLoaderData } from "react-router";
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

const NAV = [
  { to: "/app", label: "Home", icon: "🏠", end: true },
  { to: "/app/bills", label: "Bills", icon: "🧾" },
  { to: "/app/bills/new", label: "New bill", icon: "➕", primary: true },
  { to: "/app/customers", label: "Khata", icon: "📒" },
  { to: "/app/reports", label: "Reports", icon: "📊" },
];
const MORE = [
  { to: "/app/old-gold", label: "Old gold" },
  { to: "/app/rates", label: "Today's rates" },
  { to: "/app/settings", label: "Settings" },
];

export default function AppLayout({ loaderData: me }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inApp = me.business?.status === "active" || me.business?.status === "suspended";
  const wide = pathname.startsWith("/app/bills") || pathname.startsWith("/app/reports") || pathname.startsWith("/app/customers");
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    navigate("/login");
  }
  const link = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 ${isActive ? "bg-gold-100 font-semibold" : "hover:bg-gold-100"}`;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gold-400/40 bg-white/95 px-4 py-2 backdrop-blur print:hidden">
        <NavLink to="/app" className="font-display text-2xl font-semibold text-gold-600">Hisab</NavLink>
        {inApp && (
          <nav className="hidden flex-1 gap-1 text-sm md:flex">
            {[...NAV, ...MORE].map((n) => (
              <NavLink key={n.to} to={n.to} end={"end" in n} className={link}>{n.label}</NavLink>
            ))}
          </nav>
        )}
        <span className="flex-1 md:hidden" />
        {inApp && (
          <details className="relative md:hidden">
            <summary className="list-none rounded-lg px-3 py-2 hover:bg-gold-100">More ▾</summary>
            <div className="absolute right-0 mt-1 grid w-44 rounded-xl border border-gold-400/40 bg-white p-1 shadow-lg">
              {MORE.map((n) => (
                <NavLink key={n.to} to={n.to} className={link} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}>{n.label}</NavLink>
              ))}
            </div>
          </details>
        )}
        <span className="hidden max-w-40 truncate text-sm text-ink/60 lg:inline">{me.user.email}</span>
        <button onClick={logout} className="rounded-lg px-3 py-2 text-sm hover:bg-gold-100">Logout</button>
      </header>
      {me.business?.status === "suspended" && (
        <p className="bg-maroon-700 px-4 py-2 text-center text-sm text-white">Account suspended — you can view and download old bills, but can't create new ones.</p>
      )}
      <main className={`mx-auto px-4 py-6 ${inApp ? "pb-24 md:pb-6" : ""} ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <Outlet />
      </main>
      {inApp && (
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-gold-400/40 bg-white pb-[env(safe-area-inset-bottom)] text-xs md:hidden print:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={"end" in n || n.to === "/app/bills"}
              className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 ${n.primary ? "font-semibold text-gold-600" : ""} ${isActive ? "bg-gold-100" : ""}`}>
              <span aria-hidden className="text-lg">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
