import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INPUT_FILES, parseInstance, weekEnd } from "./instance";
import { solve } from "./solve";
import { checkSchedule } from "./check";
import { comparePlans } from "./replan";
import { validateCapacityChanges } from "./capacity";
import type { Instance } from "./types";

function fixture(): Instance {
  const source = parseInstance(Object.fromEntries(INPUT_FILES.map(name => [name, readFileSync(resolve(__dirname, "../../data/official_dataset", name), "utf8")])));
  const contract = { ...source.contracts[0], contract_number: "C1", nature_of_activity: "Non-live (Others)" as const, access_type: "PM" as const, number_of_maximum_access_per_week: 1, number_of_workfronts: 1, planned_completion_date: weekEnd(source, 10) };
  const activity = { ...source.activities[0], activity_id: "A1", contract_number: "C1", total_accesses: 3, planned_start_date: source.horizon_start, predecessor_activity_id: null, start_location_id: "SEC:ALP:S01_S02:EB", end_location_id: "SEC:ALP:S01_S02:EB" };
  return { ...source, horizon_weeks: 10, contracts: [contract], activities: [activity], supplies: source.supplies.map(s => ({ ...s, supply_capacity: 1 })) };
}
const disruption = { location_id: "SEC:ALP:S01_S02:EB", from_week: 2, to_week: 3, supply_capacity: 0 };

describe("disruption-aware replanning", () => {
  it("preserves surplus frozen accesses even after the workload is complete", () => {
    const instance = fixture(); instance.activities[0].total_accesses = 2;
    const baseline = solve(instance, "A");
    instance.activities[0].total_accesses = 1;
    expect(checkSchedule(instance, "A", baseline.access, baseline.occupancy, baseline.results).feasible).toBe(true);
    const revised = solve(instance, "A", { capacityChanges: [{ ...disruption, from_week: 3 }] }, { baseline, fromWeek: 3 });
    expect(revised.access).toEqual(baseline.access);
    expect(revised.occupancy).toEqual(baseline.occupancy);
  });
  it("checks nominal capacity only inside the affected week range", () => {
    const instance = fixture(); const baseline = solve(instance, "A");
    const report = checkSchedule(instance, "A", baseline.access, baseline.occupancy, baseline.results, { capacityChanges: [disruption] });
    expect(report.hard_violations.filter(v => v.rule === "capacity").map(v => v.detail)).toHaveLength(2);
    expect(report.detail.capacity_hotspots.find(h => h.week === 1 && h.location_id === disruption.location_id)?.capacity).toBe(1);
    expect(report.detail.capacity_hotspots.find(h => h.week === 2 && h.location_id === disruption.location_id)?.capacity).toBe(0);
  });
  it("keeps history, waits through zero capacity and completes after recovery", () => {
    const instance = fixture(); const baseline = solve(instance, "A"); const snapshot = JSON.stringify(baseline);
    const revised = solve(instance, "A", { capacityChanges: [disruption] }, { baseline, fromWeek: 2 });
    expect(revised.report.hard_violations).toEqual([]);
    expect(revised.access.map(p => p.week)).toEqual([1, 4, 5]);
    expect(revised.access.filter(p => p.week < 2)).toEqual(baseline.access.filter(p => p.week < 2));
    expect(revised.occupancy.filter(p => p.week < 2)).toEqual(baseline.occupancy.filter(p => p.week < 2));
    expect(JSON.stringify(baseline)).toBe(snapshot);
    const comparison = comparePlans(instance, baseline, revised, disruption);
    expect(comparison.frozenPlacements).toBe(1);
    expect(comparison.changedActivities).toEqual(["A1"]);
    expect(comparison.directlyAffectedActivities).toEqual(["A1"]);
    expect(comparison.contractChanges[0].delayDays).toBe(14);
  });
  it("retains unaffected future allocations instead of pulling them forward", () => {
    const instance = fixture(); instance.activities[0].planned_start_date = weekEnd(instance, 5);
    const baseline = solve(instance, "A");
    const revised = solve(instance, "A", { capacityChanges: [disruption] }, { baseline, fromWeek: 2 });
    expect(revised.access).toEqual(baseline.access); expect(revised.occupancy).toEqual(baseline.occupancy);
    expect(comparePlans(instance, baseline, revised, disruption).changedActivities).toEqual([]);
  });
  it("repairs downstream dependencies without rewriting completed allocations", () => {
    const instance = fixture(); instance.activities[0].total_accesses = 2;
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", total_accesses: 1, predecessor_activity_id: "A1", start_location_id: "SEC:ALP:S01_S02:WB", end_location_id: "SEC:ALP:S01_S02:WB" });
    const baseline = solve(instance, "A"); const revised = solve(instance, "A", { capacityChanges: [disruption] }, { baseline, fromWeek: 2 });
    expect(revised.report.hard_violations).toEqual([]);
    expect(revised.access.find(p => p.activity_id === "A2")!.week).toBeGreaterThan(Math.max(...revised.access.filter(p => p.activity_id === "A1").map(p => p.week)));
  });
  it("does not hide unfinished workloads when repair cannot fit the horizon", () => {
    const instance = fixture(); const baseline = solve(instance, "A");
    const revised = solve(instance, "A", { capacityChanges: [{ ...disruption, to_week: 10 }] }, { baseline, fromWeek: 2 });
    expect(revised.report.feasible).toBe(false); expect(revised.access).toEqual(baseline.access.filter(p => p.week < 2));
    expect(revised.report.hard_violations.some(v => v.rule === "workload")).toBe(true);
  });
  it("rejects unknown locations, fractional weeks and overlapping overlays", () => {
    const instance = fixture();
    for (const changes of [[{ ...disruption, location_id: "unknown" }], [{ ...disruption, from_week: 1.5 }], [disruption, disruption], [{ ...disruption, to_week: 11 }]]) expect(() => validateCapacityChanges(instance, changes)).toThrow();
  });
});
