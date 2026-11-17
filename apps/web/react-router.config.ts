import type { Config } from "@react-router/dev/config";

// Static output only: marketing routes are prerendered, /app/* is a client SPA.
export default {
  ssr: false,
  prerender: ["/"],
} satisfies Config;
