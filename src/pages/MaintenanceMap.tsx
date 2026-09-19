import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Select } from "../components/ui";
import { TrackDivider } from "../components/transit";
import MaintenanceMap from "../components/MaintenanceMap";
import { PlanningSummary } from "../components/PlanningViews";
import { usePlanning } from "../lib/planning-context";
import { activityWeeks, buildImpactIndex, filterImpacts, formatWeeks, layoutNetwork, lineColor, sectorKey, stationKey, summarise } from "../lib/network-map";
import type { FeatureKey, Impact, MapFilter } from "../lib/network-map";

const YELLOW = "#FFC400";

export default function MaintenanceMapPage() {
  const { instance, solution, busy, run, loadPublic } = usePlanning();
  const [bound, setBound] = useState<MapFilter["bound"]>("ALL");
  const [week, setWeek] = useState<number | null>(null);
  const [contract, setContract] = useState("ALL");
  const [showClosure, setShowClosure] = useState(true);
  const [selected, setSelected] = useState<FeatureKey | null>(null);

  const layout = useMemo(() => instance && layoutNetwork(instance), [instance]);
  const index = useMemo(() => instance && buildImpactIndex(instance), [instance]);
  const activities = useMemo(() => new Map((instance?.activities ?? []).map((a) => [a.activity_id, a])), [instance]);
  const contracts = useMemo(() => new Map((instance?.contracts ?? []).map((c) => [c.contract_number, c])), [instance]);
  const weeks = useMemo(() => activityWeeks(solution), [solution]);
  const lastWeek = solution ? Math.max(0, ...solution.access.map((p) => p.week)) : 0;
  // A stale week (e.g. after re-running with a shorter plan) falls back to "all weeks".
  const activeWeek = week !== null && week <= lastWeek ? week : null;

  const filtered = useMemo(() => {
    const filter: MapFilter = { bound, week: activeWeek, contract, showClosure };
    return new Map([...(index?.byFeature ?? [])].map(([key, list]) => [key, filterImpacts(list, filter, activities, weeks)] as const));
  }, [index, bound, activeWeek, contract, showClosure, activities, weeks]);

  if (!instance || !layout || !index) {
    return <div className="animate-fade-up py-10">
      <Header />
      <PlanningSummary />
      <div className="mt-6 rounded-xl border border-dashed border-ink/20 p-8 text-center text-sm text-ink/60">
        <p>Load a planning instance to see where maintenance is planned.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" disabled={busy} onClick={loadPublic}>Use official public dataset</Button>
          <Link className="font-semibold underline" to="/app/planner">Upload your own CSVs in Planner</Link>
        </div>
      </div>
    </div>;
  }

  const workStations = layout.stations.filter((s) => summarise(filtered.get(stationKey(s.id)) ?? []).work > 0).length;
  const workSectors = layout.sectors.filter((s) => summarise(filtered.get(sectorKey(s.id)) ?? []).work > 0).length;
  const shownActivities = new Set([...filtered.values()].flat().filter((i) => i.role === "work").map((i) => i.activity_id)).size;
  const busiest = [...filtered].map(([key, list]) => ({ key, work: summarise(list).work })).filter((f) => f.work > 0).sort((a, b) => b.work - a.work || a.key.localeCompare(b.key)).slice(0, 6);

  const nameOf = (key: FeatureKey) => {
    const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (kind === "station") return `Station ${id}`;
    const s = layout.sectors.find((x) => x.id === id);
    return s ? `Segment ${s.from} → ${s.to}` : id;
  };
  const lineNamesOf = (key: FeatureKey) => {
    const id = key.slice(key.indexOf(":") + 1);
    const codes = key.startsWith("station:") ? layout.stations.find((s) => s.id === id)?.lines ?? [] : [layout.sectors.find((s) => s.id === id)?.line ?? ""];
    return codes.map((c) => instance.lines.find((l) => l.line_code === c)?.line_name ?? c);
  };
  const details: Impact[] = selected ? [...(filtered.get(selected) ?? [])].sort((a, b) => Number(b.role === "work") - Number(a.role === "work") || a.activity_id.localeCompare(b.activity_id)) : [];

  return <div className="animate-fade-up py-10">
    <Header />
    <PlanningSummary />
    <Card className="mt-6"><CardContent>
      <div className="flex flex-wrap items-end gap-4 pt-1">
        <Field label="Direction"><Select value={bound} onChange={(e) => setBound(e.target.value as MapFilter["bound"])} className="w-36"><option value="ALL">Both</option><option value="EB">Eastbound</option><option value="WB">Westbound</option></Select></Field>
        <Field label="Contract"><Select value={contract} onChange={(e) => setContract(e.target.value)} className="w-40"><option value="ALL">All contracts</option>{instance.contracts.map((c) => <option key={c.contract_number}>{c.contract_number}</option>)}</Select></Field>
        <Field label="Week"><Select value={activeWeek ?? "all"} disabled={!solution} onChange={(e) => setWeek(e.target.value === "all" ? null : Number(e.target.value))} className="w-36"><option value="all">All weeks</option>{Array.from({ length: lastWeek }, (_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}</Select></Field>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={showClosure} onChange={(e) => setShowClosure(e.target.checked)} />Show buffer &amp; closures</label>
        {!solution && <Button disabled={busy} onClick={run}><Play className="h-4 w-4" />{busy ? "Working…" : "Run scenarios to filter by week"}</Button>}
      </div>
    </CardContent></Card>

    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle>Network</CardTitle><p className="mt-1 text-xs text-ink/60" role="status">{shownActivities} {shownActivities === 1 ? "activity" : "activities"} · {workStations} {workStations === 1 ? "station" : "stations"} and {workSectors} {workSectors === 1 ? "segment" : "segments"} with work{activeWeek !== null ? ` in week ${activeWeek}` : ""}</p></CardHeader><CardContent>
        <div className="overflow-x-auto"><MaintenanceMap instance={instance} layout={layout} impacts={filtered} selected={selected} onSelect={setSelected} /></div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink/70">
          <span className="flex items-center gap-2"><span className="inline-block h-3.5 w-6 rounded-full border border-ink" style={{ backgroundColor: YELLOW }} />Work</span>
          <span className="flex items-center gap-2"><span className="inline-block h-3.5 w-6 rounded-full border-2 border-dashed border-ink/40" />Buffer / closure</span>
          <span className="flex items-center gap-2"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink font-mono text-[9px] font-bold text-paper">2</span>Activities working</span>
          {instance.lines.map((l) => <span key={l.line_code} className="flex items-center gap-2"><span className="inline-block h-1.5 w-6 rounded-full" style={{ backgroundColor: lineColor(instance, l.line_code) }} />{l.line_name}</span>)}
        </div>
        {index.skipped.length > 0 && <p className="mt-3 text-xs text-amber-800">{index.skipped.length} {index.skipped.length === 1 ? "activity" : "activities"} could not be placed on the map: {index.skipped.slice(0, 3).join("; ")}{index.skipped.length > 3 ? "…" : ""}</p>}
      </CardContent></Card>

      <div className="space-y-6">
        <Card><CardHeader><CardTitle>{selected ? nameOf(selected) : "Select a station or segment"}</CardTitle>{selected && <p className="mt-1 text-xs text-ink/60">{lineNamesOf(selected).join(" · ")}</p>}</CardHeader><CardContent>
          {!selected && <p className="text-sm text-ink/60">Click or tab to a station or segment to see which activities are planned there.</p>}
          {selected && details.length === 0 && <p className="text-sm text-ink/60">Nothing planned here with the current filters.</p>}
          {details.length > 0 && <ul className="max-h-[420px] space-y-3 overflow-auto">{details.map((i) => {
            const a = activities.get(i.activity_id)!; const c = contracts.get(a.contract_number); const scheduled = weeks.get(a.activity_id);
            return <li key={a.activity_id} className="rounded-lg border border-ink/10 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold">{a.activity_id}</span>
                {i.role === "work" ? <Badge color="#8A6A00">Work</Badge> : <Badge color="#666666">Closure</Badge>}
                <span className="font-mono text-xs text-ink/50">{a.contract_number}{c ? ` · ${c.nature_of_activity}` : ""}</span></div>
              <p className="mt-1 text-xs text-ink/60">{a.activity_type} · {i.bounds.join(" + ")} · {a.total_accesses} {a.total_accesses === 1 ? "access" : "accesses"} · planned start {a.planned_start_date}</p>
              {solution && <p className="mt-1 text-xs text-ink/60">{scheduled ? `Scheduled in weeks ${formatWeeks(scheduled)}` : "Not scheduled in this scenario"}</p>}
            </li>;
          })}</ul>}
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Busiest locations</CardTitle></CardHeader><CardContent>
          {busiest.length === 0 ? <p className="text-sm text-ink/60">No work matches the current filters.</p> : <ul className="space-y-1">{busiest.map(({ key, work }) => <li key={key}>
            <button onClick={() => setSelected(key)} aria-pressed={selected === key} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ink aria-pressed:bg-ink/5"><span>{nameOf(key)}</span><span className="font-mono text-xs text-ink/60">{work} {work === 1 ? "activity" : "activities"}</span></button>
          </li>)}</ul>}
        </CardContent></Card>
      </div>
    </div>
  </div>;
}

function Header() {
  return <div>
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-ink/50">Track access planning</p>
    <h1 className="mt-3 text-4xl font-black tracking-tight">Maintenance map</h1>
    <p className="mt-3 max-w-xl text-sm text-ink/60">See which stations and segments each maintenance activity covers, and when it is scheduled. Click a station or segment for details.</p>
    <TrackDivider color="#9D5B25" stations={4} className="mt-6 max-w-xs" />
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-ink/60"><span className="mb-1 block">{label}</span>{children}</label>;
}
