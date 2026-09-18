import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INPUT_FILES, parseInstance, weekEnd } from "./instance";
import { solve } from "./solve";
import { footprint } from "./topology";
import { checkSchedule } from "./check";
import type { Instance, Placement } from "./types";

function fixture(): Instance {
  const source = parseInstance(Object.fromEntries(INPUT_FILES.map((name) => [name, readFileSync(resolve(__dirname, "../../data/official_dataset", name), "utf8")])));
  const contract = { ...source.contracts[0], contract_number: "C1", nature_of_activity: "Non-live (Others)" as const, access_type: "PM" as const, number_of_maximum_access_per_week: 1, number_of_workfronts: 1, planned_completion_date: weekEnd(source, 10) };
  const job = { ...source.activities[0], activity_id: "A1", contract_number: "C1", total_accesses: 1, planned_start_date: source.horizon_start, predecessor_activity_id: null, start_location_id: "SEC:ALP:S01_S02:EB", end_location_id: "SEC:ALP:S01_S02:EB" };
  return { ...source, horizon_weeks: 10, contracts: [contract], activities: [job], supplies: source.supplies.map((s) => ({ ...s, supply_capacity: 1 })) };
}

describe("difficult scheduling regressions", () => {
  it("protects a cross-contract successor deadline when ordering its predecessor", () => {
    const instance = fixture();
    instance.activities[0].total_accesses = 2;
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", total_accesses: 1 });
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2", planned_completion_date: weekEnd(instance, 2) });
    instance.activities.push({ ...instance.activities[1], activity_id: "A3", contract_number: "C2", predecessor_activity_id: "A2", start_location_id: "SEC:ALP:S01_S02:WB", end_location_id: "SEC:ALP:S01_S02:WB" });
    const result = solve(instance, "B");
    expect(result.report.hard_violations).toEqual([]);
    expect(result.access.find((p) => p.activity_id === "A2")!.week).toBe(1);
    expect(result.access.find((p) => p.activity_id === "A3")!.week).toBe(2);
  });

  it("spreads flexible B possessions over available weeks before buying extra supply", () => {
    const instance = fixture();
    instance.contracts[0].planned_completion_date = weekEnd(instance, 2);
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", contract_number: "C2" });
    const result = solve(instance, "B");
    expect(result.report.feasible).toBe(true);
    expect(result.report.soft_scores.objective_score).toBe(0);
    expect(result.report.soft_scores.excess_access_nights_total).toBe(0);
    expect(result.report.soft_scores.eclo_nights_total).toBe(0);
    expect(result.access.map((p) => p.week).sort()).toEqual([1, 2]);
  });

  it("honours planned starts and predecessor weeks across a long dependency chain", () => {
    const instance = fixture();
    for (let i = 2; i <= 7; i++) instance.activities.push({ ...instance.activities[0], activity_id: `A${i}`, predecessor_activity_id: `A${i - 1}` });
    for (const scenario of ["A", "B", "C"] as const) {
      const result = solve(instance, scenario);
      expect(result.report.hard_violations).toEqual([]);
      expect(result.access.map((p) => p.week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("uses activity priority within a contract to choose the cheaper A delay", () => {
    const instance = fixture();
    instance.contracts[0].contract_priority = 3;
    instance.contracts[0].planned_completion_date = weekEnd(instance, 1);
    instance.activities[0].activity_priority = 3;
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", activity_priority: 1 });
    const result = solve(instance, "A");
    expect(result.report.feasible).toBe(true);
    expect(result.access.find((p) => p.activity_id === "A2")!.week).toBe(1);
    expect(result.report.soft_scores.objective_score).toBe(7);
  });

  it("accepts a cheaper low-priority C delay instead of unnecessary excess possessions", () => {
    const instance = fixture();
    instance.contracts[0].contract_priority = 3;
    instance.contracts[0].planned_completion_date = weekEnd(instance, 1);
    instance.activities[0].activity_priority = 3;
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", contract_number: "C2" });
    const result = solve(instance, "C");
    expect(result.report.feasible).toBe(true);
    expect(result.report.soft_scores.objective_score).toBe(7);
    expect(result.report.soft_scores.excess_access_nights_total).toBe(0);
  });

  it("keeps Live interchange work separate from other-line work under congestion", () => {
    const instance = fixture();
    instance.contracts[0].nature_of_activity = "Live";
    instance.activities[0].start_location_id = instance.activities[0].end_location_id = "SEC:ALP:H01_H02:EB";
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2", nature_of_activity: "Non-live (Others)" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", contract_number: "C2", start_location_id: "SEC:BET:H01_H02:WB", end_location_id: "SEC:BET:H01_H02:WB" });
    for (const scenario of ["A", "B", "C"] as const) {
      const result = solve(instance, scenario);
      expect(result.report.hard_violations).toEqual([]);
      expect(new Set(result.access.map((p) => p.week)).size).toBe(2);
    }
  });
});

describe("closure exemption scope", () => {
  it("permits compatible members of a shared possession while retaining closures against external work", () => {
    const instance = fixture();
    instance.contracts[0].access_type = "C";
    instance.contracts[0].nature_of_activity = "Non-live (Consist)";
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C2", access_type: "C" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A2", contract_number: "C2", end_location_id: "SEC:ALP:S02_S03:EB" });
    const access: Placement[] = instance.activities.map((a) => ({ activity_id: a.activity_id, week: 1, access_seq: 1, eclo: 0, access_night: 1 }));
    const occupancy = access.flatMap((p) => footprint(instance, instance.activities.find((a) => a.activity_id === p.activity_id)!).work.map((location_id) => ({ activity_id: p.activity_id, week: p.week, location_id, co_share_group: "shared" })));
    const report = checkSchedule(instance, "A", access, occupancy);
    expect(report.hard_violations).toEqual([]);
    instance.contracts.push({ ...instance.contracts[0], contract_number: "C3" });
    instance.activities.push({ ...instance.activities[0], activity_id: "A3", contract_number: "C3", start_location_id: "SEC:ALP:S03_S04:EB", end_location_id: "SEC:ALP:S03_S04:EB" });
    const external: Placement = { activity_id: "A3", week: 1, access_seq: 1, eclo: 0, access_night: 1 };
    occupancy.push(...footprint(instance, instance.activities[2]).work.map((location_id) => ({ activity_id: "A3", week: 1, location_id, co_share_group: "external" })));
    expect(checkSchedule(instance, "A", [...access, external], occupancy).hard_violations.some((v) => v.rule === "closure")).toBe(true);
  });
});

describe("generated congestion instances", () => {
  for (const seed of [1, 7, 19]) it(`delivers mixed-nature workloads and dependencies for seed ${seed}`, () => {
    const instance = fixture();
    instance.horizon_weeks = 100;
    const contract = instance.contracts[0]; const activity = instance.activities[0];
    instance.contracts = []; instance.activities = [];
    let state = seed;
    const next = () => { state = (state * 1664525 + 1013904223) >>> 0; return state; };
    const sites = instance.supplies.filter((s) => s.location_id.startsWith("SEC:")).map((s) => s.location_id);
    for (let i = 0; i < 40; i++) {
      const nature = ["Live", "Non-live (Consist)", "Non-live (Others)"][next() % 3] as typeof contract.nature_of_activity;
      const site = sites[next() % sites.length];
      instance.contracts.push({ ...contract, contract_number: `C${i}`, nature_of_activity: nature, contract_priority: next() % 3 + 1, planned_completion_date: weekEnd(instance, 100) });
      instance.activities.push({ ...activity, activity_id: `J${i}`, contract_number: `C${i}`, start_location_id: site, end_location_id: site, total_accesses: next() % 2 + 1, activity_priority: next() % 3 + 1, planned_start_date: weekEnd(instance, next() % 4 + 1), predecessor_activity_id: i > 0 && next() % 3 === 0 ? `J${next() % i}` : null });
    }
    const input = JSON.stringify(instance);
    for (const scenario of ["A", "B", "C"] as const) {
      const result = solve(instance, scenario);
      expect(result.report.hard_violations).toEqual([]);
      expect(result.report.detail.completed_activities).toBe(40);
      expect(checkSchedule(instance, scenario, result.access, result.occupancy, result.results).feasible).toBe(true);
      expect(result.access.every((p) => p.week <= 100)).toBe(true);
      expect(JSON.stringify(instance)).toBe(input);
    }
  }, 30000);
});
