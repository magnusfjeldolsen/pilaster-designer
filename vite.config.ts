import { defineConfig } from "vite";

// web-ifc ships a .wasm we serve from /public (web-ifc.wasm at site root).
// Single-thread init avoids needing COOP/COEP headers.
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ["web-ifc"] },
});
