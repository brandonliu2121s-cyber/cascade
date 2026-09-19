import { useState } from "react";
import { CalendarDays, Play, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from "../components/ui";
import { INSTANCE_FILES } from "../lib/planning-api";
import { usePlanning } from "../lib/planning-context";
import { PlanningSummary, ResultExports } from "../components/PlanningViews";
import { TrackDivider } from "../components/transit";

const POLICIES = { A: "Fixed supply · flexible completion", B: "Fixed completion · flexible supply", C: "Balanced supply and completion" };
export default function Planner() {
  const { files, options, response: data, selected, setSelected, busy, solution, replaceFiles: store, run, loadPublic: sample, uploadFiles, setOptions } = usePlanning();
  const [filter, setFilter] = useState("");
  const allowHorizonExtension = Boolean(options.allowHorizonExtension);
  const missing = INSTANCE_FILES.filter((name) => !(name in files));
  const upload = (list: FileList | null) => uploadFiles(Array.from(list ?? []));
  const visibleJobs = data?.instance.activities.filter((a) => `${a.activity_id} ${a.contract_number} ${a.start_location_id} ${a.end_location_id}`.toLowerCase().includes(filter.toLowerCase())) ?? [];
  const weeks = solution ? Math.max(data!.instance.horizon_weeks, solution.report.detail.horizon_weeks_used) : 0;
  return <div className="animate-fade-up py-10">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-ink/50">Track access planning</p><h1 className="mt-3 text-4xl font-black tracking-tight">Possession planner</h1><p className="mt-3 max-w-xl text-sm text-ink/60">Allocate complete activity workloads across Alpha and Beta, compare three policies, and export the submission files.</p></div>
      <Button onClick={run} disabled={busy || missing.length > 0}><Play className="h-4 w-4" />{busy ? "Working…" : "Run scenarios A, B & C"}</Button>
    </div><TrackDivider color="#009645" stations={4} className="mt-6 max-w-xs" />
    <PlanningSummary />
    <Card className="mt-6"><CardHeader><CardTitle>1. Load an instance</CardTitle></CardHeader><CardContent>
      <div className="flex flex-wrap items-center gap-3">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-line-green ${busy ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-4 w-4" />Upload instance CSVs<input aria-label="Upload instance CSVs" type="file" accept=".csv" multiple disabled={busy} className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>
        <Button variant="outline" disabled={busy} onClick={sample}>Use official public dataset</Button>
        {Object.keys(files).length > 0 && <Button variant="ghost" disabled={busy} onClick={() => store({})}>Clear instance</Button>}
        <span className="text-xs text-ink/60">{8 - missing.length}/8 files loaded</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{INSTANCE_FILES.map((name) => <div key={name} className={`flex items-center gap-2 rounded-lg border p-2 font-mono text-[10px] ${name in files ? "border-line-green/30 bg-line-green/5" : "border-ink/10 text-ink/45"}`}>{name in files ? <CheckCircle2 className="h-3 w-3 shrink-0 text-line-green" /> : <Upload className="h-3 w-3 shrink-0" />}{name}</div>)}</div>
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={allowHorizonExtension} disabled={busy} onChange={(e) => setOptions({ ...options, allowHorizonExtension: e.target.checked })} /><span>Allow planning beyond the declared horizon using flat weekly supply<span className="block text-xs text-ink/60">This assumes the same supply continues after the official planning period.</span></span></label>
      <p className="mt-3 text-xs text-ink/50">Files stay in this browser session. Each solve uses your uploaded instance independently.</p>
    </CardContent></Card>
    {!data && <div className="mt-8 rounded-xl border border-dashed border-ink/20 p-8 text-center text-sm text-ink/50">Load all eight CSVs, then run the scenarios to see the multiweek plan.</div>}
    {data && solution && <>
      <div className="mt-8 flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4" /><span>{data.instance.horizon_start} · {data.instance.horizon_weeks} planning weeks · {data.instance.contracts.length} contracts · {data.instance.activities.length} activities</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-3" aria-label="Scenario comparison">{data.solutions.map((s) => <button key={s.scenario} aria-pressed={selected === s.scenario} disabled={busy} onClick={() => setSelected(s.scenario)} className={`rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-line-green ${selected === s.scenario ? "border-line-green bg-line-green/5" : "border-ink/15 hover:bg-ink/5"}`}>
        <span className="font-mono text-xs font-bold">Scenario {s.scenario}</span><p className="mt-1 text-sm font-semibold">{POLICIES[s.scenario]}</p>
        <p className={`mt-3 text-xs ${s.report.feasible ? "text-line-green" : "text-red-700"}`}>{s.report.feasible ? "Local checks passed" : `${s.report.hard_violations.length} hard violations`}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink/60"><span>Penalty: {s.report.soft_scores.objective_score ?? "Not scored"}</span><span>Overrun: {s.report.soft_scores.overrun_days_total} days</span><span>Extra supply: {s.report.soft_scores.excess_access_nights_total}</span><span>ECLO: {s.report.soft_scores.eclo_nights_total}</span></div>
      </button>)}</div>
      <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 ${solution.report.feasible ? "border-line-green/30 bg-line-green/5" : "border-red-300 bg-red-50"}`}>{solution.report.feasible ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-line-green" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />}<div className="text-sm"><p className="font-semibold">{solution.report.detail.completed_activities}/{solution.report.detail.total_activities} activities complete · {solution.report.detail.workload_delivered}/{solution.report.detail.workload_required} access units</p>{solution.warnings.map((w) => <p key={w} className="mt-1 text-xs text-ink/60">{w}</p>)}</div></div>
      {solution.report.hard_violations.length > 0 && <Card className="mt-4"><CardHeader><CardTitle>Hard violations</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{solution.report.hard_violations.slice(0, 50).map((v, i) => <li key={i}><span className="font-mono font-bold">{v.rule}</span>: {v.detail}</li>)}</ul></CardContent></Card>}
      <Card className="mt-6"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>2. Inspect the weekly plan</CardTitle><Input aria-label="Filter activities" placeholder="Filter activity, contract or location" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" /></div></CardHeader><CardContent>
        <div className="flex flex-wrap gap-4 text-xs text-ink/60"><span><span className="mr-1 inline-block h-3 w-3 rounded bg-line-green" />Standard · 1 unit</span><span><span className="mr-1 inline-block h-3 w-3 rounded bg-line-orange" />ECLO · 1.5 units</span><span>Hover a placement for access and possession details</span></div>
        <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-ink/10" tabIndex={0} aria-label="Scrollable weekly activity timeline"><table className="w-full border-collapse text-xs"><thead className="sticky top-0 z-20 bg-paper"><tr><th className="sticky left-0 z-30 min-w-[200px] border-b border-ink/10 bg-paper p-3 text-left">Activity / contract</th>{Array.from({ length: weeks }, (_, i) => <th key={i} className="min-w-[34px] border-b border-ink/10 p-2 font-mono">{i + 1}</th>)}</tr></thead><tbody>{visibleJobs.map((job) => {
          const placements = solution.access.filter((p) => p.activity_id === job.activity_id); const explanation = solution.explanations.find((e) => e.activity_id === job.activity_id)?.detail;
          return <tr key={job.activity_id}><th className="sticky left-0 z-10 border-b border-ink/10 bg-paper p-3 text-left font-normal" title={explanation}><span className="font-mono font-bold">{job.activity_id}</span><span className="ml-2 text-ink/50">{job.contract_number} · {job.total_accesses} units</span><p className="mt-1 max-w-[220px] truncate text-[10px] text-ink/45">{job.start_location_id} → {job.end_location_id}</p></th>{Array.from({ length: weeks }, (_, i) => { const p = placements.find((p) => p.week === i + 1); const groups = p ? [...new Set(solution.occupancy.filter((o) => o.activity_id === job.activity_id && o.week === p.week).map((o) => o.co_share_group))].join(", ") : ""; return <td key={i} className="border-b border-ink/10 p-1 text-center">{p ? <button className={`h-6 w-6 rounded text-[10px] font-bold text-white focus-visible:ring-2 focus-visible:ring-ink ${p.eclo ? "bg-line-orange" : "bg-line-green"}`} title={`${job.activity_id}, week ${p.week}, local access-night ${p.access_night}, possession ${groups}. ${explanation}`} aria-label={`${job.activity_id} week ${p.week}, ${p.eclo ? "ECLO" : "standard"}`}>{p.eclo ? "E" : p.access_night}</button> : <span className="text-ink/15">·</span>}</td>; })}</tr>;
        })}</tbody></table></div>
        {visibleJobs.length === 0 && <p className="mt-3 text-sm text-ink/50">No activities match your filter.</p>}
      </CardContent></Card>
      <Card className="mt-6"><CardHeader><CardTitle>Contract completion</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-ink/50"><tr>{["Contract", "Priority", "Planned completion", "Scheduled completion", "Overrun"].map((h) => <th key={h} className="whitespace-nowrap pb-3 pr-4">{h}</th>)}</tr></thead><tbody>{solution.results.map((r) => { const c = data.instance.contracts.find((c) => c.contract_number === r.contract_number)!; return <tr key={r.contract_number} className="border-t border-ink/10"><td className="py-2 font-mono">{r.contract_number}</td><td>P{c.contract_priority}</td><td>{c.planned_completion_date}</td><td>{r.simulated_completion_date}</td><td className={r.overrun_days ? "font-semibold text-amber-700" : "text-line-green"}>{r.overrun_days} days</td></tr>; })}</tbody></table></div></CardContent></Card>
      <ResultExports />
    </>}
  </div>;
}
