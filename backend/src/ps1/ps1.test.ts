import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseCsv } from "./csv";
import { parseInstance } from "./instance";
import { footprint } from "./topology";
import { solve } from "./solve";
import { checkSchedule } from "./check";
import type { Instance, Placement } from "./types";

const directory = resolve(__dirname, "../../data/ps1");
const files = Object.fromEntries(readdirSync(directory).filter((f) => f.endsWith(".csv")).map((f) => [f, readFileSync(resolve(directory, f), "utf8")]));
const publicInstance = () => parseInstance(files);
function tiny(): Instance {
  const source = publicInstance();
  const contract = { ...source.contracts[0], contract_number: "C1", nature_of_activity: "Non-live (Others)" as const, access_type: "C" as const, contract_priority: 1, planned_completion_date: "2027-01-17", number_of_workfronts: 1, number_of_maximum_access_per_week: 1 };
  const job = { ...source.activities[0], activity_id: "A1", contract_number: "C1", start_location_id: "SEC:ALP:S01_S02:EB", end_location_id: "SEC:ALP:S01_S02:EB", total_accesses: 2, planned_start_date: source.horizon_start, predecessor_activity_id: null, activity_priority: 3 };
  return { ...source, horizon_weeks: 2, contracts: [contract], activities: [job], supplies: source.supplies.map((s) => ({ ...s, supply_capacity: 1 })) };
}
const placement = (activity_id: string, week: number, eclo: 0 | 1 = 0, access_night = 1): Placement => ({ activity_id, week, eclo, access_night, access_seq: week });

describe("CSV and official instance", () => {
  it("parses BOM, quoted commas/newlines, escaped quotes and trailing blank lines", () => {
    expect(parseCsv('\ufeffid,name\r\n1,"x, y"\r\n2,"two\nlines ""quoted"""\r\n\u00a0\r\n')).toEqual([{ id: "1", name: "x, y" }, { id: "2", name: 'two\nlines "quoted"' }]);
  });
  it("rejects duplicate headers and malformed rows", () => {
    expect(() => parseCsv("id,id\n1,2")).toThrow();
    expect(() => parseCsv('id,name\n1,"unterminated')).toThrow();
    expect(() => parseCsv("id,name\n1")).toThrow();
  });
  it("loads the eight public files without losing activities", () => {
    const instance = publicInstance();
    expect(instance.contracts).toHaveLength(14);
    expect(instance.activities).toHaveLength(54);
    expect(instance.supplies).toHaveLength(76);
  });
  it("rejects missing files, unknown contracts, cycles and impossible calendar dates", () => {
    expect(() => parseInstance({})).toThrow(/Missing/);
    expect(() => parseInstance({ ...files, "08_ACTIVITY_DETAILS.csv": files["08_ACTIVITY_DETAILS.csv"].replace("A001,C001", "A001,UNKNOWN") })).toThrow(/contract/);
    expect(() => parseInstance({ ...files, "08_ACTIVITY_DETAILS.csv": files["08_ACTIVITY_DETAILS.csv"].replace("2027-05-24,,2", "2027-05-24,A001,2") })).toThrow(/cycle/i);
    expect(() => parseInstance({ ...files, "06_PARAMETERS.csv": "key,value\nhorizon_start,2027-02-30\nhorizon_weeks,30" })).toThrow(/date/i);
  });
});

describe("topology", () => {
  it("expands tunnels and endpoint/intervening platforms", () => {
    const instance = tiny();
    instance.activities[0].end_location_id = "SEC:ALP:S02_S03:EB";
    expect(footprint(instance, instance.activities[0]).work.sort()).toEqual(["PLAT:ALP:S01:EB", "PLAT:ALP:S02:EB", "PLAT:ALP:S03:EB", "SEC:ALP:S01_S02:EB", "SEC:ALP:S02_S03:EB"].sort());
  });
  it("mirrors Live and crosses the interchange, keeping non-live lines independent", () => {
    const instance = tiny();
    instance.activities[0].start_location_id = instance.activities[0].end_location_id = "SEC:ALP:H01_H02:EB";
    expect(footprint(instance, instance.activities[0]).closure).not.toContain("SEC:BET:H01_H02:EB");
    instance.contracts[0].nature_of_activity = "Live";
    const f = footprint(instance, instance.activities[0]);
    expect(f.closure).toEqual(expect.arrayContaining(["SEC:ALP:H01_H02:WB", "SEC:BET:H01_H02:EB", "PLAT:BET:H01:WB"]));
  });
});

