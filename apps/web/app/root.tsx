import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "@fontsource/mukta/latin-400.css";
import "@fontsource/mukta/latin-600.css";
import "@fontsource/mukta/devanagari-400.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "./styles/tokens.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#9a7b2f" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

// ErrorBoundary: last-resort screen instead of a blank page.
export function ErrorBoundary({ error }: { error: unknown }) {
  console.error(error);
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-semibold">Kuch gadbad ho gayi</h1>
      <p className="mt-3 text-ink/70">Something went wrong loading this page. Your data is safe.</p>
      <a href="/app" className="mt-6 inline-block rounded-xl bg-gold-600 px-5 py-3 font-semibold text-white">Go to dashboard</a>
    </main>
  );
}
