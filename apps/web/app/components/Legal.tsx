// ponytail: placeholder legal copy; replace with reviewed text before onboarding customers (Phase 6).
export const pages = {
  privacy: {
    title: "Privacy Policy",
    body: [
      "Hisab is a GST billing tool for jewellers. We collect your Google account name and email to sign you in, and the business, customer and invoice details you enter to produce your bills.",
      "Your data is stored in a Postgres database hosted in Singapore and backed up nightly in encrypted form. We do not sell or share your data with anyone, and we do not use it for advertising.",
      "We send you emails only about your account (for example, waitlist approval). You can ask us to export or delete your data at any time by writing to the contact email below.",
    ],
  },
  terms: {
    title: "Terms of Service",
    body: [
      "Hisab is provided as-is during its early-access period. You are responsible for checking that the invoices you issue are correct for your business and comply with GST law.",
      "Issued invoices cannot be edited, only cancelled, so that invoice numbering stays gapless as GST rules require.",
      "We may suspend accounts that misuse the service. You can stop using Hisab and request an export of your data at any time.",
    ],
  },
} as const;

export function Legal({ page }: { page: keyof typeof pages }) {
  const p = pages[page];
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="font-display text-4xl font-semibold">{p.title}</h1>
      {p.body.map((t) => (
        <p key={t} className="mt-4 leading-relaxed">{t}</p>
      ))}
      <p className="mt-8 text-sm">Contact: vanshcommits@gmail.com · Last updated 17 November 2026</p>
    </main>
  );
}