describe("independent schedule checker", () => {
  function occupancyFor(instance: Instance, placements: Placement[], group = (id: string) => id) {
    return placements.flatMap((p) => footprint(instance, instance.activities.find((a) => a.activity_id === p.activity_id)!).work.map((location_id) => ({ activity_id: p.activity_id, week: p.week, location_id, co_share_group: group(p.activity_id) })));
  }
  it("accumulates raw activity overruns in the contract priority tier", () => {
    const instance = tiny(); instance.horizon_weeks = 3; instance.activities[0].total_accesses = 1;
    instance.contracts[0].planned_completion_date = "2027-01-10";
    instance.activities.push({ ...instance.activities[0], activity_id: "A2" });
    const placements = [{ ...placement("A1", 2), access_seq: 1 }, { ...placement("A2", 3), access_seq: 1 }];
    const report = checkSchedule(instance, "A", placements, occupancyFor(instance, placements));
    expect(report.feasible).toBe(true);
    expect(report.soft_scores.overrun_days_total).toBe(14);
    expect(report.soft_scores.priority_overrun["1"]).toBe(21);
    expect(report.soft_scores.priority_weighted_score).toBe(2100);
  });
  it("checks legal mixes, separate group capacities, and C's one-group allowance", () => {
    const instance = tiny(); instance.activities[0].total_accesses = 1;
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2", access_type: "PC" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", contract_number: "C2" });
    const placements = [placement("A1", 1), placement("A2", 1)];
    instance.contracts[0].access_type = "PM";
    expect(checkSchedule(instance, "A", placements, occupancyFor(instance, placements, () => "b1")).hard_violations.some((v) => v.rule === "mix")).toBe(true);
    instance.contracts[0].access_type = "C";
    const separate = occupancyFor(instance, placements);
    expect(checkSchedule(instance, "A", placements, separate).hard_violations.some((v) => v.rule === "capacity")).toBe(true);
    expect(checkSchedule(instance, "C", placements, separate).feasible).toBe(true);
    instance.supplies.forEach((s) => { s.supply_capacity = 0; });
    expect(checkSchedule(instance, "C", placements, separate).hard_violations.some((v) => v.rule === "capacity")).toBe(true);
    expect(checkSchedule(instance, "B", placements, separate).feasible).toBe(true);
  });
  it("rejects overlapping buffers even when work spans do not overlap", () => {
    const instance = tiny(); instance.contracts[0].number_of_maximum_access_per_week = 2;
    instance.contracts[0].nature_of_activity = "Non-live (Consist)";
    instance.activities[0].total_accesses = 1;
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", start_location_id: "SEC:ALP:S03_S04:EB", end_location_id: "SEC:ALP:S03_S04:EB" });
    const placements = [placement("A1", 1), placement("A2", 1, 0, 2)];
    const report = checkSchedule(instance, "A", placements, occupancyFor(instance, placements));
    expect(report.hard_violations.some((v) => v.rule === "closure")).toBe(true);
  });
  it("detects live opposite-bound and cross-line interchange closures", () => {
    const instance = tiny(); instance.activities[0].total_accesses = 1;
    instance.contracts[0].nature_of_activity = "Live";
    instance.activities[0].start_location_id = instance.activities[0].end_location_id = "SEC:ALP:H01_H02:EB";
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2", nature_of_activity: "Non-live (Others)" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", contract_number: "C2", start_location_id: "SEC:BET:H01_H02:WB", end_location_id: "SEC:BET:H01_H02:WB" });
    const placements = [placement("A1", 1), placement("A2", 1)];
    expect(checkSchedule(instance, "A", placements, occupancyFor(instance, placements)).hard_violations.some((v) => v.rule === "closure")).toBe(true);
  });
  it("enforces C ECLO windows on both affected lines, while B is exempt", () => {
    const instance = tiny(); instance.horizon_weeks = 3; instance.contracts[0].nature_of_activity = "Live";
    instance.contracts[0].planned_completion_date = "2027-02-28";
    instance.activities[0].total_accesses = 3;
    instance.activities[0].start_location_id = instance.activities[0].end_location_id = "SEC:ALP:H01_H02:EB";
    const placements = [placement("A1", 1, 1), { ...placement("A1", 3, 1), access_seq: 2 }];
    const report = checkSchedule(instance, "C", placements, occupancyFor(instance, placements));
    expect(report.hard_violations.filter((v) => v.rule === "eclo_window")).toHaveLength(2);
    expect(checkSchedule(instance, "B", placements, occupancyFor(instance, placements)).feasible).toBe(true);
  });
  it("detects omitted workload and duplicate activity-weeks", () => {
    const instance = tiny();
    expect(checkSchedule(instance, "A", [], []).hard_violations.some((v) => v.rule === "workload")).toBe(true);
    expect(checkSchedule(instance, "A", [placement("A1", 1), placement("A1", 1)], []).hard_violations.some((v) => v.rule === "duplicate")).toBe(true);
  });
  it("enforces strict predecessor weeks and planned starts", () => {
    const instance = tiny();
    instance.activities[0].total_accesses = 1;
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", predecessor_activity_id: "A1", planned_start_date: "2027-01-11" });
    const report = checkSchedule(instance, "A", [placement("A1", 1), placement("A2", 1)], []);
    expect(report.hard_violations.map((v) => v.rule)).toEqual(expect.arrayContaining(["precedence", "planned_start"]));
  });
  it("checks access budgets, workfronts, and forbids ECLO in A", () => {
    const instance = tiny();
    instance.activities.push({ ...instance.activities[0], activity_id: "A2" });
    const report = checkSchedule(instance, "A", [placement("A1", 1, 1, 2), placement("A2", 1, 0, 2)], []);
    expect(report.hard_violations.map((v) => v.rule)).toEqual(expect.arrayContaining(["weekly_allocation", "workfront", "eclo"]));
  });
  it("does not allow missing occupancy to hide physical constraints", () => {
    const report = checkSchedule(tiny(), "A", [placement("A1", 1), placement("A1", 2)], []);
    expect(report.hard_violations.some((v) => v.rule === "occupancy")).toBe(true);
  });
});

