import express from "express";
import cors from "cors";
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[cascade] CAPO backend running on http://localhost:${PORT}`);
});
