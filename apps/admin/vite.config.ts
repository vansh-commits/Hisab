import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Served at /admin/ on the same Vercel domain as the app (vercel.json services).
// The service receives the full path, so files live under dist/admin/.
export default defineConfig({
  base: "/admin/",
  build: { outDir: "dist/admin", emptyOutDir: true },
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8080" } },
});
