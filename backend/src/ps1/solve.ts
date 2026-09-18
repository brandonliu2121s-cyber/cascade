import { day, weekOf, weekEnd } from "./instance";
import { footprint, legalMix } from "./topology";
import { checkSchedule, completionResults } from "./check";
import { writeCsv } from "./csv";
import { capacityAt, validateCapacityChanges } from "./capacity";
import type { Instance, Scenario, Placement, Occupancy, Solution, Footprint, PlanningOptions, Activity } from "./types";

interface Packed { placement: Placement; group: string; footprint: Footprint; contract: string; activity_type: string }
function attempt(instance: Instance, scenario: Scenario, strategy: number, useEclo: boolean, aggressive = false, options: PlanningOptions = {}, preferNominal = false): Solution {
  const contracts = new Map(instance.contracts.map((c) => [c.contract_number, c]));
  const jobs = new Map(instance.activities.map((a) => [a.activity_id, a]));
  const footprints = new Map(instance.activities.map((a) => [a.activity_id, footprint(instance, a)]));
  const remaining = new Map(instance.activities.map((a) => [a.activity_id, a.total_accesses]));
  const finishes = new Map<string, number>(); const accesses: Placement[] = []; const occupancy: Occupancy[] = [];
  const sequences = new Map<string, number>(); const windows = new Map<string, number>();
  const waiting = new Map<string, Set<string>>();
  const chainLength = (id: string): number => {
    const successors = instance.activities.filter((a) => a.predecessor_activity_id === id);
    return successors.length ? Math.max(...successors.map((a) => Math.ceil(a.total_accesses / (scenario === "B" ? 1.5 : 1)) + chainLength(a.activity_id))) : 0;
  };
  const tails = new Map(instance.activities.map((a) => [a.activity_id, chainLength(a.activity_id)]));
  // A predecessor must also protect the dates of contracts downstream of it.
  const latestFinishes = new Map<string, number>();
  const latestFinish = (id: string): number => {
    if (latestFinishes.has(id)) return latestFinishes.get(id)!;
    const job = jobs.get(id)!;
    const contract = contracts.get(job.contract_number)!;
    let latest = Math.floor((day(contract.planned_completion_date) - day(instance.horizon_start) + 1) / 7);
    for (const successor of instance.activities.filter((a) => a.predecessor_activity_id === id)) {
      const duration = Math.ceil(successor.total_accesses / (useEclo ? 1.5 : 1));
      latest = Math.min(latest, latestFinish(successor.activity_id) - duration);
    }
    latestFinishes.set(id, latest);
    return latest;
  };
  instance.activities.forEach((a) => latestFinish(a.activity_id));
  const maxWeeks = options.allowHorizonExtension ? Math.min(20000, Math.max(instance.horizon_weeks, ...instance.activities.map((a) => weekOf(instance, a.planned_start_date))) + instance.activities.reduce((n, a) => n + Math.ceil(a.total_accesses), 0) + 2) : instance.horizon_weeks;
  for (let week = 1; week <= maxWeeks && finishes.size < jobs.size; week++) {
    const packed: Packed[] = [];
    const ready = instance.activities.filter((a) => remaining.get(a.activity_id)! > 0 && week >= weekOf(instance, a.planned_start_date) && (!a.predecessor_activity_id || (finishes.has(a.predecessor_activity_id) && finishes.get(a.predecessor_activity_id)! < week)));
    const slack = (id: string): number => {
      if (strategy === 3) return latestFinish(id) - week + 1 - Math.ceil(remaining.get(id)! / (useEclo ? 1.5 : 1));
      const job = jobs.get(id)!; const c = contracts.get(job.contract_number)!;
      const deadline = Math.floor((day(c.planned_completion_date) - day(instance.horizon_start) + 1) / 7);
      return deadline - week + 1 - Math.ceil(remaining.get(id)! / (scenario === "B" ? 1.5 : 1)) - tails.get(id)!;
    };
    ready.sort((a, b) => {
      const ca = contracts.get(a.contract_number)!; const cb = contracts.get(b.contract_number)!;
      const tier = ca.contract_priority - cb.contract_priority;
      const urgency = slack(a.activity_id) - slack(b.activity_id);
      const length = remaining.get(b.activity_id)! - remaining.get(a.activity_id)!;
      if (strategy === 3) return urgency || tier || a.activity_priority - b.activity_priority || length || a.activity_id.localeCompare(b.activity_id);
      if (strategy === 0) return urgency || tier || length || a.activity_id.localeCompare(b.activity_id);
      if (strategy === 1) return tier || urgency || length || a.activity_id.localeCompare(b.activity_id);
      return (day(ca.planned_completion_date) - day(cb.planned_completion_date)) || urgency || tier || a.activity_id.localeCompare(b.activity_id);
    });
    for (const job of ready) {
      const c = contracts.get(job.contract_number)!; const f = footprints.get(job.activity_id)!;
      const units = remaining.get(job.activity_id)!;
      const latestWeek = strategy === 3 ? latestFinish(job.activity_id) : Math.floor((day(c.planned_completion_date) - day(instance.horizon_start) + 1) / 7);
      const weeksLeft = Math.max(0, latestWeek - week + 1);
      let eclo: 0 | 1 = 0;
      if (useEclo && scenario !== "A" && units > 1 && (units > weeksLeft || aggressive)) {
        const weight = ({ 1: 100, 2: 10, 3: 1 }[c.contract_priority] ?? 1) * (1 + ({ 1: 0.3, 2: 0.2, 3: 0 }[job.activity_priority] ?? 0));
        const savesWeek = Math.ceil(units) > Math.ceil(units - 0.5);
        const allowedWindow = f.affected_lines.every((line) => !windows.has(line) || (week >= windows.get(line)! && week <= windows.get(line)! + 1));
        // B uses additional working time whenever needed to keep the fixed date.
        // C buys time only inside its window when the predicted delay penalty outweighs ECLO.
        if (scenario === "B" || (allowedWindow && (savesWeek || units > weeksLeft + 0.5) && weight * 7 > 5)) eclo = 1;
      }
      const reasons = new Set<string>();
      let chosenNight = 0;
      for (let night = 1; night <= c.number_of_maximum_access_per_week; night++) {
        if (packed.filter((p) => p.contract === job.contract_number && p.activity_type === job.activity_type && p.placement.access_night === night).length < c.number_of_workfronts) { chosenNight = night; break; }
      }
      if (!chosenNight) { reasons.add("contract weekly access/workfront limit"); waiting.set(job.activity_id, new Set([...(waiting.get(job.activity_id) ?? []), ...reasons])); continue; }
      let chosenGroup: string | null = null;
      for (let groupIndex = 1; groupIndex <= packed.length + 1; groupIndex++) {
        const group = `b${groupIndex}`;
        let valid = true;
        let extraCost = 0;
        for (const other of packed) {
          const collision = f.closure.filter((loc) => other.footprint.closure.includes(loc));
          if (!collision.length) continue;
          const protectedCollision = collision.some((loc) => !f.work.includes(loc) || !other.footprint.work.includes(loc));
          const sharesWork = f.work.some((loc) => other.footprint.work.includes(loc));
          if (protectedCollision && !(sharesWork && other.group === group)) { reasons.add("safety buffer/live closure"); valid = false; break; }
        }
        if (!valid) continue;
        for (const loc of f.work) {
          const occupants = packed.filter((p) => p.footprint.work.includes(loc));
          const same = occupants.filter((p) => p.group === group);
          if (!legalMix([...same.map((p) => contracts.get(p.contract)!.access_type), c.access_type])) { reasons.add("possession mix or four-activity limit"); valid = false; break; }
          const groups = new Set([...occupants.map((p) => p.group), group]);
          const extra = Math.max(0, groups.size - capacityAt(instance, loc, week, options));
          if ((scenario === "A" && extra > 0) || (scenario === "C" && extra > 1)) { reasons.add("location supply capacity"); valid = false; break; }
          // Try a cheaper B plan before buying another possession. Keep the
          // unrestricted passes as fallback when congestion consumes the slack.
          const addsExtra = !occupants.some((p) => p.group === group) && extra > 0;
          if (addsExtra) extraCost += 7;
          const standardWeeks = Math.ceil(units);
          const spareWeeks = Math.min(latestFinish(job.activity_id), maxWeeks) - week + 1 - standardWeeks;
          if (preferNominal && scenario === "B" && addsExtra && spareWeeks > 0) { reasons.add("avoiding extra supply while deadline slack remains"); valid = false; break; }
        }
        const delayWeight = ({ 1: 100, 2: 10, 3: 1 }[c.contract_priority] ?? 1) * (1 + ({ 1: 0.3, 2: 0.2, 3: 0 }[job.activity_priority] ?? 0));
        const isLeaf = !instance.activities.some((a) => a.predecessor_activity_id === job.activity_id);
        if (valid && preferNominal && scenario === "C" && isLeaf && Math.ceil(units) <= maxWeeks - week && extraCost > delayWeight * 7) {
          reasons.add("trying a lower-cost delay instead of excess supply"); valid = false;
        }
        if (valid) { chosenGroup = group; break; }
      }
      if (chosenGroup === null) { waiting.set(job.activity_id, new Set([...(waiting.get(job.activity_id) ?? []), ...reasons])); continue; }
      if (eclo && scenario === "C") for (const line of f.affected_lines) if (!windows.has(line)) windows.set(line, week);
      const seq = (sequences.get(job.activity_id) ?? 0) + 1; sequences.set(job.activity_id, seq);
      const placement: Placement = { activity_id: job.activity_id, access_seq: seq, week, eclo, access_night: chosenNight };
      accesses.push(placement);
      packed.push({ placement, group: chosenGroup, footprint: f, contract: job.contract_number, activity_type: job.activity_type });
      for (const location_id of f.work) occupancy.push({ activity_id: job.activity_id, week, location_id, co_share_group: chosenGroup });
      const rest = units - (eclo ? 1.5 : 1); remaining.set(job.activity_id, rest);
      if (rest <= 0) finishes.set(job.activity_id, week);
    }
    if (!packed.length && !ready.length && week >= Math.max(...instance.activities.map((a) => weekOf(instance, a.planned_start_date)))) break;
  }
  accesses.sort((a, b) => a.activity_id.localeCompare(b.activity_id) || a.week - b.week);
  // Remove ECLO that provides only surplus workload; this changes neither
  // occupied locations nor predecessor finish weeks, and narrows C's windows.
  for (const job of instance.activities) {
    const placements = accesses.filter((p) => p.activity_id === job.activity_id);
    let surplus = placements.reduce((n, p) => n + (p.eclo ? 1.5 : 1), 0) - job.total_accesses;
    for (const placement of [...placements].reverse()) if (placement.eclo && surplus >= 0.5) { placement.eclo = 0; surplus -= 0.5; }
  }
  occupancy.sort((a, b) => a.activity_id.localeCompare(b.activity_id) || a.week - b.week || a.location_id.localeCompare(b.location_id));
  const results = completionResults(instance, scenario, accesses);
  const report = checkSchedule(instance, scenario, accesses, occupancy, results, options);
  const sharingGroups = new Map<string, Set<string>>();
  for (const o of occupancy) {
    const key = `${o.week}|${o.location_id}|${o.co_share_group}`;
    if (!sharingGroups.has(key)) sharingGroups.set(key, new Set());
    sharingGroups.get(key)!.add(o.activity_id);
  }
  const explanations = instance.activities.map((job) => {
    const placements = accesses.filter((p) => p.activity_id === job.activity_id);
    const reasons = [...(waiting.get(job.activity_id) ?? [])];
    const c = contracts.get(job.contract_number)!;
    const sharing = occupancy.some((o) => o.activity_id === job.activity_id && sharingGroups.get(`${o.week}|${o.location_id}|${o.co_share_group}`)!.size > 1);
    const last = placements.length ? weekEnd(instance, placements[placements.length - 1].week) : "not scheduled";
    return { activity_id: job.activity_id, detail: `${placements.length} access placements, finish ${last}. Contract priority ${c.contract_priority}. ${job.predecessor_activity_id ? `Starts after ${job.predecessor_activity_id}. ` : ""}${sharing ? "Shares compatible possession capacity. " : ""}${placements.some((p) => p.eclo) ? "Uses ECLO to reduce completion delay. " : ""}${reasons.length ? `Waited for ${reasons.join(", ")}.` : "Placed when planned start and capacity allowed."}` };
  });
  const warnings = ["Heuristic schedule; global optimality is not guaranteed. Check exported files with the organisers' validator when available.", "Local safety checks conservatively forbid overlapping buffers between separate possessions. The published reference sample contains overlaps under this interpretation; confirm the intended rule with organisers."];
  if (!options.allowHorizonExtension && !report.feasible) warnings.push(`Planning is limited to the declared ${instance.horizon_weeks}-week horizon; incomplete workload is reported. Diagnostics do not prove mathematical infeasibility.`);
  if (report.detail.horizon_weeks_used > instance.horizon_weeks) warnings.push(`Planning extended from ${instance.horizon_weeks} to ${report.detail.horizon_weeks_used} weeks using the instance's flat weekly supply.`);
  if (!report.feasible && scenario === "B") warnings.push("A deadline-feasible B schedule was not found. All obtainable workload is retained; diagnostics do not prove mathematical infeasibility.");
  return { scenario, access: accesses, occupancy, results, report, explanations, warnings, csv: {
    "SCHEDULE_ACCESS.csv": writeCsv(["activity_id", "access_seq", "week", "eclo", "access_night"], accesses),
    "SCHEDULE_OCCUPANCY.csv": writeCsv(["activity_id", "week", "location_id", "co_share_group"], occupancy),
    "RESULTS.csv": writeCsv(["scenario", "contract_number", "simulated_completion_date", "overrun_days"], results),
  } };
}
export function solve(instance: Instance, scenario: Scenario, options: PlanningOptions = {}, _repair?: { baseline: Solution; fromWeek: number }): Solution {
  validateCapacityChanges(instance, options.capacityChanges);
  if (_repair) return solveRepair(instance, scenario, options, _repair);
  return solveFresh(instance, scenario, options);
}

