import express from "express"
import { existsSync } from "node:fs"
try { process.loadEnvFile() } catch { /* no .env: mock mode */ }
const { repoRoot } = await import("../shared/data")
const { dataRoutes } = await import("./routes/data")
const { planRoute } = await import("./routes/plan")
const { evaluateRoute } = await import("./routes/evaluate")
const { providerName } = await import("./gemini")

const app = express()
app.use(express.json({ limit: "200kb" }))
app.use("/api", dataRoutes, planRoute, evaluateRoute)
const dist = repoRoot + "dist"
app.use(express.static(dist))
// checked per request, so a build made after the server started is still served
app.get(/^(?!\/api).*/, (_req, res) => {
  if (existsSync(dist + "/index.html")) res.sendFile(dist + "/index.html")
  else res.status(404).send("Board not built. Open http://localhost:5173 (npm run dev) or run npm run build.")
})
const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => console.log(`PlanEd server on http://localhost:${port} (AI provider: ${providerName()}, model: ${process.env.GEMINI_MODEL ?? "-"})`))
