import { useState } from "react";
import { Link } from "react-router-dom";
import { usePlanning } from "../lib/planning-context";
import { PlanningEmpty, PlanningSummary, ResultExports } from "../components/PlanningViews";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from "../components/ui";

export default function RequestsList() {
  const { instance, solution, stale } = usePlanning();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const current = stale ? null : solution;
  const rows = instance?.activities.map(activity => {
    const contract = instance.contracts.find(c => c.contract_number === activity.contract_number);
    const placements = current?.access.filter(p => p.activity_id === activity.activity_id) ?? [];
    const delivered = placements.reduce((sum, p) => sum + (p.eclo ? 1.5 : 1), 0);
    return { activity, contract, placements, delivered, status: current ? delivered >= activity.total_accesses ? "complete" : "incomplete" : "not-run" };
  }) ?? [];
  const visible = rows.filter(r => (status === "all" || r.status === status) && `${r.activity.activity_id} ${r.activity.contract_number} ${r.contract?.contract_description ?? ""} ${r.activity.start_location_id} ${r.activity.end_location_id}`.toLowerCase().includes(search.toLowerCase()));
  const detail = rows.find(r => r.activity.activity_id === detailId);
  return <div className="animate-fade-up py-10"><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-ink/50">PS1 · Activity registry</p><h1 className="mt-3 text-4xl font-black tracking-tight">Activities and workloads</h1><PlanningSummary />
    {!instance ? <PlanningEmpty /> : <>
      <div className="mt-6 flex flex-wrap gap-3"><Input aria-label="Search activities" placeholder="Search activity, contract or location" className="max-w-md" value={search} onChange={e => setSearch(e.target.value)} /><Select aria-label="Filter activity completion status" className="max-w-xs" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="not-run">Not run</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option></Select><Link className="inline-flex items-center rounded-full border border-ink/20 px-4 text-sm font-medium" to="/app/requests/new">Add activity</Link></div>
      {stale && <p role="status" className="mt-3 text-sm text-ink/60">Inputs changed. Completion status remains not run until a current schedule is generated.</p>}
      <Card className="mt-4 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Current instance activities and selected scenario workloads</caption><thead><tr>{["Activity", "Contract / description", "Locations", "Required units", "Delivered units", "Priority", "Status", "Actions"].map(h => <th scope="col" key={h} className="whitespace-nowrap p-3 text-xs text-ink/60">{h}</th>)}</tr></thead><tbody>{visible.map(r => <tr key={r.activity.activity_id} className="border-t border-ink/10"><th scope="row" className="p-3 font-mono font-normal">{r.activity.activity_id}</th><td className="p-3">{r.activity.contract_number}<p className="text-xs text-ink/50">{r.contract?.contract_description}</p></td><td className="p-3 whitespace-nowrap">{r.activity.start_location_id} → {r.activity.end_location_id}</td><td className="p-3">{r.activity.total_accesses}</td><td className="p-3">{current ? r.delivered : "—"}</td><td className="p-3">{r.activity.activity_priority}</td><td className="p-3 whitespace-nowrap">{r.status === "not-run" ? "Not run" : r.status === "complete" ? "Complete" : "Incomplete"}</td><td className="p-3"><Button size="sm" variant="outline" aria-label={`View ${r.activity.activity_id} details`} onClick={() => setDetailId(r.activity.activity_id)}>Details</Button></td></tr>)}{visible.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-ink/50">No activities match these filters.</td></tr>}</tbody></table></div></Card>
      {detail && <Card className="mt-4"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>Activity {detail.activity.activity_id}</CardTitle><Button size="sm" variant="ghost" onClick={() => setDetailId(null)}>Close details</Button></div></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2">{[["Contract", detail.activity.contract_number], ["Activity type", detail.activity.activity_type], ["Nature", detail.contract?.nature_of_activity ?? "—"], ["Access type", detail.contract?.access_type ?? "—"], ["Planned start", detail.activity.planned_start_date], ["Predecessor", detail.activity.predecessor_activity_id ?? "None"], ["Workfronts", detail.contract?.number_of_workfronts ?? "—"], ["Maximum accesses per week", detail.contract?.number_of_maximum_access_per_week ?? "—"]].map(([label,value]) => <div key={label}><dt className="text-xs text-ink/50">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl><p className="mt-4 text-sm text-ink/60">{current?.explanations.find(e => e.activity_id === detailId)?.detail}</p><p className="mt-2 text-sm text-ink/60">{current ? `${detail.placements.length} scheduled access rows · ${detail.delivered} delivered access units` : "No current placements."}</p><Link className="mt-4 inline-flex rounded-full border border-ink/20 px-4 py-2 text-sm font-medium" to={`/app/requests/new?edit=${encodeURIComponent(detail.activity.activity_id)}`}>Edit activity</Link></CardContent></Card>}
    </>}
    <ResultExports />
  </div>;
}
