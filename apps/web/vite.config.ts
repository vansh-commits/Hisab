import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  // Mirrors the Vercel rewrite so cookies/CSRF behave like prod.
  server: { proxy: { "/api": "http://localhost:8080" } },
});
