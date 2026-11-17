import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("debug", "routes/debug.tsx"), // ponytail: Phase 0 only, delete after checks are recorded
] satisfies RouteConfig;
