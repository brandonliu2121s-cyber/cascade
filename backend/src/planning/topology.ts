import type { Instance, Activity, Footprint, AccessType } from "./types";

export function footprint(instance: Instance, activity: Activity): Footprint {
  const start = activity.start_location_id.split(":"); const end = activity.end_location_id.split(":");
  if (start.length !== 4 || end.length !== 4 || start[1] !== end[1] || start[3] !== end[3] || !["EB", "WB"].includes(start[3])) throw new Error(`Invalid activity span: ${activity.activity_id}`);
  const line = start[1]; const bound = start[3];
  const stations = instance.stations.filter((s) => s.line_code === line).sort((a, b) => a.seq - b.seq);
  const sectors = instance.sectors.filter((s) => s.line_code === line).sort((a, b) => a.seq - b.seq);
  const interval = (parts: string[]): [number, number] => {
    if (parts[0] === "PLAT") { const index = stations.findIndex((s) => s.station_id === parts[2]); if (index >= 0) return [index, index]; }
    if (parts[0] === "SEC") { const sector = sectors.find((s) => s.sector_id === parts.slice(0, 3).join(":")); if (sector) return [stations.findIndex((s) => s.station_id === sector.from_station_id), stations.findIndex((s) => s.station_id === sector.to_station_id)]; }
    throw new Error(`Unknown location ${parts.join(":")} for ${activity.activity_id}`);
  };
  const [s1, s2] = interval(start); const [e1, e2] = interval(end);
  const lo = Math.min(s1, s2, e1, e2); const hi = Math.max(s1, s2, e1, e2);
  const locations = (left: number, right: number): string[] => [
    ...stations.slice(left, right + 1).map((s) => `PLAT:${line}:${s.station_id}:${bound}`),
    ...sectors.filter((s) => { const a = stations.findIndex((st) => st.station_id === s.from_station_id); const b = stations.findIndex((st) => st.station_id === s.to_station_id); return a >= left && b <= right; }).map((s) => `${s.sector_id}:${bound}`),
  ];
  const work = locations(lo, hi);
  const contract = instance.contracts.find((c) => c.contract_number === activity.contract_number);
  if (!contract) throw new Error(`Unknown contract for ${activity.activity_id}`);
  const rule = instance.buffers.find((b) => b.nature_of_works === contract.nature_of_activity);
  if (!rule) throw new Error(`Missing buffer rule for ${activity.activity_id}`);
  const extended = locations(Math.max(0, lo - rule.up_to_buffer_sectors), Math.min(stations.length - 1, hi + rule.up_to_buffer_sectors));
  const closure = new Set(extended);
  if (contract.nature_of_activity === "Live" || rule.opposite_bound_required) for (const id of extended) closure.add(id.replace(/:(EB|WB)$/, bound === "EB" ? ":WB" : ":EB"));
  if (contract.nature_of_activity === "Live") {
    // Only traction-power closures at the interchange couple the two lines.
    for (const id of [...closure]) {
      const parts = id.split(":");
      const hubPlatform = parts[0] === "PLAT" && instance.stations.some((s) => s.line_code === line && s.station_id === parts[2] && s.is_interchange);
      const hubTunnel = parts[0] === "SEC" && instance.sectors.some((s) => s.sector_id === parts.slice(0, 3).join(":") && instance.stations.filter((st) => st.line_code === line && [s.from_station_id, s.to_station_id].includes(st.station_id) && st.is_interchange).length === 2);
      if (hubPlatform || hubTunnel) for (const other of instance.lines.filter((l) => l.line_code !== line)) {
        const target = `${parts[0]}:${other.line_code}:${parts[2]}:${parts[3]}`;
        if (instance.supplies.some((s) => s.location_id === target)) closure.add(target);
      }
    }
  }
  return { work, buffer: extended.filter((id) => !work.includes(id)), closure: [...closure], affected_lines: [...new Set([...closure].map((id) => id.split(":")[1]))] };
}
export const legalMix = (types: AccessType[]): boolean => types.length <= 4 && (types.includes("PM") ? types.length === 1 : types.filter((t) => t === "PC").length <= 1);