describe("planning horizon policy", () => {
  it("rejects valid out-of-horizon access unless extension is explicit", () => {
    const instance = tiny(); instance.activities[0].total_accesses = 1;
    const access = [{ ...placement("A1", 3), access_seq: 1 }];
    const occupancy = footprint(instance, instance.activities[0]).work.map((location_id) => ({ activity_id: "A1", week: 3, location_id, co_share_group: "b1" }));
    expect(checkSchedule(instance, "A", access, occupancy).hard_violations.map((v) => v.rule)).toContain("horizon");
    expect(checkSchedule(instance, "A", access, occupancy, undefined, { allowHorizonExtension: true }).feasible).toBe(true);
  });
  it("retains incomplete workload diagnostics at the strict horizon", () => {
    const instance = tiny(); instance.activities[0].total_accesses = 4;
    const strict = solve(instance, "A");
    expect(strict.access.map((p) => p.week)).toEqual([1, 2]);
    expect(strict.report.feasible).toBe(false);
    expect(strict.report.detail.workload_delivered).toBe(2);
    expect(strict.report.hard_violations.map((v) => v.rule)).toContain("workload");
    const extended = solve(instance, "A", { allowHorizonExtension: true });
    expect(extended.report.feasible).toBe(true);
    expect(extended.report.detail.horizon_weeks_used).toBe(4);
    expect(extended.warnings.join(" ")).toMatch(/flat weekly supply/);
  });
  it("does not schedule a planned start beyond the strict horizon", () => {
    const instance = tiny(); instance.activities[0].planned_start_date = "2027-01-18";
    expect(solve(instance, "A").access).toEqual([]);
    expect(solve(instance, "A", { allowHorizonExtension: true }).report.feasible).toBe(true);
  });
});

