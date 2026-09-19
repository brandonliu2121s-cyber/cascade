import { day } from "./instance";
import { footprint } from "./topology";
import type { CapacityChange, Instance, Placement, ReplanComparison, Solution } from "./types";

export function comparePlans(instance: Instance, baseline: Solution, revised: Solution, disruption: CapacityChange): ReplanComparison {
  const signature = (solution: Solution, p: Placement) => JSON.stringify([p.week, p.eclo, p.access_night, solution.occupancy.filter(o => o.activity_id === p.activity_id && o.week === p.week).map(o => [o.location_id, o.co_share_group]).sort()]);
  const rows = (solution: Solution, id: string) => solution.access.filter(p => p.activity_id === id).sort((a, b) => a.week - b.week);
  const changed = instance.activities.filter(job => JSON.stringify(rows(baseline, job.activity_id).map(p => signature(baseline, p))) !== JSON.stringify(rows(revised, job.activity_id).map(p => signature(revised, p)))).map(a => a.activity_id);
  const direct = instance.activities.filter(job => footprint(instance, job).work.includes(disruption.location_id) && baseline.access.some(p => p.activity_id === job.activity_id && p.week >= disruption.from_week && p.week <= disruption.to_week)).map(a => a.activity_id);
  return {
    scenario: revised.scenario,
    frozenPlacements: baseline.access.filter(p => p.week < disruption.from_week).length,
    retainedPlacements: baseline.access.filter(p => rows(revised, p.activity_id).some(after => signature(baseline, p) === signature(revised, after))).length,
    changedActivities: changed, directlyAffectedActivities: direct,
    changes: changed.map(id => {
      const job = instance.activities.find(a => a.activity_id === id)!;
      const before = rows(baseline, id); const after = rows(revised, id);
      const units = (placements: Placement[]) => placements.reduce((n, p) => n + (p.eclo ? 1.5 : 1), 0);
      const evidence = revised.explanations.find(e => e.activity_id === id)?.detail ?? "Repacked under the revised constraints.";
      const reason = direct.includes(id) ? `Baseline work occupies ${disruption.location_id} in weeks ${disruption.from_week}–${disruption.to_week}; revised nominal capacity is ${disruption.supply_capacity}. ${evidence}` : job.predecessor_activity_id && changed.includes(job.predecessor_activity_id) ? `Predecessor ${job.predecessor_activity_id} has revised allocations; finish-to-start precedence remains enforced. ${evidence}` : evidence;
      return { activity_id: id, beforeWeeks: before.map(p => p.week), afterWeeks: after.map(p => p.week), beforeUnits: units(before), afterUnits: units(after), reason };
    }),
    contractChanges: revised.results.map(result => {
      const before = baseline.results.find(r => r.contract_number === result.contract_number)!;
      return { contract_number: result.contract_number, beforeCompletion: before.simulated_completion_date, afterCompletion: result.simulated_completion_date, delayDays: day(result.simulated_completion_date) - day(before.simulated_completion_date) };
    }).filter(result => result.beforeCompletion !== result.afterCompletion),
  };
}
