import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import { seedIfEmpty } from "./db/seed";

import requestsRouter from "./routes/requests";
import scheduleRouter from "./routes/schedule";
import optimiseRouter from "./routes/optimise";
import dashboardRouter from "./routes/dashboard";
import crewsRouter from "./routes/crews";
import equipmentRouter from "./routes/equipment";
import sectorsRouter from "./routes/sectors";
import planningRouter from "./routes/planning";

seedIfEmpty();

const app = express();
app.use(cors());
// Planning instances upload up to eight CSVs of 2 MB each (routes/planning.ts), well over express's 100 kb default.
app.use(express.json({ limit: "20mb" }));

app.use("/api/requests", requestsRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/planning", planningRouter);
app.use("/api", optimiseRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/crews", crewsRouter);
app.use("/api/equipment", equipmentRouter);
app.use("/api/sectors", sectorsRouter);

// In production one service serves both the API and the built frontend (repo-root dist/).
const webRoot = path.resolve(__dirname, "../../dist");
if (existsSync(path.join(webRoot, "index.html"))) {
  app.use(express.static(webRoot));
  // Client-side routes (/app/map, /login, ...) all resolve to the single-page app.
  app.use((req, res, next) => {
    // Files with an extension (a missing /assets/*.js, say) should 404 rather than come back as HTML.
    if (req.method !== "GET" || req.path.startsWith("/api/") || path.extname(req.path)) return next();
    res.sendFile(path.join(webRoot, "index.html"));
  });
}

// Cloud Run supplies PORT; 3001 is the local dev default the Vite proxy expects.
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`[cascade] CAPO backend running on http://localhost:${PORT}`);
});
