import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Vite root is web/src so the legacy web/index.html planner keeps working (D-006, D-020).
export default defineConfig({
  root: "web/src",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { proxy: { "/api/": "http://localhost:3000" } },
})
