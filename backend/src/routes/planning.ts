import { Router } from "express";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INPUT_FILES, parseInstance } from "../planning/instance";
import { readSubmission } from "../planning/submission";
import { solve } from "../planning/solve";
import { checkSchedule } from "../planning/check";
import { validateCapacityChanges } from "../planning/capacity";
import { comparePlans } from "../planning/replan";
import type { Solution, Scenario } from "../planning/types";

const router = Router();
const filesSchema = z.record(z.string(), z.string().max(2_000_000));
const scenarioSchema = z.enum(["A", "B", "C"]);
const changeSchema = z.object({ location_id: z.string().min(1), from_week: z.number().int().min(1), to_week: z.number().int().min(1), supply_capacity: z.number().int().min(0).max(1000) }).strict();
const optionsSchema = z.object({ allowHorizonExtension: z.boolean().optional(), capacityChanges: z.array(changeSchema).max(100).optional() }).strict();
const solveSchema = z.object({ files: filesSchema, scenario: scenarioSchema.optional(), options: optionsSchema.optional() }).strict();
const validateSchema = z.object({ files: filesSchema, scenario: scenarioSchema, submission: filesSchema, options: optionsSchema.optional() }).strict();
const replanSchema = z.object({ files: filesSchema, baselines: z.object({ A: filesSchema, B: filesSchema, C: filesSchema }).strict(), disruption: changeSchema, options: optionsSchema.optional() }).strict();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Invalid input";
router.get("/sample", (_req, res) => {
  try {
    const files = Object.fromEntries(INPUT_FILES.map((name) => [name, readFileSync(resolve(__dirname, "../../data/official_dataset", name), "utf8")]));
    res.json({ files, source: "https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/tree/main/PS1/01_data" });
  } catch { res.status(500).json({ error: "Bundled public dataset is unavailable. Upload the eight official CSV files." }); }
});
router.post("/solve", (req, res) => {
  try {
    const input = solveSchema.parse(req.body);
    const instance = parseInstance(input.files);
    const scenarios: Scenario[] = input.scenario ? [input.scenario] : ["A", "B", "C"];
    res.json({ instance, solutions: scenarios.map((s) => solve(instance, s, input.options)) });
  } catch (error) { res.status(400).json({ error: errorMessage(error) }); }
});
router.post("/validate", (req, res) => {
  try {
    const input = validateSchema.parse(req.body);
    const instance = parseInstance(input.files);
    const { access, occupancy, results } = readSubmission(input.submission);
    res.json(checkSchedule(instance, input.scenario, access, occupancy, results, input.options));
  } catch (error) { res.status(400).json({ error: errorMessage(error) }); }
});
router.post("/replan", (req, res) => {
  try {
    const input = replanSchema.parse(req.body);
    const instance = parseInstance(input.files);
    const options = { ...input.options, capacityChanges: [...(input.options?.capacityChanges ?? []), input.disruption] };
    validateCapacityChanges(instance, options.capacityChanges);
    const scenarios: Scenario[] = ["A", "B", "C"];
    // Validate every baseline before starting any repair. Client reports are
    // never accepted as evidence of baseline feasibility.
    const baselines = scenarios.map(scenario => {
      const parsed = readSubmission(input.baselines[scenario]);
      const report = checkSchedule(instance, scenario, parsed.access, parsed.occupancy, parsed.results, input.options);
      if (!report.feasible) throw new Error(`Scenario ${scenario} baseline is not locally feasible. Generate all three scenarios before replanning.`);
      for (const p of parsed.access) if (new Set(parsed.occupancy.filter(o => o.activity_id === p.activity_id && o.week === p.week).map(o => o.co_share_group)).size !== 1) throw new Error("Replanning requires one possession group per activity-week.");
      return { ...parsed, scenario, report, csv: input.baselines[scenario], explanations: [], warnings: [] } satisfies Solution;
    });
    const solutions = baselines.map(baseline => solve(instance, baseline.scenario, options, { baseline, fromWeek: input.disruption.from_week }));
    const comparisons = solutions.map((solution, index) => comparePlans(instance, baselines[index], solution, input.disruption));
    res.json({ instance, solutions, options, comparisons });
  } catch (error) { res.status(400).json({ error: errorMessage(error) }); }
});
export default router;
