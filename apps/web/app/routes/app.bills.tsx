import type { InvoiceRow, Page } from "@hisab/api";
import { Form, Link, useSearchParams } from "react-router";
import { BillRows } from "../components/bills";
import { btn, Empty, PageTitle } from "../components/ui";
import { api } from "../lib/api";
import type { Route } from "./+types/app.bills";

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const q = new URL(request.url).searchParams;
  const p = new URLSearchParams();
  for (const k of ["q", "status", "from", "to", "cursor", "party_id"]) if (q.get(k)) p.set(k, q.get(k)!);
  return api<Page<InvoiceRow>>(`/invoices?${p}`);
}

export default function Bills({ loaderData: page }: Route.ComponentProps) {
  const [params, setParams] = useSearchParams();
  const input = "min-h-12 rounded-xl border border-gold-400/60 bg-white px-3";
  return (
    <>
      <PageTitle title="Bills" action={<Link to="/app/bills/new" className={btn.primary}>+ New bill</Link>} />
      <div className="mb-3 flex flex-wrap gap-2" role="tablist">
        {[["", "All"], ["issued", "Issued"], ["draft", "Drafts"], ["cancelled", "Cancelled"]].map(([v, l]) => {
          const on = (params.get("status") ?? "") === v;
          return (
            <button key={v} role="tab" aria-selected={on}
              className={`rounded-full border px-4 py-2 text-sm ${on ? "border-gold-600 bg-gold-600 text-white" : "border-gold-400 bg-white"}`}
              onClick={() => { const p = new URLSearchParams(params); p.delete("cursor"); if (v) p.set("status", v!); else p.delete("status"); setParams(p); }}>
              {l}
            </button>
          );
        })}
      </div>
      <Form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" method="get">
        <input type="hidden" name="status" value={params.get("status") ?? ""} />
        <input name="q" placeholder="Search name or bill no" defaultValue={params.get("q") ?? ""} className={`${input} col-span-2`} />
        <input type="date" name="from" defaultValue={params.get("from") ?? ""} className={input} aria-label="From date" />
        <input type="date" name="to" defaultValue={params.get("to") ?? ""} className={input} aria-label="To date" />
        <button className={`${btn.ghost} col-span-2 sm:col-span-4`}>Search</button>
      </Form>
      {page.items.length ? <BillRows rows={page.items} /> : <Empty>No bills match.</Empty>}
      <div className="mt-4 flex justify-between">
        {params.get("cursor") ? (
          <button className="text-gold-600 underline" onClick={() => { params.delete("cursor"); setParams(params); }}>← Newest</button>
        ) : <span />}
        {page.next_cursor && (
          <button className="text-gold-600 underline" onClick={() => { params.set("cursor", page.next_cursor!); setParams(params); }}>Older →</button>
        )}
      </div>
    </>
  );
}
