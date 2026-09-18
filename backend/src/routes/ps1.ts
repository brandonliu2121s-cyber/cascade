import { Router } from "express";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INPUT_FILES, parseInstance, dateValue } from "../ps1/instance";
import { parseCsv } from "../ps1/csv";
import { solve } from "../ps1/solve";
import { checkSchedule } from "../ps1/check";
import type { Occupancy, Placement, Result, Scenario } from "../ps1/types";

const router = Router();
const filesSchema = z.record(z.string(), z.string().max(2_000_000));
const scenarioSchema = z.enum(["A", "B", "C"]);
const solveSchema = z.object({ files: filesSchema, scenario: scenarioSchema.optional() }).strict();
const validateSchema = z.object({ files: filesSchema, scenario: scenarioSchema, submission: filesSchema }).strict();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Invalid input";
router.get("/sample", (_req, res) => {
  try {
    const files = Object.fromEntries(INPUT_FILES.map((name) => [name, readFileSync(resolve(__dirname, "../../data/ps1", name), "utf8")]));
    res.json({ files, source: "https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/tree/main/PS1/01_data" });
  } catch { res.status(500).json({ error: "Bundled public dataset is unavailable. Upload the eight official CSV files." }); }
});
router.post("/solve", (req, res) => {
  try {
    const input = solveSchema.parse(req.body);
    const instance = parseInstance(input.files);
    const scenarios: Scenario[] = input.scenario ? [input.scenario] : ["A", "B", "C"];
    res.json({ instance, solutions: scenarios.map((s) => solve(instance, s)) });
  } catch (error) { res.status(400).json({ error: errorMessage(error) }); }
});
router.post("/validate", (req, res) => {
  try {
    const input = validateSchema.parse(req.body);
    const instance = parseInstance(input.files);
    const rows = (name: string, headers: string[]) => {
      if (typeof input.submission[name] !== "string") throw new Error(`Missing submission file ${name}`);
      const csv = input.submission[name];
      // Preserve header validation even for submissions with zero data rows.
      const firstLine = csv.replace(/^\uFEFF/, "").split(/\r?\n/)[0];
      if (firstLine !== headers.join(",")) throw new Error(`${name}: expected header ${headers.join(",")}`);
      return parseCsv(csv);
    };
    const number = (value: string) => { if (!/^\d+$/.test(value)) throw new Error(`Invalid submission number: ${value}`); return Number(value); };
    const access: Placement[] = rows("SCHEDULE_ACCESS.csv", ["activity_id", "access_seq", "week", "eclo", "access_night"]).map((r) => ({ activity_id: r.activity_id, access_seq: number(r.access_seq), week: number(r.week), eclo: number(r.eclo) as 0 | 1, access_night: number(r.access_night) }));
    const occupancy: Occupancy[] = rows("SCHEDULE_OCCUPANCY.csv", ["activity_id", "week", "location_id", "co_share_group"]).map((r) => ({ activity_id: r.activity_id, week: number(r.week), location_id: r.location_id, co_share_group: r.co_share_group }));
    const results: Result[] = rows("RESULTS.csv", ["scenario", "contract_number", "simulated_completion_date", "overrun_days"]).map((r) => ({ scenario: r.scenario as Scenario, contract_number: r.contract_number, simulated_completion_date: dateValue(r.simulated_completion_date), overrun_days: number(r.overrun_days) }));
    res.json(checkSchedule(instance, input.scenario, access, occupancy, results));
  } catch (error) { res.status(400).json({ error: errorMessage(error) }); }
});
export default router;
