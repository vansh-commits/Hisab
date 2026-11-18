// Plain-language legal copy. Have a lawyer review before charging money.
export const pages = {
  privacy: {
    title: "Privacy Policy",
    body: [
      ["What we collect", "Your Google account name, email and profile photo (to sign you in); the waitlist details you submit; and the business, customer, item, rate, bill, payment and old-gold details you enter so Hisab can produce your bills and reports. We also keep a security log of sign-ins and important actions (with IP address) to protect your account."],
      ["How we use it", "Only to run Hisab for you: signing in, generating bills and PDFs, reports, and emails about your account (for example, approval of your application). We do not sell your data, share it with advertisers, or use it to train AI models."],
      ["Where it is stored", "In a Postgres database (Neon) in Singapore, with the app hosted on Vercel. Emails are sent through Google's Gmail service. Encrypted backups are made every night and kept for up to a year."],
      ["Your customers' data", "You are responsible for the customer details you enter. We process them only on your instructions, to make your bills."],
      ["How long we keep it", "As long as your account is active. GST law requires tax invoices to be kept for at least 72 months, so we keep issued bills for that period unless you export them and ask us to delete them."],
      ["Cookies", "Only one essential sign-in cookie. No tracking or advertising cookies."],
      ["Your choices", "You can export your data or ask us to correct or delete it at any time by writing to the email below. We reply within 30 days."],
    ],
  },
  terms: {
    title: "Terms of Service",
    body: [
      ["The service", "Hisab is a billing tool for jewellers in India, provided during an early-access period. Features may change. We will tell you before introducing any charges."],
      ["Your responsibilities", "You are responsible for the accuracy of the details you enter and for checking that the bills you issue comply with GST and other laws that apply to your business. Hisab calculates tax from the rates and details you provide; it is not tax or legal advice."],
      ["Bills are final once issued", "Issued bills cannot be edited, only cancelled, so that bill numbers stay continuous as GST rules require. Drafts can be changed or deleted freely."],
      ["Acceptable use", "Don't use Hisab for unlawful purposes, to issue false bills, or to try to access other businesses' data. We may suspend accounts that misuse the service; suspended accounts can still view and download their old bills."],
      ["Availability and liability", "We work hard to keep Hisab available and your data backed up, but the service is provided as-is. To the extent the law allows, our liability is limited to the amount you paid us in the previous 12 months."],
      ["Leaving", "You can stop using Hisab at any time and ask for an export of your data."],
      ["Law", "These terms are governed by the laws of India."],
    ],
  },
} as const;

export function Legal({ page }: { page: keyof typeof pages }) {
  const p = pages[page];
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <a href="/" className="font-display text-2xl font-semibold text-gold-600">Hisab</a>
      <h1 className="mt-6 font-display text-4xl font-semibold">{p.title}</h1>
      {p.body.map(([h, t]) => (
        <section key={h} className="mt-6">
          <h2 className="font-semibold">{h}</h2>
          <p className="mt-1 leading-relaxed text-ink/80">{t}</p>
        </section>
      ))}
      <p className="mt-10 text-sm text-ink/60">Contact: vanshcommits@gmail.com · Last updated 18 November 2026</p>
    </main>
  );
}
