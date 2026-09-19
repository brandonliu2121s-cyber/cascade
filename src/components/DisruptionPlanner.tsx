import { useState } from "react";
import { usePlanning } from "../lib/planning-context";
import { replanInstance, type CapacityChange, type PlanningResponse, type ReplanResponse, type Scenario, type Solution } from "../lib/ps1";
import { Button, Card, Input, Label, Select } from "./ui";

interface Preview {
  response: ReplanResponse;
  baseline: PlanningResponse;
  scenario: Scenario;
  baseRevision: number;
  disruption: CapacityChange;
}
const scenarios: Scenario[] = ["A", "B", "C"];
function metrics(solution: Solution) {
  return [solution.report.feasible ? "Feasible" : "Infeasible", `${solution.report.detail.workload_delivered} / ${solution.report.detail.workload_required}`, solution.report.detail.nights_scheduled, solution.report.soft_scores.overrun_days_total, solution.report.soft_scores.contracts_overrunning, solution.report.detail.horizon_weeks_used];
}

export function DisruptionPlanner({ parentWorking = false, onWorkingChange }: { parentWorking?: boolean; onWorkingChange: (working: boolean) => void }) {
  const { files, instance, response, options, revision, selected, stale, busy, applyReplan } = usePlanning();
  const [location, setLocation] = useState("");
  const [fromWeek, setFromWeek] = useState("1");
  const [toWeek, setToWeek] = useState("1");
  const [capacity, setCapacity] = useState("0");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  if (!instance) return null;
  const currentLocation = instance.supplies.find((row) => row.location_id === location) ?? instance.supplies[0];
  const disabled = busy || working || parentWorking;
  const ready = !stale && response !== null && scenarios.every((scenario) => response.solutions.some((solution) => solution.scenario === scenario && solution.report.feasible));
  const outdated = preview !== null && preview.baseRevision !== revision;
  const feasible = preview !== null && scenarios.every((scenario) => preview.response.solutions.some((solution) => solution.scenario === scenario && solution.report.feasible));
  const comparison = preview?.response.comparisons.find((row) => row.scenario === preview.scenario);
  const before = preview?.baseline.solutions.find((row) => row.scenario === preview.scenario);
  const after = preview?.response.solutions.find((row) => row.scenario === preview.scenario);
  function invalidate() { setPreview(null); setError(""); }
  async function generate() {
    if (!ready || !response || !currentLocation || disabled) return;
    setPreview(null); setError(""); setWorking(true); onWorkingChange(true);
    try {
      const start = Number(fromWeek); const end = Number(toWeek); const amount = Number(capacity);
      if (!fromWeek.trim() || !toWeek.trim() || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > instance!.horizon_weeks) throw new Error(`Enter an inclusive whole-number week range from 1 to ${instance!.horizon_weeks}, with the end at or after the start.`);
      if (!capacity.trim() || !Number.isInteger(amount) || amount < 0 || amount > 1000) throw new Error("Enter a whole-number capacity from 0 to 1000.");
      const disruption: CapacityChange = { location_id: currentLocation.location_id, from_week: start, to_week: end, supply_capacity: amount };
      const capturedFiles = { ...files };
      const capturedOptions = structuredClone(options);
      const baseline = structuredClone(response);
      const scenario = selected;
      const baseRevision = revision;
      const baselines = Object.fromEntries(scenarios.map((key) => [key, { ...baseline.solutions.find((solution) => solution.scenario === key)!.csv }])) as Record<Scenario, Record<string, string>>;
      const result = await replanInstance(capturedFiles, baselines, disruption, capturedOptions);
      setPreview({ response: result, baseline, scenario, baseRevision, disruption });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Disruption preview failed."); }
    finally { setWorking(false); onWorkingChange(false); }
  }
  function apply() {
    if (!preview || outdated || disabled || !feasible) return;
    try { applyReplan(preview.response, preview.baseRevision); setPreview(null); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to apply disruption preview."); }
  }
  return <section className="space-y-5" aria-labelledby="disruption-heading">
    <Card className="space-y-4 p-5">
      <h2 id="disruption-heading" className="text-xl font-semibold">Disruption replanning</h2>
      <p className="text-sm text-ink/60">Change a location’s capacity for an inclusive week range, then compare the repaired schedule with the current baseline.</p>
      <p className="text-sm text-ink/60">Allocations before the start week are preserved as assumed history. A supply reduction is a nominal capacity derating; scenarios B and C can buy flexibility.</p>
      <p className="text-sm text-ink/60">Capacity overlays are local exploratory assumptions. These results are not proof from the official CSV validator.</p>
      {!ready && <p role="status" className="text-sm text-line-red">Generate a current, feasible baseline for all three scenarios before replanning.</p>}
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <div className="space-y-2"><Label htmlFor="disruption-location">Location</Label><Select id="disruption-location" value={currentLocation?.location_id ?? ""} disabled={disabled} onChange={(event) => { invalidate(); setLocation(event.target.value); }}>{instance.supplies.map((row) => <option key={row.location_id} value={row.location_id}>{row.location_id} · nominal {row.supply_capacity}</option>)}</Select></div>
        <div className="space-y-2"><Label htmlFor="disruption-start">Start week (inclusive)</Label><Input id="disruption-start" type="number" min={1} max={instance.horizon_weeks} step={1} required value={fromWeek} disabled={disabled} onChange={(event) => { invalidate(); setFromWeek(event.target.value); }} /></div>
        <div className="space-y-2"><Label htmlFor="disruption-end">End week (inclusive)</Label><Input id="disruption-end" type="number" min={1} max={instance.horizon_weeks} step={1} required value={toWeek} disabled={disabled} onChange={(event) => { invalidate(); setToWeek(event.target.value); }} /></div>
        <div className="space-y-2"><Label htmlFor="disruption-capacity">Capacity per week</Label><Input id="disruption-capacity" type="number" min={0} max={1000} step={1} required value={capacity} disabled={disabled} onChange={(event) => { invalidate(); setCapacity(event.target.value); }} /></div>
        <Button type="submit" disabled={disabled || !ready || !currentLocation}>{working ? "Replanning…" : "Preview disruption"}</Button>
      </form>
      {error && <p role="alert" className="text-sm text-line-red">{error}</p>}
    </Card>
    {preview && <>
      <Card className="space-y-3 p-5"><h3 className="font-semibold">Disruption preview · scenario {preview.scenario}</h3><p className="text-sm">{preview.disruption.location_id}: weeks {preview.disruption.from_week}–{preview.disruption.to_week}, capacity {preview.disruption.supply_capacity} per week</p>
        {outdated && <p role="status" className="text-sm text-line-red">Shared inputs or planning options changed. Generate a new disruption preview before applying.</p>}
        {!feasible && <p role="status" className="text-sm text-line-red">At least one scenario is infeasible. This preview cannot be applied.</p>}
        <div className="flex flex-wrap gap-2 text-sm">{preview.response.solutions.map((solution) => <span key={solution.scenario}>Scenario {solution.scenario}: {solution.report.feasible ? "feasible" : "infeasible"}</span>)}</div>
        <Button onClick={apply} disabled={disabled || outdated || !feasible}>Apply repaired schedule</Button>
      </Card>
      {before && after && <Card className="overflow-x-auto p-5"><h3 className="mb-3 font-semibold">Scenario {preview.scenario} comparison</h3><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Metric</th><th className="p-2">Baseline</th><th className="p-2">Replanned</th></tr></thead><tbody>{["Checker result", "Workload delivered / required", "Access nights scheduled", "Total overrun days", "Contracts overrunning", "Horizon weeks used"].map((label, index) => <tr key={label} className="border-t border-ink/10"><th className="p-2 font-medium">{label}</th><td className="p-2">{metrics(before)[index]}</td><td className="p-2">{metrics(after)[index]}</td></tr>)}</tbody></table></Card>}
      {comparison && <>
        <Card className="space-y-3 p-5"><h3 className="font-semibold">Repair impact</h3><p className="text-sm">{comparison.frozenPlacements} frozen placements · {comparison.retainedPlacements} retained placements · {comparison.changedActivities.length} changed activities</p><p className="break-words text-sm text-ink/60">Directly affected activities: {comparison.directlyAffectedActivities.join(", ") || "None"}</p></Card>
        <Card className="overflow-x-auto p-5"><h3 className="mb-3 font-semibold">Changed activities</h3>{comparison.changes.length ? <table className="w-full text-left text-sm"><thead><tr>{["Activity", "Baseline weeks", "Replanned weeks", "Accesses before / after", "Reason"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{comparison.changes.map((row) => <tr key={row.activity_id} className="border-t border-ink/10"><th className="p-2 font-medium">{row.activity_id}</th><td className="p-2">{row.beforeWeeks.join(", ") || "None"}</td><td className="p-2">{row.afterWeeks.join(", ") || "None"}</td><td className="p-2">{row.beforeUnits} / {row.afterUnits}</td><td className="p-2">{row.reason}</td></tr>)}</tbody></table> : <p className="text-sm text-ink/60">No activity allocations changed.</p>}</Card>
        <Card className="overflow-x-auto p-5"><h3 className="mb-3 font-semibold">Contract completion changes</h3>{comparison.contractChanges.length ? <table className="w-full text-left text-sm"><thead><tr>{["Contract", "Baseline completion", "Replanned completion", "Delay days"].map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{comparison.contractChanges.map((row) => <tr key={row.contract_number} className="border-t border-ink/10"><th className="p-2 font-medium">{row.contract_number}</th><td className="p-2">{row.beforeCompletion}</td><td className="p-2">{row.afterCompletion}</td><td className="p-2">{row.delayDays}</td></tr>)}</tbody></table> : <p className="text-sm text-ink/60">No contract completion dates changed.</p>}</Card>
      </>}
      {after && <Card className="space-y-2 p-5"><h3 className="font-semibold">Preview checker details</h3>{after.report.hard_violations.length ? after.report.hard_violations.map((row, index) => <p key={index} className="text-sm text-line-red">{row.rule}: {row.detail}</p>) : <p className="text-sm text-ink/60">No hard violations reported by the local checker.</p>}{after.warnings.map((warning, index) => <p key={index} className="text-sm text-ink/60">{warning}</p>)}</Card>}
    </>}
  </section>;
}
