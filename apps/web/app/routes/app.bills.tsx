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
      <Form className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5" method="get">
        <input name="q" placeholder="Search name or bill no" defaultValue={params.get("q") ?? ""} className={`${input} col-span-2`} />
        <select name="status" defaultValue={params.get("status") ?? ""} className={input}>
          <option value="">All</option>
          <option value="issued">Issued</option>
          <option value="draft">Drafts</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="date" name="from" defaultValue={params.get("from") ?? ""} className={input} aria-label="From date" />
        <input type="date" name="to" defaultValue={params.get("to") ?? ""} className={`${input} max-sm:col-span-1`} aria-label="To date" />
        <button className={`${btn.ghost} col-span-2 sm:col-span-5`}>Filter</button>
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
