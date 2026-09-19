import { useState } from "react";
import { Link } from "react-router-dom";
import { usePlanning } from "../lib/planning-context";
import { PlanningEmpty, PlanningSummary, ResultExports } from "../components/PlanningViews";
import { Button, Card, Input, Select } from "../components/ui";
import { X } from "lucide-react";

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
  
  // Get location details from instance
  const startLocation = instance?.supplies.find(s => s.location_id === detail?.activity.start_location_id);
  const endLocation = instance?.supplies.find(s => s.location_id === detail?.activity.end_location_id);
  
  return <div className="animate-fade-up py-10">
    <div className="flex gap-6">
      {/* Main content area */}
      <div className={`transition-all duration-300 ${detail ? "w-2/3" : "w-full"}`}>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-ink/50">Activity registry</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Activities and workloads</h1>
        <PlanningSummary />
    {!instance ? <PlanningEmpty /> : <>
      <div className="mt-6 flex flex-wrap gap-3"><Input aria-label="Search activities" placeholder="Search activity, contract or location" className="max-w-md" value={search} onChange={e => setSearch(e.target.value)} /><Select aria-label="Filter activity completion status" className="max-w-xs" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="not-run">Not run</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option></Select><Link className="inline-flex items-center rounded-full border border-ink/20 px-4 text-sm font-medium" to="/app/requests/new">Add activity</Link></div>
      {stale && <p role="status" className="mt-3 text-sm text-ink/60">Inputs changed. Completion status remains not run until a current schedule is generated.</p>}
      <Card className="mt-4 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Current instance activities and selected scenario workloads</caption><thead><tr>{["Activity", "Contract", "Description", "Required units", "Delivered units", "Priority", "Status", "Actions"].map(h => <th scope="col" key={h} className="whitespace-nowrap p-3 text-xs text-ink/60">{h}</th>)}</tr></thead><tbody>{visible.map(r => <tr key={r.activity.activity_id} className={`border-t border-ink/10 ${detail?.activity.activity_id === r.activity.activity_id ? "bg-ink/5" : ""}`}><th scope="row" className="p-3 font-mono font-normal">{r.activity.activity_id}</th><td className="p-3">{r.activity.contract_number}</td><td className="p-3">{r.contract?.contract_description ?? "—"}</td><td className="p-3">{r.activity.total_accesses}</td><td className="p-3">{current ? r.delivered : "—"}</td><td className="p-3">{r.activity.activity_priority}</td><td className="p-3 whitespace-nowrap">{r.status === "not-run" ? "Not run" : r.status === "complete" ? "Complete" : "Incomplete"}</td><td className="p-3"><Button size="sm" variant="outline" aria-label={`View ${r.activity.activity_id} details`} onClick={() => setDetailId(r.activity.activity_id)}>Details</Button></td></tr>)}{visible.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-ink/50">No activities match these filters.</td></tr>}</tbody></table></div></Card>
      </>}
        <ResultExports />
      </div>
      
      {/* Right sidebar */}
      {detail && <div className="w-1/3 animate-fade-left">
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-ink/10 bg-paper p-6 shadow-lg">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-lg font-bold tracking-tight">Activity {detail.activity.activity_id}</h2>
            <Button aria-label="Close details" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDetailId(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink/70">Activity Information</h3>
              <dl className="grid gap-4 text-sm">{[["Contract", detail.activity.contract_number], ["Activity type", detail.activity.activity_type], ["Nature", detail.contract?.nature_of_activity ?? "—"], ["Access type", detail.contract?.access_type ?? "—"], ["Planned start", detail.activity.planned_start_date], ["Predecessor", detail.activity.predecessor_activity_id ?? "None"], ["Workfronts", detail.contract?.number_of_workfronts ?? "—"], ["Maximum accesses per week", detail.contract?.number_of_maximum_access_per_week ?? "—"]].map(([label,value]) => <div key={label}><dt className="text-xs text-ink/50">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
            </div>
            
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink/70">Location Details</h3>
              <div className="space-y-4">
                <div className="rounded-lg border border-ink/10 bg-ink/5 p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">Start Location</h4>
                  <dl className="grid gap-3 text-sm">
                    <div><dt className="text-xs text-ink/50">Location ID</dt><dd className="mt-1 font-mono font-medium">{detail.activity.start_location_id}</dd></div>
                    {startLocation && <>
                      <div><dt className="text-xs text-ink/50">Kind</dt><dd className="mt-1 font-medium">{startLocation.location_kind}</dd></div>
                      <div><dt className="text-xs text-ink/50">Line</dt><dd className="mt-1 font-medium">{startLocation.line_code}</dd></div>
                      <div><dt className="text-xs text-ink/50">Bound</dt><dd className="mt-1 font-medium">{startLocation.bound}</dd></div>
                      <div><dt className="text-xs text-ink/50">Capacity / week</dt><dd className="mt-1 font-medium">{startLocation.supply_capacity}</dd></div>
                    </>}
                  </dl>
                </div>
                
                <div className="rounded-lg border border-ink/10 bg-ink/5 p-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">End Location</h4>
                  <dl className="grid gap-3 text-sm">
                    <div><dt className="text-xs text-ink/50">Location ID</dt><dd className="mt-1 font-mono font-medium">{detail.activity.end_location_id}</dd></div>
                    {endLocation && <>
                      <div><dt className="text-xs text-ink/50">Kind</dt><dd className="mt-1 font-medium">{endLocation.location_kind}</dd></div>
                      <div><dt className="text-xs text-ink/50">Line</dt><dd className="mt-1 font-medium">{endLocation.line_code}</dd></div>
                      <div><dt className="text-xs text-ink/50">Bound</dt><dd className="mt-1 font-medium">{endLocation.bound}</dd></div>
                      <div><dt className="text-xs text-ink/50">Capacity / week</dt><dd className="mt-1 font-medium">{endLocation.supply_capacity}</dd></div>
                    </>}
                  </dl>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="mb-3 text-sm font-semibold text-ink/70">Schedule Information</h3>
              <p className="text-sm text-ink/60">{current?.explanations.find(e => e.activity_id === detailId)?.detail}</p>
              <p className="mt-2 text-sm text-ink/60">{current ? `${detail.placements.length} scheduled access rows · ${detail.delivered} delivered access units` : "No current placements."}</p>
            </div>
            
            <div className="border-t border-ink/10 pt-4">
              <Link className="inline-flex w-full justify-center rounded-full border border-ink/20 px-4 py-2 text-sm font-medium hover:bg-ink/5" to={`/app/requests/new?edit=${encodeURIComponent(detail.activity.activity_id)}`}>Edit activity</Link>
            </div>
          </div>
        </div>
      </div>}
    </div>
  </div>;
}
