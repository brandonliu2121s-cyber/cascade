import { useRef, useState } from "react";
import { parseCsv } from "../../backend/src/ps1/csv";
import { usePlanning } from "../lib/planning-context";
import { replaceInstanceRows } from "../lib/planning-session";
import { solveInstance, type PlanningResponse, type Scenario, type Solution } from "../lib/ps1";
import { PlanningEmpty, PlanningSummary } from "../components/PlanningViews";
import { TrackDivider } from "../components/transit";
import { Button, Card, Input, Label, Select } from "../components/ui";

type Change = "supply" | "workfronts" | "workload";
interface Preview {
  files: Record<string, string>;
  response: PlanningResponse;
  baseline: PlanningResponse | null;
  scenario: Scenario;
  baseRevision: number;
  description: string;
}
function Comparison({ before, after }: { before?: Solution; after?: Solution }) {
  const metrics = (solution?: Solution) => solution ? [solution.report.feasible ? "Feasible" : "Infeasible", `${solution.report.detail.workload_delivered} / ${solution.report.detail.workload_required}`, `${solution.report.detail.completed_activities} / ${solution.report.detail.total_activities}`, solution.report.detail.nights_scheduled, solution.report.soft_scores.overrun_days_total, solution.report.soft_scores.contracts_overrunning, solution.report.detail.horizon_weeks_used] : [];
  const baseline = metrics(before); const preview = metrics(after);
  return <Card className="overflow-x-auto p-5"><h2 className="mb-3 font-semibold">Scenario comparison</h2><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Metric</th><th className="p-2">Baseline</th><th className="p-2">Preview</th></tr></thead><tbody>{["Checker result", "Workload delivered / required", "Activities completed / total", "Access nights scheduled", "Total overrun days", "Contracts overrunning", "Horizon weeks used"].map((label, index) => <tr className="border-t border-ink/10" key={label}><th className="p-2 font-medium">{label}</th><td className="p-2">{baseline[index] ?? "Not generated"}</td><td className="p-2">{preview[index] ?? "Not generated"}</td></tr>)}</tbody></table></Card>;
}

