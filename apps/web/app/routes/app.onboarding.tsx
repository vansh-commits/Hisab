import { Card } from "../components/ui";
import { useMe } from "./app";

// ponytail: Phase 1 placeholder; the wizard lands in Phase 3.
export default function Onboarding() {
  const me = useMe();
  return (
    <Card>
      <h1 className="font-display text-3xl font-semibold">Namaste {me.user.name.split(" ")[0]}! 🎉</h1>
      <p className="mt-3 text-ink/70">Your account is approved. Business setup opens here very soon.</p>
    </Card>
  );
}
