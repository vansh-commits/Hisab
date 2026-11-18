import type { Me } from "@hisab/api";
import { Outlet, redirect, useNavigate, useRouteLoaderData } from "react-router";
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

export function HydrateFallback() {
  return <p className="p-8 text-center text-ink/60">Loading…</p>;
}

export default function AppLayout({ loaderData: me }: Route.ComponentProps) {
  const navigate = useNavigate();
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    navigate("/login");
  }
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-gold-400/40 bg-white px-4 py-3">
        <span className="font-display text-2xl font-semibold text-gold-600">Hisab</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-ink/70 sm:inline">{me.user.email}</span>
          <button onClick={logout} className="rounded-lg px-3 py-2 hover:bg-gold-100">
            Logout
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