function solveFresh(instance: Instance, scenario: Scenario, options: PlanningOptions): Solution {
  const candidates: Solution[] = [];
  for (let strategy = 0; strategy < 4; strategy++) {
    candidates.push(attempt(instance, scenario, strategy, scenario === "B", false, options));
    if (scenario === "B") candidates.push(attempt(instance, scenario, strategy, true, true, options));
    if (scenario === "B") candidates.push(attempt(instance, scenario, strategy, true, false, options, true));
    if (scenario === "C") candidates.push(attempt(instance, scenario, strategy, true, false, options));
    if (scenario === "C") candidates.push(attempt(instance, scenario, strategy, true, false, options, true));
  }
  candidates.sort((a, b) => Number(!a.report.feasible) - Number(!b.report.feasible) || (a.report.detail.total_activities - a.report.detail.completed_activities) - (b.report.detail.total_activities - b.report.detail.completed_activities) || a.report.hard_violations.length - b.report.hard_violations.length || (a.report.soft_scores.objective_score ?? a.report.soft_scores.priority_weighted_score) - (b.report.soft_scores.objective_score ?? b.report.soft_scores.priority_weighted_score) || a.report.detail.horizon_weeks_used - b.report.detail.horizon_weeks_used);
  return candidates[0];
}

function weekStartDate(instance: Instance, week: number): string {
  return new Date(Date.parse(`${instance.horizon_start}T00:00:00Z`) + (week - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
}

function solveRepair(instance: Instance, scenario: Scenario, options: PlanningOptions, repair: { baseline: Solution; fromWeek: number }): Solution {
  const fromWeek = Math.max(1, Math.floor(repair.fromWeek));
  const baseline = repair.baseline;
  const frozenAccess = baseline.access.filter((row) => row.week < fromWeek).map((row) => ({ ...row }));
  const frozenOccupancy = baseline.occupancy.filter((row) => row.week < fromWeek).map((row) => ({ ...row }));
  const delivered = new Map<string, number>();
  const frozenCount = new Map<string, number>();
  const frozenLatestWeek = new Map<string, number>();
  for (const row of frozenAccess) {
    delivered.set(row.activity_id, (delivered.get(row.activity_id) ?? 0) + (row.eclo ? 1.5 : 1));
    frozenCount.set(row.activity_id, (frozenCount.get(row.activity_id) ?? 0) + 1);
    frozenLatestWeek.set(row.activity_id, Math.max(frozenLatestWeek.get(row.activity_id) ?? 0, row.week));
  }
  const draftedActivities: Activity[] = instance.activities
    .map((activity) => {
      const remaining = Math.max(0, activity.total_accesses - (delivered.get(activity.activity_id) ?? 0));
      if (remaining <= 0) return null;
      const earliest = Math.max(weekOf(instance, activity.planned_start_date), fromWeek, (frozenLatestWeek.get(activity.activity_id) ?? 0) + 1);
      return { ...activity, total_accesses: remaining, planned_start_date: weekStartDate(instance, earliest) };
    })
    .filter((activity): activity is Activity => activity !== null);
  const draftedActivityIds = new Set(draftedActivities.map((activity) => activity.activity_id));
  const remainingActivities: Activity[] = draftedActivities.map((activity) => {
      if (!activity.predecessor_activity_id) return activity;
      return draftedActivityIds.has(activity.predecessor_activity_id) ? activity : { ...activity, predecessor_activity_id: null };
    });
  const rebuilt = remainingActivities.length ? solveFresh({ ...instance, activities: remainingActivities }, scenario, options) : null;
  const repairedAccess = [
    ...frozenAccess,
    ...(rebuilt?.access ?? []).map((row) => ({ ...row, access_seq: row.access_seq + (frozenCount.get(row.activity_id) ?? 0) })),
  ].sort((a, b) => a.activity_id.localeCompare(b.activity_id) || a.week - b.week);
  for (const activityId of new Set(repairedAccess.map((row) => row.activity_id))) {
    let sequence = 1;
    for (const row of repairedAccess.filter((entry) => entry.activity_id === activityId)) row.access_seq = sequence++;
  }
  const repairedOccupancy = [...frozenOccupancy, ...(rebuilt?.occupancy ?? [])].sort((a, b) => a.activity_id.localeCompare(b.activity_id) || a.week - b.week || a.location_id.localeCompare(b.location_id));
  const results = completionResults(instance, scenario, repairedAccess);
  const report = checkSchedule(instance, scenario, repairedAccess, repairedOccupancy, results, options);
  const warnings = rebuilt?.warnings ?? [];
  const explanations = instance.activities.map((activity) => rebuilt?.explanations.find((row) => row.activity_id === activity.activity_id)
    ?? baseline.explanations.find((row) => row.activity_id === activity.activity_id)
    ?? { activity_id: activity.activity_id, detail: "Preserved from baseline history." });
  return {
    scenario,
    access: repairedAccess,
    occupancy: repairedOccupancy,
    results,
    report,
    explanations,
    warnings,
    csv: {
      "SCHEDULE_ACCESS.csv": writeCsv(["activity_id", "access_seq", "week", "eclo", "access_night"], repairedAccess),
      "SCHEDULE_OCCUPANCY.csv": writeCsv(["activity_id", "week", "location_id", "co_share_group"], repairedOccupancy),
      "RESULTS.csv": writeCsv(["scenario", "contract_number", "simulated_completion_date", "overrun_days"], results),
    },
  };
}
