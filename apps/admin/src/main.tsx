import type { AuditRow, BusinessRow, Page } from "@hisab/api";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  Link,
  NavLink,
  Outlet,
  RouterProvider,
  useLoaderData,
  useNavigate,
  useNavigation,
  useRevalidator,
  useRouteError,
  useSearchParams,
  type LoaderFunctionArgs,
} from "react-router";
import { api, ApiError, fmtDate } from "./api";
import "./style.css";

type AdminMe = { email: string; name: string };

const meLoader = () => api<AdminMe>("/admin/me");

function Layout() {
  const me = useLoaderData() as AdminMe;
  const navigate = useNavigate();
  return (
    <>
      <header>
        <b>Hisab Admin</b>
        <nav>
          <NavLink to="/" end>Queue</NavLink>
          <NavLink to="/clients">Clients</NavLink>
          <NavLink to="/metrics">Metrics</NavLink>
          <NavLink to="/audit">Audit</NavLink>
        </nav>
        <span className="muted">{me.email}</span>
        <button onClick={async () => { await api("/admin/auth/logout", { method: "POST" }); navigate(0); }}>Logout</button>
      </header>
      <main>{useNavigation().state === "loading" ? <Skeleton /> : <Outlet />}</main>
    </>
  );
}

// Skeleton: placeholder table while a page's data loads.
function Skeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="bone" style={{ width: 220, height: 26, marginBottom: 16 }} />
      <div className="bone" style={{ width: "100%", height: 36, marginBottom: 12 }} />
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="bone" style={{ width: "100%", height: 44, marginBottom: 6 }} />)}
    </div>
  );
}

function Login() {
  const err = new URLSearchParams(location.search).get("error");
  async function dev() {
    const r = await fetch("/api/dev/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@example.com", admin: true }) });
    if (!r.ok) alert("Add admin@example.com to ADMIN_EMAILS in .env");
    location.href = "/admin/";
  }
  return (
    <main className="login">
      <h1>Hisab Admin</h1>
      {err && <p className="error">{err === "not_allowed" ? "This Google account is not an admin." : `Login failed (${err}).`}</p>}
      <a className="btn" href="/api/admin/auth/google/start">Continue with Google</a>
      {import.meta.env.DEV && <button onClick={dev}>Dev login as admin@example.com</button>}
    </main>
  );
}

// ── Queue & clients share one table (same endpoint shape) ─────────────────

function listLoader(path: string, defaultStatus: string) {
  return ({ request }: LoaderFunctionArgs) => {
    const p = new URL(request.url).searchParams;
    const q = new URLSearchParams();
    const status = p.get("status") ?? defaultStatus;
    if (status) q.set("status", status);
    if (p.get("q")) q.set("q", p.get("q")!);
    if (p.get("cursor")) q.set("cursor", p.get("cursor")!);
    return api<Page<BusinessRow>>(`${path}?${q}`);
  };
}

function Filters({ statuses, defaultStatus }: { statuses: string[]; defaultStatus: string }) {
  const [params, setParams] = useSearchParams();
  return (
    <form className="filters" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setParams({ status: String(f.get("status")), q: String(f.get("q")) }); }}>
      <select name="status" defaultValue={params.get("status") ?? defaultStatus}>
        {statuses.map((s) => <option key={s} value={s}>{s || "all"}</option>)}
      </select>
      <input name="q" placeholder="Search business / email" defaultValue={params.get("q") ?? ""} />
      <button>Filter</button>
    </form>
  );
}

function Pager({ next }: { next: string | null }) {
  const [params, setParams] = useSearchParams();
  return (
    <p className="pager">
      {params.get("cursor") && <button onClick={() => { params.delete("cursor"); setParams(params); }}>⟵ First page</button>}
      {next && <button onClick={() => { params.set("cursor", next); setParams(params); }}>Next page ⟶</button>}
    </p>
  );
}