describe("scenario solver", () => {
  it("prices additional possession slots in B and limits C elasticity", () => {
    const instance = tiny(); instance.horizon_weeks = 3; instance.activities[0].total_accesses = 1;
    instance.contracts[0].access_type = "PM"; instance.contracts[0].planned_completion_date = "2027-01-10";
    for (let i = 2; i <= 5; i++) {
      instance.contracts.push({ ...instance.contracts[0], contract_number: `C${i}` });
      instance.activities.push({ ...instance.activities[0], activity_id: `A${i}`, contract_number: `C${i}` });
    }
    const b = solve(instance, "B");
    expect(b.report.feasible).toBe(true);
    expect(b.access.every((p) => p.week === 1)).toBe(true);
    expect(b.report.soft_scores.excess_access_nights_total).toBe(12);
    expect(b.report.soft_scores.objective_score).toBe(84);
    const c = solve(instance, "C");
    expect(c.report.feasible).toBe(true);
    expect(c.report.detail.capacity_hotspots.every((s) => s.used <= s.capacity + 1)).toBe(true);
    expect(new Set(c.access.map((p) => p.week)).size).toBe(3);
  });
  it("finishes predecessors before scheduling dependent activities", () => {
    const instance = tiny();
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", total_accesses: 1, predecessor_activity_id: "A1" });
    instance.horizon_weeks = 3;
    const result = solve(instance, "A");
    expect(result.report.feasible).toBe(true);
    expect(result.access.find((p) => p.activity_id === "A2")!.week).toBe(3);
  });
  it("does not invent access where A has zero supply", () => {
    const instance = tiny(); instance.supplies.forEach((s) => { s.supply_capacity = 0; });
    const result = solve(instance, "A");
    expect(result.report.feasible).toBe(false);
    expect(result.access).toHaveLength(0);
    expect(result.report.hard_violations.some((v) => v.rule === "workload")).toBe(true);
  });
  it("conserves all workload and exports the three exact CSV schemas", () => {
    const result = solve(tiny(), "A");
    expect(result.report.feasible).toBe(true);
    expect(result.access).toHaveLength(2);
    expect(result.csv["SCHEDULE_ACCESS.csv"].split(/\r?\n/)[0]).toBe("activity_id,access_seq,week,eclo,access_night");
    expect(result.csv["SCHEDULE_OCCUPANCY.csv"].split(/\r?\n/)[0]).toBe("activity_id,week,location_id,co_share_group");
    expect(result.csv["RESULTS.csv"].split(/\r?\n/)[0]).toBe("scenario,contract_number,simulated_completion_date,overrun_days");
    expect(result.results[0].simulated_completion_date).toBe("2027-01-17");
  });
  it("keeps congested work when A extension is explicitly enabled", () => {
    const instance = tiny();
    instance.activities.push({ ...instance.activities[0], activity_id: "A2" });
    const result = solve(instance, "A", { allowHorizonExtension: true });
    expect(result.report.feasible).toBe(true);
    expect(result.access).toHaveLength(4);
    expect(Math.max(...result.access.map((p) => p.week))).toBe(4);
    expect(result.report.soft_scores.overrun_days_total).toBe(14);
  });
  it("uses compatible sharing to fit a PC and C into one slot", () => {
    const instance = tiny();
    instance.activities[0].total_accesses = 1;
    instance.contracts[0].access_type = "PC";
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2", access_type: "C" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", contract_number: "C2" });
    const result = solve(instance, "A");
    expect(result.report.feasible).toBe(true);
    expect(result.access.map((p) => p.week)).toEqual([1, 1]);
    expect(new Set(result.occupancy.map((o) => o.co_share_group)).size).toBe(1);
  });
  it("uses ECLO to meet a tight B deadline", () => {
    const instance = tiny();
    instance.activities[0].total_accesses = 3;
    const result = solve(instance, "B");
    expect(result.report.feasible).toBe(true);
    expect(result.access.map((p) => p.eclo)).toEqual([1, 1]);
    expect(result.report.soft_scores.objective_score).toBe(10);
  });
  it("reports B infeasibility honestly while still accounting for all workloads", () => {
    const instance = tiny();
    instance.activities[0].total_accesses = 4;
    instance.contracts[0].planned_completion_date = "2027-01-10";
    const result = solve(instance, "B", { allowHorizonExtension: true });
    expect(result.report.feasible).toBe(false);
    expect(result.report.hard_violations.some((v) => v.rule === "planned_date")).toBe(true);
    expect(result.access.reduce((n, p) => n + (p.eclo ? 1.5 : 1), 0)).toBeGreaterThanOrEqual(4);
  });
  for (const scenario of ["A", "B", "C"] as const) {
    it(`schedules every public activity with no locally detected hard violations in ${scenario}`, () => {
      const instance = publicInstance();
      const result = solve(instance, scenario);
      expect(new Set(result.access.map((p) => p.activity_id)).size).toBe(54);
      expect(result.report.hard_violations).toEqual([]);
      expect(result.report.feasible).toBe(true);
    }, 30000);
  }
});
