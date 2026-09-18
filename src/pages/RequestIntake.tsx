import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Activity, Instance } from "../../backend/src/ps1/types";
import { usePlanning } from "../lib/planning-context";
import { PlanningEmpty, PlanningSummary } from "../components/PlanningViews";
import { Button, Card, CardContent, Input, Label, Select } from "../components/ui";

function ActivityForm({ instance, initial, editing }: { instance: Instance; initial: Activity; editing: boolean }) {
  const { saveActivity, busy } = usePlanning();
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const contract = instance.contracts.find(c => c.contract_number === form.contract_number)!;
  const change = (patch: Partial<Activity>) => setForm(previous => ({ ...previous, ...patch }));
  return <Card><CardContent className="pt-5"><form onSubmit={event => {
    event.preventDefault();
    try { saveActivity(form, editing ? initial.activity_id : undefined); navigate("/app/requests"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }}><fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
    <div><Label htmlFor="activity-id">Activity ID</Label><Input id="activity-id" required readOnly={editing} value={form.activity_id} onChange={e => change({ activity_id: e.target.value })} /></div>
    <div><Label htmlFor="activity-contract">Contract</Label><Select id="activity-contract" value={form.contract_number} onChange={e => {
      const next = instance.contracts.find(c => c.contract_number === e.target.value)!;
      change({ contract_number: next.contract_number, activity_type: next.activity_type });
    }}>{instance.contracts.map(c => <option key={c.contract_number} value={c.contract_number}>{c.contract_number} · {c.contract_description}</option>)}</Select></div>
    <p className="text-sm sm:col-span-2">{contract.activity_type} · {contract.nature_of_activity} · {contract.access_type}. Contract completion: {contract.contract_completion_date}. Locations must form a valid span on the same line and bound.</p>
    {(["start_location_id", "end_location_id"] as const).map(key => <div key={key}><Label htmlFor={key}>{key === "start_location_id" ? "Start location" : "End location"}</Label><Select id={key} value={form[key]} onChange={e => change({ [key]: e.target.value })}>{instance.supplies.map(s => <option key={s.location_id} value={s.location_id}>{s.location_id}</option>)}</Select></div>)}
    <div><Label htmlFor="activity-workload">Required access units</Label><Input id="activity-workload" type="number" required min={1} max={1000} step={1} value={form.total_accesses} onChange={e => change({ total_accesses: Number(e.target.value) })} /></div>
    <div><Label htmlFor="activity-start">Planned start date</Label><Input id="activity-start" type="date" required value={form.planned_start_date} onChange={e => change({ planned_start_date: e.target.value })} /></div>
    <div><Label htmlFor="activity-predecessor">Predecessor</Label><Select id="activity-predecessor" value={form.predecessor_activity_id ?? ""} onChange={e => change({ predecessor_activity_id: e.target.value || null })}><option value="">None</option>{instance.activities.filter(a => a.activity_id !== form.activity_id).map(a => <option key={a.activity_id} value={a.activity_id}>{a.activity_id}</option>)}</Select></div>
    <div><Label htmlFor="activity-priority">Activity priority</Label><Select id="activity-priority" value={form.activity_priority} onChange={e => change({ activity_priority: Number(e.target.value) })}>{[1, 2, 3].map(p => <option key={p} value={p}>{p}{p === 1 ? " · highest" : ""}</option>)}</Select></div>
    {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
    <p className="text-sm text-ink/60 sm:col-span-2">Saving updates 08_ACTIVITY_DETAILS.csv in this planning session and clears the generated schedule. Run the planner again to generate matching output CSVs.</p>
    <Button type="submit">{editing ? "Save activity" : "Add activity"}</Button>
  </fieldset></form></CardContent></Card>;
}

export default function RequestIntake() {
  const { instance, revision } = usePlanning();
  const [params] = useSearchParams();
  const edit = params.get("edit");
  if (!instance) return <PlanningEmpty />;
  const existing = edit ? instance.activities.find(a => a.activity_id === edit) : undefined;
  const initial = existing ?? { activity_id: "", contract_number: instance.contracts[0].contract_number, activity_type: instance.contracts[0].activity_type, start_location_id: instance.supplies[0].location_id, end_location_id: instance.supplies[0].location_id, total_accesses: 1, planned_start_date: instance.horizon_start, predecessor_activity_id: null, activity_priority: 1 };
  return <div className="animate-fade-up space-y-6 py-10"><h1 className="text-4xl font-black tracking-tight">{edit ? "Edit PS1 activity" : "Intake · PS1 activity"}</h1><PlanningSummary />{edit && !existing ? <p role="alert">Activity {edit} does not exist in this instance.</p> : <ActivityForm key={`${edit ?? "new"}:${revision}`} instance={instance} initial={initial} editing={Boolean(edit)} />}</div>;
}
