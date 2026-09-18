import { Play } from "lucide-react";
import { usePlanning } from "../lib/planning-context";
import { PlanningEmpty, PlanningSummary, ResultExports } from "../components/PlanningViews";
import { Button, Card, CardContent, CardHeader, CardTitle } from "../components/ui";

export default function Dashboard() {
  const { instance, solution, stale, busy, error, run } = usePlanning();
  const current = stale ? null : solution;
  return <div className="animate-fade-up py-10">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-ink/50">PS1 · Planning overview</p><h1 className="mt-3 text-4xl font-black tracking-tight">Network access plan</h1><p className="mt-3 text-sm text-ink/60">Review the selected scenario against the current instance.</p></div><Button onClick={() => void run()} disabled={busy || !instance}><Play className="h-4 w-4" />{busy ? "Working…" : "Run scenarios A, B & C"}</Button></div>
    <PlanningSummary />
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {!instance ? <PlanningEmpty /> : !current ? <Card className="mt-6 p-6"><p role="status" className="text-sm text-ink/60">{stale ? "Inputs changed. Run the scenarios again to view current results." : "Run the scenarios to view planning results."}</p></Card> : <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Selected scenario metrics">{[
        ["Activities complete", `${current.report.detail.completed_activities}/${current.report.detail.total_activities}`],
        ["Access units delivered", `${current.report.detail.workload_delivered}/${current.report.detail.workload_required}`],
        ["Total overrun days", current.report.soft_scores.overrun_days_total],
        ["Additional access nights", current.report.soft_scores.excess_access_nights_total],
        ["ECLO nights", current.report.soft_scores.eclo_nights_total],
        ["Contracts overrunning", current.report.soft_scores.contracts_overrunning],
        ["Objective score", current.report.soft_scores.objective_score ?? "Not scored"],
        ["Weeks used", current.report.detail.horizon_weeks_used],
      ].map(([label, value]) => <Card key={label} className="p-5"><p className="text-xs text-ink/60">{label}</p><p className="mt-2 text-3xl font-black tabular-nums">{value}</p></Card>)}</section>
      <Card className="mt-6"><CardHeader><CardTitle>Contract completion · RESULTS</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Contract completion results for scenario {current.scenario}</caption><thead><tr>{["Scenario", "Contract", "Planned completion", "Simulated completion", "Overrun days"].map(h => <th scope="col" key={h} className="whitespace-nowrap p-3 text-xs text-ink/60">{h}</th>)}</tr></thead><tbody>{current.results.map(r => <tr key={r.contract_number} className="border-t border-ink/10"><td className="p-3">{r.scenario}</td><th scope="row" className="p-3 font-mono font-normal">{r.contract_number}</th><td className="p-3">{instance.contracts.find(c => c.contract_number === r.contract_number)?.planned_completion_date ?? "—"}</td><td className="p-3">{r.simulated_completion_date}</td><td className="p-3">{r.overrun_days}</td></tr>)}</tbody></table></div></CardContent></Card>
      {current.report.hard_violations.length > 0 && <Card className="mt-4"><CardHeader><CardTitle>Local check violations</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{current.report.hard_violations.map((v,i) => <li key={i}><strong>{v.rule}</strong>: {v.detail}</li>)}</ul></CardContent></Card>}
      {current.warnings.length > 0 && <Card className="mt-4 p-5"><ul className="space-y-2 text-sm text-ink/60">{current.warnings.map((warning,i) => <li key={i}>{warning}</li>)}</ul></Card>}
    </>}
    <ResultExports />
  </div>;
}
