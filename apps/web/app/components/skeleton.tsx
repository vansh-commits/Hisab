// Skeletons: shape-alike placeholders shown while a page's data loads.
// Picked by URL so each screen gets a skeleton that looks like it.

export function Bone({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden />;
}

function Title({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <Bone className="h-9 w-48" />
      {action && <Bone className="h-12 w-32 rounded-xl" />}
    </div>
  );
}

function Rows({ n = 6, right = true }: { n?: number; right?: boolean }) {
  return (
    <div className="divide-y divide-gold-400/20 overflow-hidden rounded-2xl border border-gold-400/30 bg-white">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="flex-1 space-y-2">
            <Bone className="h-4 w-36" />
            <Bone className="h-3 w-52 max-w-full" />
          </div>
          {right && <Bone className="h-5 w-24" />}
        </div>
      ))}
    </div>
  );
}

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-gold-400/30 bg-white p-4 ${className}`}>{children}</div>;
}

function Fields({ n = 4 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Bone className="h-3 w-20" />
          <Bone className="h-12 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

const Dashboard = () => (
  <>
    <div className="mb-5 space-y-2"><Bone className="h-4 w-28" /><Bone className="h-9 w-64" /></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((i) => <Card key={i} className={i === 2 ? "col-span-2 sm:col-span-1" : ""}><Bone className="h-3 w-24" /><Bone className="mt-3 h-7 w-32" /><Bone className="mt-2 h-3 w-16" /></Card>)}
    </div>
    <Bone className="mt-6 h-5 w-40" />
    <div className="mt-3 flex gap-2">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-9 w-28 rounded-full" />)}</div>
    <Bone className="mt-6 h-5 w-32" />
    <div className="mt-3"><Rows n={4} /></div>
  </>
);

const List = ({ tabs = false }: { tabs?: boolean }) => (
  <>
    <Title />
    {tabs && <div className="mb-3 flex gap-2">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-9 w-20 rounded-full" />)}</div>}
    <Bone className="mb-4 h-12 w-full rounded-xl" />
    <Rows />
  </>
);

const BillEditor = () => (
  <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
    <div className="space-y-5">
      <div className="flex items-center justify-between"><Bone className="h-9 w-40" /><Bone className="h-12 w-44 rounded-xl" /></div>
      <Card><Bone className="mb-3 h-3 w-20" /><Bone className="h-12 w-full rounded-xl" /><div className="mt-3"><Fields n={2} /></div></Card>
      <Card><Bone className="mb-3 h-12 w-full rounded-xl" /><Fields n={6} /></Card>
      <Bone className="h-12 w-full rounded-xl" />
    </div>
    <Card className="h-fit space-y-3"><Bone className="h-4 w-3/4" /><Bone className="h-4 w-1/2" /><Bone className="h-8 w-full" /><Bone className="h-12 w-full rounded-xl" /></Card>
  </div>
);

const BillView = () => (
  <div className="space-y-5">
    <div className="flex items-start justify-between"><div className="space-y-2"><Bone className="h-9 w-48" /><Bone className="h-4 w-40" /></div><Bone className="h-12 w-32 rounded-xl" /></div>
    <Card className="space-y-3"><Bone className="h-4 w-24" /><Bone className="h-5 w-48" />{[0, 1, 2].map((i) => <Bone key={i} className="h-10 w-full" />)}<Bone className="ml-auto h-6 w-40" /></Card>
    <Card className="space-y-3"><Bone className="h-5 w-28" /><Bone className="h-10 w-full" /></Card>
  </div>
);

const Form = () => (
  <>
    <Bone className="mb-5 h-9 w-40" />
    <div className="mb-5 flex flex-wrap gap-2">{[0, 1, 2, 3, 4].map((i) => <Bone key={i} className="h-9 w-24 rounded-full" />)}</div>
    <Card><Fields n={6} /></Card>
    <Bone className="mt-5 h-12 w-full rounded-xl" />
  </>
);

const Report = () => (
  <>
    <Title />
    <div className="mb-3 flex flex-wrap gap-2">{[0, 1, 2, 3].map((i) => <Bone key={i} className="h-9 w-32 rounded-full" />)}</div>
    <div className="overflow-hidden rounded-2xl border border-gold-400/30 bg-white">
      <Bone className="h-10 w-full rounded-none" />
      {Array.from({ length: 8 }, (_, i) => <div key={i} className="flex gap-4 border-t border-gold-400/20 px-3 py-3">{[0, 1, 2, 3, 4].map((j) => <Bone key={j} className="h-4 flex-1" />)}</div>)}
    </div>
  </>
);

const Ledger = () => (
  <div className="space-y-5">
    <div className="flex justify-between"><div className="space-y-2"><Bone className="h-9 w-48" /><Bone className="h-4 w-56" /></div><Bone className="h-10 w-28" /></div>
    <div className="flex gap-2">{[0, 1, 2].map((i) => <Bone key={i} className="h-12 w-32 rounded-xl" />)}</div>
    <Rows n={6} />
  </div>
);

// PageSkeleton chooses a skeleton for the page being loaded.
export function PageSkeleton({ path }: { path: string }) {
  let body;
  if (path === "/app" || path === "/app/") body = <Dashboard />;
  else if (path === "/app/bills/new" || path.endsWith("/edit")) body = <BillEditor />;
  else if (path === "/app/bills") body = <List tabs />;
  else if (path.startsWith("/app/bills/")) body = <BillView />;
  else if (path.startsWith("/app/customers/")) body = <Ledger />;
  else if (path.startsWith("/app/reports")) body = <Report />;
  else if (path.startsWith("/app/settings") || path.startsWith("/app/rates") || path.startsWith("/app/onboarding") || path.startsWith("/app/waitlist")) body = <Form />;
  else body = <List />;
  return (
    <div role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {body}
    </div>
  );
}

// AppShellSkeleton is the first paint before the app's data arrives (sidebar + page).
export function AppShellSkeleton({ path }: { path: string }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden h-dvh flex-col gap-3 border-r border-gold-400/40 bg-white px-4 py-5 md:flex">
        <div className="flex items-center gap-2"><Bone className="size-10 rounded-xl" /><Bone className="h-6 w-28" /></div>
        <div className="mt-4 space-y-2">{Array.from({ length: 9 }, (_, i) => <Bone key={i} className="h-10 w-full rounded-xl" />)}</div>
      </aside>
      <div>
        <div className="flex items-center gap-2 border-b border-gold-400/40 bg-white px-4 py-3 md:hidden"><Bone className="size-8 rounded-lg" /><Bone className="h-6 w-28" /></div>
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8"><PageSkeleton path={path} /></main>
      </div>
    </div>
  );
}
