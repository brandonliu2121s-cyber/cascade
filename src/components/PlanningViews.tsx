import { Link } from "react-router-dom";
import { Download } from "lucide-react";
import { usePlanning } from "../lib/planning-context";
import { downloadFile } from "../lib/ps1";
import { Button, Card, CardContent, CardHeader, CardTitle, Select } from "./ui";

export function PlanningEmpty() {
  return <Card className="mt-6 p-6"><p>Load a PS1 planning instance to use this tab.</p><Link className="mt-3 inline-block font-semibold underline" to="/app/ps1">Open PS1 Planner</Link></Card>;
}
export function PlanningSummary() {
  const { instance, selected, setSelected, solution, stale, busy, error } = usePlanning();
  return <div className="my-5 rounded-xl border border-ink/15 bg-paper p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{instance ? `${instance.activities.length} activities · ${instance.contracts.length} contracts · ${instance.horizon_start} · ${instance.horizon_weeks} weeks` : 'No planning instance loaded'}</p>
      <label className="flex items-center gap-2 text-sm">Scenario<Select aria-label="Active scenario" className="w-24" value={selected} disabled={busy} onChange={(e) => setSelected(e.target.value as typeof selected)}>{['A', 'B', 'C'].map((s) => <option key={s}>{s}</option>)}</Select></label></div>
    <p role="status" className={`mt-2 text-sm ${stale ? 'font-semibold text-amber-800' : 'text-ink/60'}`}>{busy ? 'Planning operation in progress…' : stale ? 'Inputs changed — schedule is stale. Run the scenarios again before exporting.' : solution ? `Scenario ${selected}: ${solution.report.feasible ? 'local checks passed' : `${solution.report.hard_violations.length} hard violations`}` : 'Run the scenarios to generate a schedule.'}</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </div>;
}
export function ResultExports() {
  const { solution, selected, busy, stale, recheck, validation } = usePlanning();
  return <Card className="mt-6"><CardHeader><CardTitle>Check and export scenario {selected}</CardTitle></CardHeader><CardContent>
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!solution || busy || stale} onClick={recheck}>Recheck exported CSVs</Button>
      {['SCHEDULE_ACCESS.csv', 'SCHEDULE_OCCUPANCY.csv', 'RESULTS.csv'].map((name) => <Button key={name} variant="outline" disabled={!solution?.report.feasible || busy || stale} onClick={() => { if (solution?.report.feasible && !stale) downloadFile(name, solution.csv[name]); }}><Download className="h-4 w-4" />{name}</Button>)}</div>
    {validation && <p role="status" className="mt-3 text-sm">Export recheck: {validation.feasible ? 'local checks passed' : `${validation.hard_violations.length} hard violations`}.</p>}
    <p className="mt-3 text-xs text-ink/50">These files contain the selected scenario shown throughout the app. Keep each scenario’s files in its own folder. Official validator verification is still required.</p>
  </CardContent></Card>;
}
