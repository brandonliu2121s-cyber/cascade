import { day, weekEnd, weekOf } from "./instance";
import { footprint, legalMix } from "./topology";
import type { Instance, Scenario, Placement, Occupancy, Result, Report, Violation, Footprint, PlanningOptions } from "./types";

export function completionResults(instance: Instance, scenario: Scenario, access: Placement[]): Result[] {
  return instance.contracts.map((contract) => {
    const ids = new Set(instance.activities.filter((a) => a.contract_number === contract.contract_number).map((a) => a.activity_id));
    const weeks = access.filter((p) => ids.has(p.activity_id)).map((p) => p.week);
    const completion = weeks.length ? weekEnd(instance, Math.max(...weeks)) : instance.horizon_start;
    return { scenario, contract_number: contract.contract_number, simulated_completion_date: completion, overrun_days: Math.max(0, day(completion) - day(contract.planned_completion_date)) };
  });
}
export function checkSchedule(instance: Instance, scenario: Scenario, access: Placement[], occupancy: Occupancy[], results?: Result[], options: PlanningOptions = {}): Report {
  const hard: Violation[] = [];
  const fail = (rule: string, detail: string) => hard.push({ rule, severity: "hard", detail });
  const activities = new Map(instance.activities.map((a) => [a.activity_id, a]));
  const contracts = new Map(instance.contracts.map((c) => [c.contract_number, c]));
  const footprints = new Map<string, Footprint>(instance.activities.map((a) => [a.activity_id, footprint(instance, a)]));
  const locations = new Map(instance.supplies.map((s) => [s.location_id, s]));
  const byActivity = new Map<string, Placement[]>(); const byWeek = new Map<number, Placement[]>();
  const seen = new Set<string>(); const allocations = new Map<string, Placement[]>();
  const ecloWindows: Record<string, number[]> = {};
  for (const p of access) {
    const activity = activities.get(p.activity_id);
    if (!activity) { fail("schema", `Unknown activity ${p.activity_id}`); continue; }
    if (!Number.isInteger(p.week) || p.week < 1 || p.week > 20000 || ![0, 1].includes(p.eclo) || !Number.isInteger(p.access_night) || p.access_night < 1 || !Number.isInteger(p.access_seq) || p.access_seq < 1) { fail("schema", `Invalid access values for ${p.activity_id}`); continue; }
    if (!options.allowHorizonExtension && p.week > instance.horizon_weeks) fail("horizon", `${p.activity_id}, wk${p.week}: outside declared ${instance.horizon_weeks}-week horizon`);
    const key = `${p.activity_id}|${p.week}`;
    if (seen.has(key)) fail("duplicate", `${key}: at most one access per activity-week`);
    seen.add(key);
    byActivity.set(p.activity_id, [...(byActivity.get(p.activity_id) ?? []), p]);
    byWeek.set(p.week, [...(byWeek.get(p.week) ?? []), p]);
    const contract = contracts.get(activity.contract_number)!;
    if (p.week < weekOf(instance, activity.planned_start_date)) fail("planned_start", `${p.activity_id} starts before its planned week`);
    if (p.access_night > contract.number_of_maximum_access_per_week) fail("weekly_allocation", `${p.activity_id}, wk${p.week}: access_night exceeds contract cap`);
    const allocation = `${activity.contract_number}|${activity.activity_type}|${p.week}`;
    allocations.set(allocation, [...(allocations.get(allocation) ?? []), p]);
    if (p.eclo) {
      if (scenario === "A") fail("eclo", `${p.activity_id}, wk${p.week}: ECLO forbidden in A`);
      for (const line of footprints.get(p.activity_id)!.affected_lines) ecloWindows[line] = [...(ecloWindows[line] ?? []), p.week];
    }
  }
  for (const [key, placements] of allocations) {
    const activity = activities.get(placements[0].activity_id)!; const contract = contracts.get(activity.contract_number)!;
    const nights = new Set(placements.map((p) => p.access_night));
    if (nights.size > contract.number_of_maximum_access_per_week) fail("weekly_allocation", `${key}: too many weekly nights`);
    for (const night of nights) if (new Set(placements.filter((p) => p.access_night === night).map((p) => p.activity_id)).size > contract.number_of_workfronts) fail("workfront", `${key}, night${night}: too many simultaneous activities`);
  }
  let completed = 0; let delivered = 0; let weighted = 0;
  const priorityOverrun: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
  for (const activity of instance.activities) {
    const placements = (byActivity.get(activity.activity_id) ?? []).sort((a, b) => a.week - b.week);
    const units = placements.reduce((n, p) => n + (p.eclo ? 1.5 : 1), 0); delivered += units;
    if (units < activity.total_accesses) fail("workload", `${activity.activity_id}: delivered ${units}/${activity.total_accesses} access units`); else completed++;
    if (placements.some((p, i) => p.access_seq !== i + 1)) fail("sequence", `${activity.activity_id}: access_seq must be consecutive in chronological order`);
    if (activity.predecessor_activity_id && placements.length) {
      const predecessors = byActivity.get(activity.predecessor_activity_id) ?? [];
      const predecessor = activities.get(activity.predecessor_activity_id)!;
      const predecessorUnits = predecessors.reduce((n, p) => n + (p.eclo ? 1.5 : 1), 0);
      if (predecessorUnits < predecessor.total_accesses || Math.min(...placements.map((p) => p.week)) <= Math.max(0, ...predecessors.map((p) => p.week))) fail("precedence", `${activity.activity_id}: must start in a later week than ${activity.predecessor_activity_id} finishes`);
    }
    const contract = contracts.get(activity.contract_number)!;
    if (placements.length) {
      const overrun = Math.max(0, day(weekEnd(instance, placements[placements.length - 1].week)) - day(contract.planned_completion_date));
      priorityOverrun[String(contract.contract_priority)] += overrun;
      weighted += ({ 1: 100, 2: 10, 3: 1 }[contract.contract_priority] ?? 1) * (1 + ({ 1: 0.3, 2: 0.2, 3: 0 }[activity.activity_priority] ?? 0)) * overrun;
      if (scenario === "B" && overrun > 0) fail("planned_date", `${activity.activity_id}: finishes ${overrun} days after planned completion`);
    }
  }
  for (const line of Object.keys(ecloWindows)) {
    ecloWindows[line] = [...new Set(ecloWindows[line])].sort((a, b) => a - b);
    if (scenario === "C" && Math.max(...ecloWindows[line]) - Math.min(...ecloWindows[line]) > 1) fail("eclo_window", `${line}: ECLO must fit a single two-week span`);
  }
  const groups = new Map<string, Occupancy[]>(); const occupancyMap = new Map<string, string>();
  for (const o of occupancy) {
    const key = `${o.activity_id}|${o.week}|${o.location_id}`;
    if (occupancyMap.has(key)) fail("occupancy", `Duplicate occupancy ${key}`);
    occupancyMap.set(key, o.co_share_group);
    if (!seen.has(`${o.activity_id}|${o.week}`) || !locations.has(o.location_id) || !footprints.get(o.activity_id)?.work.includes(o.location_id) || !o.co_share_group) { fail("occupancy", `Invalid occupancy ${key}`); continue; }
    const groupKey = `${o.location_id}|${o.week}|${o.co_share_group}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), o]);
  }
  for (const p of access) for (const loc of footprints.get(p.activity_id)?.work ?? []) if (!occupancyMap.has(`${p.activity_id}|${p.week}|${loc}`)) fail("occupancy", `${p.activity_id}, wk${p.week}: missing ${loc}`);
  const usage = new Map<string, Set<string>>();
  for (const [key, group] of groups) {
    const unique = [...new Set(group.map((o) => o.activity_id))];
    const types = unique.map((id) => contracts.get(activities.get(id)!.contract_number)!.access_type);
    if (!legalMix(types)) fail("mix", `${key}: illegal possession mix ${types.join("+")}`);
    const o = group[0]; const usageKey = `${o.location_id}|${o.week}`;
    if (!usage.has(usageKey)) usage.set(usageKey, new Set()); usage.get(usageKey)!.add(o.co_share_group);
  }
  let excess = 0;
  const hotspots: Report["detail"]["capacity_hotspots"] = [];
  for (const [key, slots] of usage) {
    const [location_id, weekString] = key.split("|"); const capacity = locations.get(location_id)!.supply_capacity;
    const extra = Math.max(0, slots.size - capacity); excess += extra;
    if ((scenario === "A" && extra > 0) || (scenario === "C" && extra > 1)) fail("capacity", `${key}: ${slots.size} groups against capacity ${capacity}`);
    if (slots.size >= capacity) hotspots.push({ location_id, week: Number(weekString), used: slots.size, capacity });
  }
  for (const [week, placements] of byWeek) {
    const ids = [...new Set(placements.map((p) => p.activity_id))];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = footprints.get(ids[i])!; const b = footprints.get(ids[j])!;
      const collision = a.closure.filter((loc) => b.closure.includes(loc));
      if (!collision.length) continue;
      const shared = a.work.filter((loc) => b.work.includes(loc));
      const coSharing = shared.length > 0 && shared.every((loc) => occupancyMap.get(`${ids[i]}|${week}|${loc}`) && occupancyMap.get(`${ids[i]}|${week}|${loc}`) === occupancyMap.get(`${ids[j]}|${week}|${loc}`));
      // Different buffer-free possessions may use the same worksite on separate nights.
      // A buffer/mirrored closure may never overlap another possession's span or buffer.
      const protectedCollision = collision.some((loc) => !a.work.includes(loc) || !b.work.includes(loc));
      if (protectedCollision && !coSharing) fail("closure", `wk${week}: ${ids[i]} and ${ids[j]} have overlapping closures at ${collision[0]}`);
    }
  }
  const summary = completionResults(instance, scenario, access);
  if (results) {
    if (results.length !== summary.length) fail("results", "RESULTS must contain one row per contract");
    for (const expected of summary) {
      const matches = results.filter((r) => r.contract_number === expected.contract_number);
      if (matches.length !== 1 || matches[0].scenario !== scenario || matches[0].simulated_completion_date !== expected.simulated_completion_date || matches[0].overrun_days !== expected.overrun_days) fail("results", `Incorrect completion summary for ${expected.contract_number}`);
    }
  }
  const eclo = access.filter((p) => p.eclo === 1).length;
  weighted = Math.round(weighted * 1000) / 1000;
  const objective = (scenario === "B" ? 0 : weighted) + (scenario === "A" ? 0 : 7 * excess + 5 * eclo);
  return {
    scenario, feasible: hard.length === 0, checker: "Cascade local PS1 checker (not the official validator)", hard_violations: hard,
    soft_scores: { overrun_days_total: summary.reduce((n, r) => n + r.overrun_days, 0), contracts_overrunning: summary.filter((r) => r.overrun_days > 0).length, earliness_days_total: summary.reduce((n, r) => n + Math.max(0, day(contracts.get(r.contract_number)!.planned_completion_date) - day(r.simulated_completion_date)), 0), excess_access_nights_total: excess, eclo_nights_total: eclo, priority_overrun: priorityOverrun, priority_weighted_score: weighted, objective_score: hard.length ? null : Math.round(objective * 1000) / 1000, formula_version: "PS1 published per-activity tier-weighted penalty" },
    detail: { capacity_hotspots: hotspots, nights_scheduled: access.length, completed_activities: completed, total_activities: instance.activities.length, workload_required: instance.activities.reduce((n, a) => n + a.total_accesses, 0), workload_delivered: delivered, horizon_weeks_used: Math.max(0, ...access.map((p) => p.week)), eclo_windows: ecloWindows },
  };
}
