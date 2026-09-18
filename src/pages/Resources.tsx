import { useState } from "react";
import { usePlanning } from "../lib/planning-context";
import { PlanningEmpty, PlanningSummary } from "../components/PlanningViews";
import { TrackDivider } from "../components/transit";
import { Button, Card, Input, Label, Select } from "../components/ui";

function ResourceEditor() {
  const { instance, busy, updateResources } = usePlanning();
  const [locationId, setLocationId] = useState(instance?.supplies[0]?.location_id ?? "");
  const [contractId, setContractId] = useState(instance?.contracts[0]?.contract_number ?? "");
  const supply = instance?.supplies.find((row) => row.location_id === locationId);
  const contract = instance?.contracts.find((row) => row.contract_number === contractId);
  const [capacity, setCapacity] = useState(String(supply?.supply_capacity ?? 0));
  const [workfronts, setWorkfronts] = useState(String(contract?.number_of_workfronts ?? 1));
  const [weeklyCap, setWeeklyCap] = useState(String(contract?.number_of_maximum_access_per_week ?? 1));
  const [error, setError] = useState("");
  if (!instance) return null;
  function save(kind: "supply" | "contract") {
    if (!instance) return;
    try {
      if (kind === "supply") {
        if (!capacity.trim()) throw new Error("Enter a supply capacity.");
        updateResources({ supplies: instance.supplies.map((row) => row.location_id === locationId ? { ...row, supply_capacity: Number(capacity) } : row) });
      } else {
        if (!workfronts.trim() || !weeklyCap.trim()) throw new Error("Enter workfront and weekly access limits.");
        updateResources({ contracts: instance.contracts.map((row) => row.contract_number === contractId ? { ...row, number_of_workfronts: Number(workfronts), number_of_maximum_access_per_week: Number(weeklyCap) } : row) });
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to save limits."); }
  }
  return <div className="space-y-6">
    {error && <p role="alert" className="text-sm text-line-red">{error}</p>}
    <p className="text-sm text-ink/60">Saving a limit updates the shared inputs. Generate a new schedule after editing.</p>
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-4 p-5"><h2 className="font-semibold">Location supply</h2>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save("supply"); }}>
          <Label htmlFor="resource-location">Location</Label><Select id="resource-location" disabled={busy} value={locationId} onChange={(event) => { const id = event.target.value; setLocationId(id); setCapacity(String(instance.supplies.find((row) => row.location_id === id)?.supply_capacity ?? 0)); setError(""); }}>{instance.supplies.map((row) => <option key={row.location_id} value={row.location_id}>{row.location_id} · {row.line_code} {row.bound}</option>)}</Select>
          <Label htmlFor="resource-capacity">Supply capacity per week</Label><Input id="resource-capacity" type="number" required min={0} max={1000} step={1} disabled={busy} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
          <Button disabled={busy || !supply} type="submit">Save supply</Button>
        </form>
      </Card>
      <Card className="space-y-4 p-5"><h2 className="font-semibold">Contract limits</h2>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save("contract"); }}>
          <Label htmlFor="resource-contract">Contract</Label><Select id="resource-contract" disabled={busy} value={contractId} onChange={(event) => { const id = event.target.value; const row = instance.contracts.find((item) => item.contract_number === id); setContractId(id); setWorkfronts(String(row?.number_of_workfronts ?? 1)); setWeeklyCap(String(row?.number_of_maximum_access_per_week ?? 1)); setError(""); }}>{instance.contracts.map((row) => <option key={row.contract_number} value={row.contract_number}>{row.contract_number} · {row.contract_description}</option>)}</Select>
          <Label htmlFor="resource-workfronts">Simultaneous workfronts</Label><Input id="resource-workfronts" type="number" required min={1} max={100} step={1} disabled={busy} value={workfronts} onChange={(event) => setWorkfronts(event.target.value)} />
          <Label htmlFor="resource-weekly">Maximum accesses per week</Label><Input id="resource-weekly" type="number" required min={1} max={7} step={1} disabled={busy} value={weeklyCap} onChange={(event) => setWeeklyCap(event.target.value)} />
          <Button disabled={busy || !contract} type="submit">Save contract limits</Button>
        </form>
      </Card>
    </div>
    <Card className="overflow-x-auto p-5"><h2 className="mb-3 font-semibold">Official location capacities</h2><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Location</th><th className="p-2">Kind</th><th className="p-2">Line</th><th className="p-2">Bound</th><th className="p-2">Capacity / week</th></tr></thead><tbody>{instance.supplies.map((row) => <tr className="border-t border-ink/10" key={row.location_id}><td className="p-2 font-mono">{row.location_id}</td><td className="p-2">{row.location_kind}</td><td className="p-2">{row.line_code}</td><td className="p-2">{row.bound}</td><td className="p-2">{row.supply_capacity}</td></tr>)}</tbody></table></Card>
    <Card className="overflow-x-auto p-5"><h2 className="mb-3 font-semibold">Official contract caps</h2><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Contract</th><th className="p-2">Activity type</th><th className="p-2">Access type</th><th className="p-2">Workfronts</th><th className="p-2">Accesses / week</th></tr></thead><tbody>{instance.contracts.map((row) => <tr className="border-t border-ink/10" key={row.contract_number}><td className="p-2">{row.contract_number}</td><td className="p-2">{row.activity_type}</td><td className="p-2">{row.access_type}</td><td className="p-2">{row.number_of_workfronts}</td><td className="p-2">{row.number_of_maximum_access_per_week}</td></tr>)}</tbody></table></Card>
    <Card className="overflow-x-auto p-5"><h2 className="mb-3 font-semibold">Buffer rules · read only</h2><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Nature of works</th><th className="p-2">Buffer sectors</th><th className="p-2">Opposite bound required</th></tr></thead><tbody>{instance.buffers.map((row) => <tr className="border-t border-ink/10" key={row.nature_of_works}><td className="p-2">{row.nature_of_works}</td><td className="p-2">{row.up_to_buffer_sectors}</td><td className="p-2">{row.opposite_bound_required ? "Yes" : "No"}</td></tr>)}</tbody></table></Card>
    <Card className="space-y-3 p-5"><h2 className="font-semibold">Network · read only</h2><p className="text-sm text-ink/60">{instance.stations.length} stations · {instance.sectors.length} sectors. Network topology comes from the loaded official input files.</p>{instance.lines.map((line) => <div key={line.line_code} className="text-sm"><span className="font-semibold">{line.line_code} · {line.line_name}</span><p className="mt-1 text-ink/60">Stations: {instance.stations.filter((row) => row.line_code === line.line_code).sort((a, b) => a.seq - b.seq).map((row) => row.station_id).join(" → ")}</p><p className="mt-1 text-ink/60">Sectors: {instance.sectors.filter((row) => row.line_code === line.line_code).sort((a, b) => a.seq - b.seq).map((row) => `${row.sector_id} (${row.from_station_id}–${row.to_station_id})`).join(", ")}</p></div>)}</Card>
  </div>;
}

export default function Resources() {
  const { instance, revision } = usePlanning();
  return <div className="animate-fade-up space-y-6 py-10"><div><p className="font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-ink/50">Planning inputs</p><h1 className="mt-3 text-4xl font-black tracking-tight">Resources</h1><TrackDivider color="#0099AA" stations={3} className="mt-6 max-w-xs" /></div><PlanningSummary />{instance ? <ResourceEditor key={revision} /> : <PlanningEmpty />}</div>;
}
