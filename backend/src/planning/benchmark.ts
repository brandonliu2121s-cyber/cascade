import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { INPUT_FILES, parseInstance, weekEnd } from "./instance";
import { footprint } from "./topology";
import { solve } from "./solve";
import { comparePlans } from "./replan";
import type { Activity, CapacityChange, Contract, Instance, Nature, Scenario, Solution } from "./types";

export function benchmarkInstances(): { name: string; instance: Instance }[] {
  const directory = resolve(__dirname, "../../data/official_dataset");
  const source = parseInstance(Object.fromEntries(INPUT_FILES.map(name => [name, readFileSync(resolve(directory, name), "utf8")])));
  const make = (name: string, specs: { location: string; units: number; nature?: Nature; predecessor?: number; startWeek?: number }[]) => {
    const instance: Instance = { ...structuredClone(source), horizon_weeks: 18, contracts: [], activities: [] };
    specs.forEach((spec, i) => {
      const contract: Contract = { ...source.contracts[0], contract_number: `${name}-C${i + 1}`, contract_description: name, nature_of_activity: spec.nature ?? "Non-live (Others)", access_type: i % 2 ? "PC" : "C", contract_priority: i % 3 + 1, number_of_workfronts: 1, number_of_maximum_access_per_week: 1, planned_completion_date: weekEnd(instance, 14), contract_completion_date: weekEnd(instance, 18) };
      const activity: Activity = { activity_id: `${name}-A${i + 1}`, contract_number: contract.contract_number, activity_type: contract.activity_type, start_location_id: spec.location, end_location_id: spec.location, total_accesses: spec.units, planned_start_date: new Date(Date.parse(`${instance.horizon_start}T00:00:00Z`) + ((spec.startWeek ?? 1) - 1) * 7 * 86400000).toISOString().slice(0, 10), predecessor_activity_id: spec.predecessor === undefined ? null : `${name}-A${spec.predecessor + 1}`, activity_priority: i % 3 + 1 };
      instance.contracts.push(contract); instance.activities.push(activity);
    });
    return { name, instance };
  };
  return [
    make("dependency-chain", [{ location: "SEC:ALP:S01_S02:EB", units: 4 }, { location: "SEC:BET:S17_S18:EB", units: 3, predecessor: 0 }, { location: "SEC:ALP:S07_S08:WB", units: 2, predecessor: 1 }, { location: "SEC:BET:S11_S12:WB", units: 5 }]),
    make("capacity-congestion", Array.from({ length: 8 }, (_, i) => ({ location: "SEC:ALP:S05_S06:EB", units: 3 + i % 2, startWeek: i > 5 ? 3 : 1 }))),
    make("mixed-nature-interchange", [{ location: "SEC:ALP:H01_H02:EB", units: 4, nature: "Live" }, { location: "SEC:BET:H01_H02:WB", units: 4, nature: "Non-live (Consist)" }, { location: "SEC:BET:S17_S18:EB", units: 3 }, { location: "SEC:ALP:S01_S02:WB", units: 4, nature: "Non-live (Consist)" }, { location: "PLAT:ALP:H01:WB", units: 2, nature: "Live", predecessor: 0 }]),
  ];
}

function placementSignature(solution: Solution, activityId: string, week: number): string {
  const p = solution.access.find(row => row.activity_id === activityId && row.week === week);
  return JSON.stringify([p, solution.occupancy.filter(row => row.activity_id === activityId && row.week === week).map(row => [row.location_id, row.co_share_group]).sort()]);
}

