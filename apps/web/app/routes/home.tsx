export function meta() {
  return [
    { title: "Hisab — GST billing for jewellers" },
    { name: "description", content: "GST-ready invoices for jewellers." },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-24">
      <h1 className="font-display text-5xl font-semibold text-ink">Bill banaiye seconds mein.</h1>
      <p className="mt-4 text-lg">
        GST-ready invoices for jewellers. <span lang="hi">सोने जैसा खरा हिसाब.</span>
      </p>
      <p className="mt-8 text-gold-600">Coming soon.</p>
    </main>
  );
}
