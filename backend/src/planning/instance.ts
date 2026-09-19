import { parseCsv } from "./csv";
import { footprint } from "./topology";
import type { Instance, Nature } from "./types";

export const INPUT_FILES = ["01_LINES.csv", "02_STATIONS.csv", "03_SECTORS.csv", "04_LOCATION_SUPPLY.csv", "05_BUFFER_LOCATION.csv", "06_PARAMETERS.csv", "07_PROJECT_DETAILS.csv", "08_ACTIVITY_DETAILS.csv"];
export const day = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 86400000;
export const weekOf = (instance: Instance, date: string): number => Math.max(1, Math.floor((day(date) - day(instance.horizon_start)) / 7) + 1);
export const weekEnd = (instance: Instance, week: number): string => new Date((day(instance.horizon_start) + week * 7 - 1) * 86400000).toISOString().slice(0, 10);
export const dateValue = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(day(value)) || new Date(day(value) * 86400000).toISOString().slice(0, 10) !== value) throw new Error(`Invalid date: ${value}`);
  return value;
};
function numeric(value: string, label: string, min = 0, max = 20000): number {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid ${label}: ${value}`);
  return n;
}
function enumValue<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new Error(`Invalid ${label}: ${value}`);
  return value as T;
}
export function parseInstance(files: Record<string, string>): Instance {
  const missing = INPUT_FILES.filter((name) => typeof files[name] !== "string");
  if (missing.length) throw new Error(`Missing input files: ${missing.join(", ")}`);
  const read = (name: string, headers: string[]) => {
    const rows = parseCsv(files[name]);
    if (!rows.length || headers.some((h) => !(h in rows[0]))) throw new Error(`${name}: required columns ${headers.join(", ")}, with at least one data row`);
    if (rows.length > 2000) throw new Error(`${name}: at most 2000 rows supported`);
    return rows;
  };
  const unique = (values: string[], label: string) => { if (values.some((v) => !v) || new Set(values).size !== values.length) throw new Error(`Empty or duplicate ${label}`); };
  const nature = (value: string): Nature => enumValue(value, ["Live", "Non-live (Consist)", "Non-live (Others)"], "nature");
  const parameters = read("06_PARAMETERS.csv", ["key", "value"]);
  unique(parameters.map((r) => r.key), "parameter keys");
  const params = Object.fromEntries(parameters.map((r) => [r.key, r.value]));
  const instance: Instance = {
    horizon_start: dateValue(params.horizon_start), horizon_weeks: numeric(params.horizon_weeks, "horizon_weeks", 1, 1000),
    lines: read("01_LINES.csv", ["line_code", "line_name"]).map((r) => ({ line_code: r.line_code, line_name: r.line_name })),
    stations: read("02_STATIONS.csv", ["station_id", "line_code", "seq", "is_interchange"]).map((r) => ({ station_id: r.station_id, line_code: r.line_code, seq: numeric(r.seq, "station seq", 1), is_interchange: numeric(r.is_interchange, "is_interchange", 0, 1) === 1 })),
    sectors: read("03_SECTORS.csv", ["sector_id", "line_code", "from_station_id", "to_station_id", "seq"]).map((r) => ({ sector_id: r.sector_id, line_code: r.line_code, from_station_id: r.from_station_id, to_station_id: r.to_station_id, seq: numeric(r.seq, "sector seq", 1) })),
    supplies: read("04_LOCATION_SUPPLY.csv", ["location_id", "location_kind", "line_code", "bound", "supply_capacity"]).map((r) => ({ location_id: r.location_id, location_kind: r.location_kind, line_code: r.line_code, bound: enumValue(r.bound, ["EB", "WB"], "bound"), supply_capacity: numeric(r.supply_capacity, "supply capacity", 0, 1000) })),
    buffers: read("05_BUFFER_LOCATION.csv", ["nature_of_works", "up_to_buffer_sectors", "opposite_bound_required"]).map((r) => ({ nature_of_works: nature(r.nature_of_works), up_to_buffer_sectors: numeric(r.up_to_buffer_sectors, "buffer sectors", 0, 10), opposite_bound_required: numeric(r.opposite_bound_required, "opposite bound", 0, 1) === 1 })),
    contracts: read("07_PROJECT_DETAILS.csv", ["contract_number", "contract_description", "activity_type", "nature_of_activity", "contract_priority", "contract_completion_date", "planned_completion_date", "number_of_workfronts", "access_type", "number_of_maximum_access_per_week"]).map((r) => ({ contract_number: r.contract_number, contract_description: r.contract_description, activity_type: r.activity_type, nature_of_activity: nature(r.nature_of_activity), access_type: enumValue(r.access_type, ["PM", "PC", "C"], "access type"), contract_priority: numeric(r.contract_priority, "contract priority", 1, 3), contract_completion_date: dateValue(r.contract_completion_date), planned_completion_date: dateValue(r.planned_completion_date), number_of_workfronts: numeric(r.number_of_workfronts, "workfronts", 1, 100), number_of_maximum_access_per_week: numeric(r.number_of_maximum_access_per_week, "weekly accesses", 1, 7) })),
    activities: read("08_ACTIVITY_DETAILS.csv", ["activity_id", "contract_number", "activity_type", "start_location_id", "end_location_id", "total_accesses", "planned_start_date", "predecessor_activity_id", "activity_priority"]).map((r) => ({ activity_id: r.activity_id, contract_number: r.contract_number, activity_type: r.activity_type, start_location_id: r.start_location_id, end_location_id: r.end_location_id, total_accesses: numeric(r.total_accesses, "total accesses", 1, 1000), planned_start_date: dateValue(r.planned_start_date), predecessor_activity_id: r.predecessor_activity_id || null, activity_priority: numeric(r.activity_priority, "activity priority", 1, 3) })),
  };
  unique(instance.lines.map((l) => l.line_code), "lines");
  unique(instance.stations.map((s) => `${s.line_code}:${s.station_id}`), "stations");
  unique(instance.stations.map((s) => `${s.line_code}:${s.seq}`), "station sequences");
  unique(instance.sectors.map((s) => s.sector_id), "sectors");
  unique(instance.sectors.map((s) => `${s.line_code}:${s.seq}`), "sector sequences");
  unique(instance.supplies.map((s) => s.location_id), "locations");
  unique(instance.buffers.map((b) => b.nature_of_works), "buffer nature");
  unique(instance.contracts.map((c) => c.contract_number), "contracts");
  unique(instance.activities.map((a) => a.activity_id), "activities");
  if (!instance.activities.length || !instance.contracts.length) throw new Error("Instance must contain contracts and activities");
  if (instance.activities.length > 500 || instance.activities.reduce((n, a) => n + a.total_accesses, 0) > 10000) throw new Error("Instance exceeds supported size (500 activities / 10000 access units)");
  for (const station of instance.stations) if (!instance.lines.some((l) => l.line_code === station.line_code)) throw new Error(`Unknown line for station ${station.station_id}`);
  for (const sector of instance.sectors) {
    const from = instance.stations.find((s) => s.station_id === sector.from_station_id && s.line_code === sector.line_code);
    const to = instance.stations.find((s) => s.station_id === sector.to_station_id && s.line_code === sector.line_code);
    if (!from || !to || to.seq !== from.seq + 1 || sector.sector_id !== `SEC:${sector.line_code}:${from.station_id}_${to.station_id}`) throw new Error(`Invalid sector topology: ${sector.sector_id}`);
  }
  for (const line of instance.lines) {
    const stations = instance.stations.filter((s) => s.line_code === line.line_code).sort((a, b) => a.seq - b.seq);
    const sectors = instance.sectors.filter((s) => s.line_code === line.line_code).sort((a, b) => a.seq - b.seq);
    if (stations.length < 2 || sectors.length !== stations.length - 1 || stations.some((s, i) => s.seq !== i + 1) || sectors.some((s, i) => s.from_station_id !== stations[i].station_id || s.to_station_id !== stations[i + 1].station_id)) throw new Error(`Incomplete topology for ${line.line_code}`);
  }
  for (const supply of instance.supplies) {
    const parts = supply.location_id.split(":");
    if (parts.length !== 4 || parts[1] !== supply.line_code || parts[3] !== supply.bound || !(parts[0] === "SEC" ? instance.sectors.some((s) => s.sector_id === parts.slice(0, 3).join(":")) : parts[0] === "PLAT" && instance.stations.some((s) => s.line_code === parts[1] && s.station_id === parts[2]))) throw new Error(`Invalid location supply: ${supply.location_id}`);
  }
  for (const contract of instance.contracts) if (!instance.buffers.some((b) => b.nature_of_works === contract.nature_of_activity)) throw new Error(`Missing buffer rule for ${contract.nature_of_activity}`);
  const states = new Map<string, number>();
  const visit = (id: string) => {
    if (states.get(id) === 1) throw new Error(`Predecessor cycle at ${id}`);
    if (states.get(id) === 2) return;
    const activity = instance.activities.find((a) => a.activity_id === id);
    if (!activity) throw new Error(`Unknown predecessor activity ${id}`);
    states.set(id, 1); if (activity.predecessor_activity_id) visit(activity.predecessor_activity_id); states.set(id, 2);
  };
  for (const activity of instance.activities) {
    const contract = instance.contracts.find((c) => c.contract_number === activity.contract_number);
    if (!contract) throw new Error(`Unknown contract for ${activity.activity_id}`);
    if (contract.activity_type !== activity.activity_type) throw new Error(`Activity type differs from contract for ${activity.activity_id}`);
    visit(activity.activity_id);
    const f = footprint(instance, activity);
    if (f.closure.some((id) => !instance.supplies.some((s) => s.location_id === id))) throw new Error(`Missing supply location in footprint of ${activity.activity_id}`);
  }
  return instance;
}