export default function WhatIf() {
  const { files, instance, response, options, revision, selected, stale, busy, applyPreview } = usePlanning();
  const [change, setChange] = useState<Change>("supply");
  const [target, setTarget] = useState("");
  const [value, setValue] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const targets = instance ? change === "supply" ? instance.supplies.map((row) => ({ id: row.location_id, value: row.supply_capacity })) : change === "workfronts" ? instance.contracts.map((row) => ({ id: row.contract_number, value: row.number_of_workfronts })) : instance.activities.map((row) => ({ id: row.activity_id, value: row.total_accesses })) : [];
  const current = targets.find((row) => row.id === target) ?? targets[0];
  const entered = value === null ? String(current?.value ?? "") : value;
  function invalidate() { requestId.current += 1; setPreview(null); setError(""); }
  async function simulate() {
    if (!instance || !current || working || busy) return;
    const id = ++requestId.current;
    setWorking(true); setError(""); setPreview(null);
    try {
      const amount = Number(entered);
      const maximum = change === "supply" ? 1000 : change === "workfronts" ? 100 : 1000;
      const minimum = change === "supply" ? 0 : 1;
      if (!entered.trim() || !Number.isInteger(amount) || amount < minimum || amount > maximum) throw new Error(`Enter a whole number from ${minimum} to ${maximum}.`);
      const changedFiles = change === "supply" ? replaceInstanceRows(files, "04_LOCATION_SUPPLY.csv", parseCsv(files["04_LOCATION_SUPPLY.csv"]).map((row) => row.location_id === current.id ? { ...row, supply_capacity: amount } : row)) : change === "workfronts" ? replaceInstanceRows(files, "07_PROJECT_DETAILS.csv", parseCsv(files["07_PROJECT_DETAILS.csv"]).map((row) => row.contract_number === current.id ? { ...row, number_of_workfronts: amount } : row)) : replaceInstanceRows(files, "08_ACTIVITY_DETAILS.csv", parseCsv(files["08_ACTIVITY_DETAILS.csv"]).map((row) => row.activity_id === current.id ? { ...row, total_accesses: amount } : row));
      const baseRevision = revision;
      const baseline = stale ? null : response;
      const scenario = selected;
      const result = await solveInstance(changedFiles, { ...options });
      if (id === requestId.current) setPreview({ files: changedFiles, response: result, baseline, scenario, baseRevision, description: `${current.id}: ${change === "supply" ? "supply capacity" : change === "workfronts" ? "workfronts" : "total accesses"} ${current.value} → ${amount}` });
    } catch (failure) { if (id === requestId.current) setError(failure instanceof Error ? failure.message : "Preview failed."); }
    finally { setWorking(false); }
  }
  function apply() {
    if (!preview || preview.baseRevision !== revision || busy || working) return;
    try { applyPreview(preview.files, preview.response, preview.baseRevision); setPreview(null); setError(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to apply preview."); }
  }
  const outdated = preview !== null && preview.baseRevision !== revision;
  const before = preview?.baseline?.solutions.find((row) => row.scenario === preview.scenario);
  const after = preview?.response.solutions.find((row) => row.scenario === preview.scenario);
  return <div className="animate-fade-up space-y-6 py-10"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-ink/50">Simulation</p><h1 className="mt-3 text-4xl font-black tracking-tight">What-if simulator</h1><TrackDivider color="#FA9E0D" stations={3} className="mt-6 max-w-xs" /></div><PlanningSummary />
    {!instance ? <PlanningEmpty /> : <>
      <Card className="space-y-4 p-5"><h2 className="font-semibold">Preview an input change</h2><p className="text-sm text-ink/60">Compare a PS1 input change with the current schedule. Applying the preview updates the shared inputs and generated results.</p>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void simulate(); }}>
          <div className="space-y-2"><Label htmlFor="whatif-change">Change</Label><Select id="whatif-change" value={change} disabled={working || busy} onChange={(event) => { invalidate(); setChange(event.target.value as Change); setTarget(""); setValue(null); }}><option value="supply">Location supply capacity</option><option value="workfronts">Contract workfronts</option><option value="workload">Activity workload</option></Select></div>
          <div className="space-y-2"><Label htmlFor="whatif-target">{change === "supply" ? "Location" : change === "workfronts" ? "Contract" : "Activity"}</Label><Select id="whatif-target" value={current?.id ?? ""} disabled={working || busy} onChange={(event) => { invalidate(); setTarget(event.target.value); setValue(null); }}>{targets.map((row) => <option value={row.id} key={row.id}>{row.id} · current {row.value}</option>)}</Select></div>
          <div className="space-y-2"><Label htmlFor="whatif-value">{change === "supply" ? "Capacity per week" : change === "workfronts" ? "Workfronts" : "Total accesses"}</Label><Input id="whatif-value" type="number" min={change === "supply" ? 0 : 1} max={change === "supply" ? 1000 : change === "workfronts" ? 100 : 1000} step={1} required disabled={working || busy} value={entered} onChange={(event) => { invalidate(); setValue(event.target.value); }} /></div>
          <Button type="submit" disabled={working || busy || !current}>{working ? "Generating preview…" : "Generate preview"}</Button>
        </form>
        {error && <p role="alert" className="text-sm text-line-red">{error}</p>}
      </Card>
      {preview && <><Card className="space-y-3 p-5"><h2 className="font-semibold">Preview · scenario {preview.scenario}</h2><p className="text-sm">{preview.description}</p>{outdated && <p role="status" className="text-sm text-line-red">Shared inputs changed since this preview. Generate a new preview before applying.</p>}{!preview.baseline && <p className="text-sm text-ink/60">Generate a current baseline schedule to compare both sets of metrics.</p>}<Button onClick={apply} disabled={outdated || busy || working}>Apply preview</Button></Card><Comparison before={before} after={after} />{after && <Card className="space-y-2 p-5"><h2 className="font-semibold">Preview checker details</h2>{after.report.hard_violations.length ? after.report.hard_violations.map((row, index) => <p key={index} className="text-sm text-line-red">{row.rule}: {row.detail}</p>) : <p className="text-sm text-ink/60">No hard violations reported by the local checker.</p>}{after.warnings.map((warning, index) => <p key={index} className="text-sm text-ink/60">{warning}</p>)}</Card>}</>}
    </>}
  </div>;
}
