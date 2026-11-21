import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("terms", "routes/terms.tsx"),
  route("login", "routes/login.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app.home.tsx"),
    route("waitlist", "routes/app.waitlist.tsx"),
    route("onboarding", "routes/app.onboarding.tsx"),
    route("bills", "routes/app.bills.tsx"),
    route("bills/new", "routes/app.bill-edit.tsx", { id: "bill-new" }),
    route("bills/:id/edit", "routes/app.bill-edit.tsx", { id: "bill-edit" }),
    route("bills/:id", "routes/app.bill.tsx"),
    route("customers", "routes/app.customers.tsx"),
    route("customers/:id", "routes/app.customer.tsx"),
    route("items", "routes/app.items.tsx"),
    route("old-gold", "routes/app.old-gold.tsx"),
    route("reports", "routes/app.reports.tsx"),
    route("rates", "routes/app.rates.tsx"),
    route("market", "routes/app.market.tsx"),
    route("settings", "routes/app.settings.tsx"),
  ]),
] satisfies RouteConfig;