function Queue() {
  const page = useLoaderData() as Page<BusinessRow>;
  const { revalidate } = useRevalidator();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [mail, setMail] = useState<Record<string, boolean>>({});
  async function act(id: string, action: "approve" | "reject" | "resend-email") {
    try {
      const r = await api<{ email_sent: boolean }>(`/admin/applications/${id}/${action}`, { method: "POST", body: action === "resend-email" ? undefined : { note: notes[id] ?? "" } });
      setMail((m) => ({ ...m, [id]: r.email_sent }));
      revalidate();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  return (
    <>
      <h1>Applications</h1>
      <Filters statuses={["pending", "rejected", "approved", ""]} defaultStatus="pending" />
      <table>
        <thead><tr><th>Business</th><th>Owner</th><th>Contact</th><th>GSTIN</th><th>Applied</th><th>Status</th><th>Review</th></tr></thead>
        <tbody>
          {page.items.map((b) => (
            <tr key={b.id}>
              <td><Link to={`/clients/${b.id}`}>{b.applicant_business_name}</Link><div className="muted">{b.applicant_city}</div></td>
              <td>{b.applicant_owner_name}</td>
              <td>{b.owner_email}<div className="muted">{b.applicant_phone}</div></td>
              <td className="mono">{b.applicant_gstin ?? "—"}</td>
              <td>{fmtDate(b.applied_at)}</td>
              <td>
                <span className={`badge ${b.status}`}>{b.status}</span>
                {b.id in mail && <span className={`badge ${mail[b.id] ? "approved" : "rejected"}`}>{mail[b.id] ? "email sent" : "email failed"}</span>}
              </td>
              <td className="actions">
                {(b.status === "pending" || b.status === "rejected") && (
                  <>
                    <input placeholder="Note (optional)" value={notes[b.id] ?? ""} onChange={(e) => setNotes({ ...notes, [b.id]: e.target.value })} />
                    <button onClick={() => act(b.id, "approve")}>Approve</button>
                    {b.status === "pending" && <button onClick={() => act(b.id, "reject")}>Reject</button>}
                  </>
                )}
                <button className="link" onClick={() => act(b.id, "resend-email")}>Resend email</button>
              </td>
            </tr>
          ))}
          {!page.items.length && <tr><td colSpan={7} className="muted">Nothing here.</td></tr>}
        </tbody>
      </table>
      <Pager next={page.next_cursor} />
    </>
  );
}

function Clients() {
  const page = useLoaderData() as Page<BusinessRow>;
  return (
    <>
      <h1>Clients</h1>
      <Filters statuses={["active", "approved", "suspended", ""]} defaultStatus="active" />
      <table>
        <thead><tr><th>Business</th><th>Owner email</th><th>Status</th><th>Reviewed</th></tr></thead>
        <tbody>
          {page.items.map((b) => (
            <tr key={b.id}>
              <td><Link to={`/clients/${b.id}`}>{b.trade_name ?? b.applicant_business_name}</Link></td>
              <td>{b.owner_email}</td>
              <td><span className={`badge ${b.status}`}>{b.status}</span></td>
              <td>{fmtDate(b.reviewed_at)}</td>
            </tr>
          ))}
          {!page.items.length && <tr><td colSpan={4} className="muted">Nothing here.</td></tr>}
        </tbody>
      </table>
      <Pager next={page.next_cursor} />
    </>
  );
}

type Detail = { business: BusinessRow & { owner_name: string }; last_active: string | null; audit: AuditRow[] };

function ClientDetail() {
  const d = useLoaderData() as Detail;
  const { revalidate } = useRevalidator();
  const b = d.business;
  async function post(path: string, body?: unknown) {
    try {
      await api(`/admin/clients/${b.id}/${path}`, { method: "POST", body });
      revalidate();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  return (
    <>
      <h1>{b.trade_name ?? b.applicant_business_name} <span className={`badge ${b.status}`}>{b.status}</span></h1>
      <dl className="detail">
        <dt>Owner</dt><dd>{b.applicant_owner_name} · {b.owner_email} · {b.applicant_phone}</dd>
        <dt>City</dt><dd>{b.applicant_city}</dd>
        <dt>GSTIN</dt><dd className="mono">{b.applicant_gstin ?? "—"}</dd>
        <dt>Applied</dt><dd>{fmtDate(b.applied_at)}</dd>
        <dt>Reviewed</dt><dd>{fmtDate(b.reviewed_at)} {b.reviewed_by && `by ${b.reviewed_by}`} {b.review_note && `— “${b.review_note}”`}</dd>
        <dt>Last active</dt><dd>{fmtDate(d.last_active)}</dd>
        {b.suspend_reason && <><dt>Suspended</dt><dd>{b.suspend_reason}</dd></>}
      </dl>
      {(b.status === "active" || b.status === "approved") && (
        <button onClick={() => { const reason = prompt("Reason for suspension?"); if (reason) post("suspend", { reason }); }}>Suspend</button>
      )}
      {b.status === "suspended" && <button onClick={() => post("reactivate")}>Reactivate</button>}
      <h2>Recent activity</h2>
      <AuditTable rows={d.audit} />
    </>
  );
}

function Metrics() {
  const m = useLoaderData() as { by_status: Record<string, number>; db_size_bytes: number; db_cap_bytes: number; invoices_issued?: Record<string, number> };
  const pct = ((m.db_size_bytes / m.db_cap_bytes) * 100).toFixed(1);
  return (
    <>
      <h1>Metrics</h1>
      <div className="cards">
        {["pending", "approved", "active", "suspended", "rejected"].map((s) => (
          <div key={s} className="card"><div className="muted">{s}</div><b>{m.by_status[s] ?? 0}</b></div>
        ))}
        <div className="card"><div className="muted">Bills issued (7 d)</div><b>{m.invoices_issued?.["7d"] ?? 0}</b></div>
        <div className="card"><div className="muted">Bills issued (30 d)</div><b>{m.invoices_issued?.["30d"] ?? 0}</b></div>
        <div className="card"><div className="muted">DB size</div><b>{(m.db_size_bytes / 2 ** 20).toFixed(1)} MB</b><div className="muted">{pct}% of 1 GB</div></div>
      </div>
    </>
  );
}

function Audit() {
  const page = useLoaderData() as Page<AuditRow>;
  const [params, setParams] = useSearchParams();
  return (
    <>
      <h1>Audit log</h1>
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setParams({ action: String(new FormData(e.currentTarget).get("action")) }); }}>
        <input name="action" placeholder="action, e.g. business.approved" defaultValue={params.get("action") ?? ""} />
        <button>Filter</button>
      </form>
      <AuditTable rows={page.items} />
      <Pager next={page.next_cursor} />
    </>
  );
}

function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <table>
      <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Business</th><th>Data</th></tr></thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td>{fmtDate(a.at)}</td>
            <td>{a.actor_type} {a.actor_email && <span className="muted">{a.actor_email}</span>}</td>
            <td className="mono">{a.action}</td>
            <td>{a.business_id && <Link to={`/clients/${a.business_id}`}>open</Link>}</td>
            <td className="mono small">{JSON.stringify(a.data)}</td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={5} className="muted">No activity.</td></tr>}
      </tbody>
    </table>
  );
}

function ErrorPage() {
  // Any loader 401/403 (no admin session, or no longer on the allowlist) lands here.
  const e = useRouteError();
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return <Login />;
  return <main><p className="error">Something went wrong loading this page. <a href="/admin/">Reload</a></p></main>;
}

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      loader: meLoader,
      HydrateFallback: () => <main><Skeleton /></main>,
      errorElement: <ErrorPage />,
      children: [
        { index: true, element: <Queue />, loader: listLoader("/admin/applications", "pending") },
        { path: "clients", element: <Clients />, loader: listLoader("/admin/clients", "active") },
        { path: "clients/:id", element: <ClientDetail />, loader: ({ params }) => api<Detail>(`/admin/clients/${params.id}`) },
        { path: "metrics", element: <Metrics />, loader: () => api("/admin/metrics") },
        {
          path: "audit",
          element: <Audit />,
          loader: ({ request }) => api(`/admin/audit${new URL(request.url).search}`),
        },
      ],
    },
  ],
  { basename: "/admin" },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
