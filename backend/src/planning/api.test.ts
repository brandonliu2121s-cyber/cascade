import { beforeAll, afterAll, describe, it, expect } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import router from "../routes/planning";
let server: Server; let base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json({ limit: "10mb" })); app.use("/api/planning", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/planning`;
});
afterAll(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
describe("Planning API", () => {
  it("rejects missing input files and invalid scenarios", async () => {
    const missing = await post("/solve", { files: {} });
    expect(missing.status).toBe(400); expect((await missing.json()).error).toMatch(/Missing/);
    expect((await post("/solve", { files: {}, scenario: "D" })).status).toBe(400);
  });
  it("solves isolated uploads and independently validates exported CSVs", async () => {
    const sample = await (await fetch(base + "/sample")).json();
    expect(Object.keys(sample.files)).toHaveLength(8);
    const response = await post("/solve", { files: sample.files });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.instance.activities).toHaveLength(54);
    expect(data.solutions.map((s: { scenario: string }) => s.scenario)).toEqual(["A", "B", "C"]);
    for (const solution of data.solutions) {
      expect(solution.report.feasible).toBe(true);
      const validation = await post("/validate", { files: sample.files, scenario: solution.scenario, submission: solution.csv });
      expect(validation.status).toBe(200);
      expect((await validation.json()).feasible).toBe(true);
    }
    const corrupted = { ...data.solutions[0].csv, "SCHEDULE_ACCESS.csv": "activity_id,access_seq,week,eclo,access_night\n" };
    const invalid = await post("/validate", { files: sample.files, scenario: "A", submission: corrupted });
    expect((await invalid.json()).feasible).toBe(false);
  }, 30000);
  it("uses the same explicit horizon policy for solve and CSV recheck", async () => {
    const sample = await (await fetch(base + "/sample")).json();
    const files = { ...sample.files, "06_PARAMETERS.csv": "key,value\nhorizon_start,2027-01-04\nhorizon_weeks,1\n" };
    const strictResponse = await post("/solve", { files, scenario: "A" });
    expect(strictResponse.status).toBe(200);
    const strict = (await strictResponse.json()).solutions[0];
    expect(strict.report.feasible).toBe(false);
    expect(strict.access.every((p: { week: number }) => p.week <= 1)).toBe(true);
    const options = { allowHorizonExtension: true };
    const extendedResponse = await post("/solve", { files, scenario: "A", options });
    expect(extendedResponse.status).toBe(200);
    const extended = (await extendedResponse.json()).solutions[0];
    expect(extended.report.feasible).toBe(true);
    const body = { files, scenario: "A", submission: extended.csv };
    const strictCheck = await post("/validate", body);
    expect((await strictCheck.json()).hard_violations.some((v: { rule: string }) => v.rule === "horizon")).toBe(true);
    const extendedCheck = await post("/validate", { ...body, options });
    expect(extendedCheck.status).toBe(200);
    expect((await extendedCheck.json()).feasible).toBe(true);
    expect((await post("/solve", { files, options: { allowHorizonExtension: "yes" } })).status).toBe(400);
  });
  it("returns CSV parse errors instead of silently converting invalid numbers", async () => {
    const sample = await (await fetch(base + "/sample")).json();
    const response = await post("/validate", { files: sample.files, scenario: "A", submission: { "SCHEDULE_ACCESS.csv": "activity_id,access_seq,week,eclo,access_night\nA001,1,no,0,1", "SCHEDULE_OCCUPANCY.csv": "activity_id,week,location_id,co_share_group\n", "RESULTS.csv": "scenario,contract_number,simulated_completion_date,overrun_days\n" } });
    expect(response.status).toBe(400);
  });
  it("replans valid baseline CSVs and rechecks the same week-specific overlays", async () => {
    const sample = await (await fetch(base + "/sample")).json();
    const baseline = await (await post("/solve", { files: sample.files })).json();
    const baselines = Object.fromEntries(baseline.solutions.map((s: { scenario: string; csv: object }) => [s.scenario, s.csv]));
    const disruption = { location_id: "SEC:ALP:S01_S02:EB", from_week: 12, to_week: 14, supply_capacity: 2 };
    const response = await post("/replan", { files: sample.files, baselines, disruption });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.options.capacityChanges).toEqual([disruption]); expect(data.comparisons).toHaveLength(3);
    for (const solution of data.solutions) {
      const old = baseline.solutions.find((s: { scenario: string }) => s.scenario === solution.scenario);
      expect(solution.access.filter((p: { week: number }) => p.week < 12)).toEqual(old.access.filter((p: { week: number }) => p.week < 12));
      expect(solution.occupancy.filter((p: { week: number }) => p.week < 12)).toEqual(old.occupancy.filter((p: { week: number }) => p.week < 12));
      const checked = await (await post("/validate", { files: sample.files, scenario: solution.scenario, submission: solution.csv, options: data.options })).json();
      expect(checked).toEqual(solution.report);
    }
    expect((await post("/replan", { files: sample.files, baselines: { ...baselines, A: {} }, disruption })).status).toBe(400);
    expect((await post("/replan", { files: sample.files, baselines, disruption: { ...disruption, from_week: 0 } })).status).toBe(400);
  }, 30000);
});
