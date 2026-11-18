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
  ]),
] satisfies RouteConfig;
