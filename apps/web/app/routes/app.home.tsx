import { Card } from "../components/ui";
import { useMe } from "./app";

// ponytail: Phase 1 placeholder; the dashboard lands in Phases 4–5.
export default function Home() {
  const me = useMe();
  return (
    <Card>
      {me.business?.status === "suspended" && (
        <p className="mb-4 rounded-lg bg-maroon-700/10 p-3 text-maroon-700">Your account is suspended (read-only). Please contact support.</p>
      )}
      <h1 className="font-display text-3xl font-semibold">{me.business?.trade_name ?? "Dashboard"}</h1>
      <p className="mt-3 text-ink/70">Bills, customers and reports appear here.</p>
    </Card>
  );
}