function metrics(instance: Instance, baseline: Solution, solution: Solution, disruption: CapacityChange, runtimeSamples: number[]) {
  const comparison = comparePlans(instance, baseline, solution, disruption);
  const frozen = baseline.access.filter(p => p.week < disruption.from_week);
  const preserved = frozen.filter(p => placementSignature(baseline, p.activity_id, p.week) === placementSignature(solution, p.activity_id, p.week)).length;
  return {
    feasible: solution.report.feasible, hardViolations: solution.report.hard_violations.length,
    violationRules: [...new Set(solution.report.hard_violations.map(v => v.rule))],
    completedActivities: solution.report.detail.completed_activities, totalActivities: solution.report.detail.total_activities,
    workloadRequired: solution.report.detail.workload_required, workloadDelivered: solution.report.detail.workload_delivered,
    objective: solution.report.soft_scores.objective_score, excessAccessNights: solution.report.soft_scores.excess_access_nights_total, changedActivities: comparison.changedActivities.length,
    changedActivityIds: comparison.changedActivities, retainedPlacements: comparison.retainedPlacements,
    frozenPlacements: frozen.length, frozenPreserved: preserved, allFrozenPreserved: preserved === frozen.length,
    runtimeMillis: [...runtimeSamples].sort((a, b) => a - b)[Math.floor(runtimeSamples.length / 2)], runtimeSamplesMillis: runtimeSamples, sampleCount: runtimeSamples.length,
  };
}

export function runBenchmark(sampleCount = 3) {
  if (!Number.isInteger(sampleCount) || sampleCount < 1) throw new Error("Benchmark sample count must be a positive integer");
  const rows = benchmarkInstances().flatMap(({ name, instance }) => (["A", "B", "C"] as Scenario[]).map(scenario => {
    const timed = (action: () => Solution) => {
      let solution!: Solution; const samples: number[] = [];
      for (let i = 0; i < sampleCount; i++) { const start = performance.now(); solution = action(); samples.push(performance.now() - start); }
      return { solution, samples };
    };
    const baseline = timed(() => solve(instance, scenario));
    if (!baseline.solution.report.feasible) throw new Error(`${name}/${scenario}: benchmark baseline is not feasible`);
    const target = baseline.solution.access.find(p => p.week >= 2)!;
    const job = instance.activities.find(a => a.activity_id === target.activity_id)!;
    const disruption: CapacityChange = { location_id: footprint(instance, job).work[0], from_week: target.week, to_week: target.week + 2, supply_capacity: 0 };
    const options = { capacityChanges: [disruption] };
    const repair = timed(() => solve(instance, scenario, options, { baseline: baseline.solution, fromWeek: disruption.from_week }));
    const fresh = timed(() => solve(instance, scenario, options));
    return { instance: name, scenario, disruption, directlyAffectedActivities: comparePlans(instance, baseline.solution, repair.solution, disruption).directlyAffectedActivities,
      unchangedBaseline: metrics(instance, baseline.solution, baseline.solution, disruption, baseline.samples),
      seededRepair: metrics(instance, baseline.solution, repair.solution, disruption, repair.samples),
      freshSolve: metrics(instance, baseline.solution, fresh.solution, disruption, fresh.samples) };
  }));
  return { schemaVersion: 1, deterministicWorkloads: true, instanceCount: 3, scenarioCount: 3, comparisonCount: rows.length, samplesPerMethod: sampleCount,
    runtimeStatistic: "median wall-clock milliseconds; no warm-up; methods run baseline, repair, fresh in that order",
    caveats: ["Synthetic Cascade benchmark; runtimes are not representative of production performance.", "Heuristic repair does not guarantee minimum churn or global optimality; infeasible outputs are reported as measured.", "Fresh rebuilding can rewrite assumed executed history and is not dispatchable when allFrozenPreserved is false.", "Unchanged baseline metrics have no capacity overlay; repair and fresh solve use the identical reported overlay.", "A zero nominal-capacity overlay is not a total closure in scenarios B/C: their extra-access rules can preserve affected allocations.", "Workloads and schedules are deterministic; measured runtimes vary with the machine and process state."], rows };
}

if (require.main === module) {
  try {
    if (process.argv.length > 3) throw new Error("Usage: npm run planning:benchmark -- [output-file.json]");
    const output = JSON.stringify(runBenchmark(), null, 2) + "\n";
    if (process.argv[2]) writeFileSync(resolve(process.argv[2]), output, "utf8"); else process.stdout.write(output);
  } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
