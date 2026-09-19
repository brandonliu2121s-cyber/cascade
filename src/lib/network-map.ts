import { footprint } from "../../backend/src/ps1/topology";
import type { Activity, Instance, Solution } from "../../backend/src/ps1/types";

/** Line colours by position in the instance; red and orange are left out to stay distinct from the possession highlight. */
export const LINE_COLORS = ["#005EC4", "#009645", "#9900AA", "#9D5B25", "#0099AA"];
export const lineColor = (instance: Instance, code: string) => LINE_COLORS[Math.max(0, instance.lines.findIndex((l) => l.line_code === code)) % LINE_COLORS.length];

export type Bound = "EB" | "WB";
/** "work" is where the activity's crew actually works; "closure" is buffer, opposite-bound and coupled-line closure. */
export type Role = "work" | "closure";

/** `badge` is where the activity count sits: clear of the label, and of the neighbouring line's badge on shared sectors. */
export interface MapStation { id: string; x: number; y: number; interchange: boolean; lines: string[]; labelX: number; labelY: number; anchor: "start" | "middle" | "end"; badge: { x: number; y: number } }
export interface MapSector { id: string; line: string; from: string; to: string; x1: number; y1: number; x2: number; y2: number; badge: { x: number; y: number } }
export interface NetworkLayout { width: number; height: number; stations: MapStation[]; sectors: MapSector[] }

const DX = 68; // horizontal spacing between neighbouring stations
const DIAGONAL_STEPS = 2; // stations either side of an interchange that fan out at 45° before running flat
const PAD_X = 40; const PAD_Y = 48;
const LANE_GAP = 7; // spacing between sectors of different lines that run over the same pair of stations
const BADGE_GAP = 20;

/**
 * Derives a schematic from the instance's stations and sectors: interchange stations sit on a shared
 * spine, each line fans away from it at 45° (alternating above/below) and then runs flat. A line that
 * shares no interchange with an already-placed line gets its own row underneath.
 */
export function layoutNetwork(instance: Instance): NetworkLayout {
  const pos = new Map<string, { x: number; y: number }>();
  const side = new Map<string, number>(); // -1 fans up, +1 fans down
  const stationsOf = (line: string) => instance.stations.filter((s) => s.line_code === line).sort((a, b) => a.seq - b.seq);
  const detached: string[] = [];

  instance.lines.forEach((line, index) => {
    const stations = stationsOf(line.line_code);
    const hubs = stations.filter((s) => s.is_interchange);
    const anchor = hubs.find((h) => pos.has(h.station_id)) ?? (pos.size === 0 ? hubs[0] : undefined);
    if (!anchor) { detached.push(line.line_code); return; }
    const fan = (index % 2 === 0 ? -1 : 1) * (1 + Math.floor(index / 2) * 0.6);
    side.set(line.line_code, fan);
    const origin = pos.get(anchor.station_id) ?? { x: 0, y: 0 };
    pos.set(anchor.station_id, origin);
    for (const hub of hubs) if (!pos.has(hub.station_id)) pos.set(hub.station_id, { x: origin.x + (hub.seq - anchor.seq) * DX, y: origin.y });
    for (const s of stations) {
      if (pos.has(s.station_id)) continue;
      const near = hubs.reduce((best, h) => Math.abs(h.seq - s.seq) < Math.abs(best.seq - s.seq) ? h : best);
      const at = pos.get(near.station_id)!; const steps = Math.abs(s.seq - near.seq);
      pos.set(s.station_id, { x: at.x + Math.sign(s.seq - near.seq) * steps * DX, y: at.y + fan * Math.min(steps, DIAGONAL_STEPS) * DX });
    }
  });
  for (const code of detached) {
    const placed = [...pos.values()];
    const minX = placed.length ? Math.min(...placed.map((p) => p.x)) : 0;
    const y = placed.length ? Math.max(...placed.map((p) => p.y)) + DX * 1.5 : 0;
    side.set(code, 1);
    for (const s of stationsOf(code)) if (!pos.has(s.station_id)) pos.set(s.station_id, { x: minX + (s.seq - 1) * DX, y });
  }

  if (pos.size === 0) return { width: 2 * PAD_X, height: 2 * PAD_Y, stations: [], sectors: [] };
  const all = [...pos.values()];
  const minX = Math.min(...all.map((p) => p.x)); const minY = Math.min(...all.map((p) => p.y));
  const at = (id: string) => { const p = pos.get(id)!; return { x: p.x - minX + PAD_X, y: p.y - minY + PAD_Y }; };

  const stations: MapStation[] = [...pos.keys()].map((id) => {
    const rows = instance.stations.filter((s) => s.station_id === id);
    const interchange = rows.some((r) => r.is_interchange);
    const { x, y } = at(id);
    let anchor: MapStation["anchor"] = "middle";
    if (interchange) {
      // Labels sit above the spine, on the side away from neighbouring hubs so they never cover a line.
      const row = rows[0]; const neighbour = (seq: number) => stationsOf(row.line_code).find((s) => s.seq === seq)?.is_interchange;
      if (!neighbour(row.seq - 1)) anchor = "start"; else if (!neighbour(row.seq + 1)) anchor = "end";
    }
    const above = interchange || (side.get(rows[0].line_code) ?? 1) < 0;
    // On a diagonal, a neighbour lies on the label's side of the station; slide the label away from it.
    let labelX = x;
    if (!interchange) {
      const seqs = stationsOf(rows[0].line_code);
      const blocker = seqs.filter((s) => Math.abs(s.seq - rows[0].seq) === 1 && s.station_id !== id).map((s) => at(s.station_id)).find((n) => above ? n.y < y - 1 : n.y > y + 1);
      if (blocker) { anchor = blocker.x < x ? "start" : "end"; labelX = x + (anchor === "start" ? 7 : -7); }
    }
    // Labels sit above (or below) the station, so the badge goes on the opposite side; on the spine it tucks inside the hub pair.
    const badge = interchange ? { x: x + (anchor === "end" ? -12 : 12), y: y + 13 } : { x: x + 12, y: above ? y + 13 : y - 13 };
    return { id, x, y, interchange, lines: rows.map((r) => r.line_code), labelX, labelY: above ? y - 16 : y + 24, anchor, badge };
  });

  const groups = new Map<string, number>();
  const key = (s: Instance["sectors"][number]) => [s.from_station_id, s.to_station_id].sort().join("|");
  for (const s of instance.sectors) groups.set(key(s), (groups.get(key(s)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const sectors: MapSector[] = instance.sectors.map((s) => {
    const a = at(s.from_station_id); const b = at(s.to_station_id);
    const n = groups.get(key(s))!; const i = seen.get(key(s)) ?? 0; seen.set(key(s), i + 1);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1; const lane = i - (n - 1) / 2;
    const ux = -(b.y - a.y) / length; const uy = (b.x - a.x) / length; // unit normal
    const nx = ux * lane * LANE_GAP; const ny = uy * lane * LANE_GAP;
    // Badges of sectors sharing a stretch fan out further than the lines themselves so they don't overlap.
    const bx = (a.x + b.x) / 2 + ux * lane * BADGE_GAP; const by = (a.y + b.y) / 2 + uy * lane * BADGE_GAP;
    return { id: s.sector_id, line: s.line_code, from: s.from_station_id, to: s.to_station_id, x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny, badge: { x: bx, y: by } };
  });

  return {
    width: Math.max(...stations.map((s) => s.x)) + PAD_X,
    height: Math.max(...stations.map((s) => s.y)) + PAD_Y,
    stations, sectors,
  };
}

export type FeatureKey = `station:${string}` | `sector:${string}`;
export const stationKey = (id: string): FeatureKey => `station:${id}`;
export const sectorKey = (id: string): FeatureKey => `sector:${id}`;

/** One activity's effect on one station or sector. */
export interface Impact { activity_id: string; role: Role; bounds: Bound[]; lines: string[] }
export interface ImpactIndex { byFeature: Map<FeatureKey, Impact[]>; skipped: string[] }

/** Maps every activity's footprint (work, buffer and closure locations) onto stations and sectors. */
export function buildImpactIndex(instance: Instance): ImpactIndex {
  const byFeature = new Map<FeatureKey, Map<string, Impact>>(); const skipped: string[] = [];
  for (const activity of instance.activities) {
    let fp;
    try { fp = footprint(instance, activity); } catch (error) { skipped.push(`${activity.activity_id}: ${error instanceof Error ? error.message : "invalid span"}`); continue; }
    const work = new Set(fp.work);
    for (const id of fp.closure) {
      const parts = id.split(":");
      const key = parts[0] === "PLAT" ? stationKey(parts[2]) : sectorKey(parts.slice(0, 3).join(":"));
      const role: Role = work.has(id) ? "work" : "closure"; const bound = parts[3] as Bound;
      const impacts = byFeature.get(key) ?? new Map<string, Impact>(); byFeature.set(key, impacts);
      const impact = impacts.get(activity.activity_id) ?? { activity_id: activity.activity_id, role, bounds: [], lines: [] };
      if (role === "work") impact.role = "work";
      if (!impact.bounds.includes(bound)) impact.bounds.push(bound);
      if (!impact.lines.includes(parts[1])) impact.lines.push(parts[1]);
      impacts.set(activity.activity_id, impact);
    }
  }
  return { byFeature: new Map([...byFeature].map(([key, impacts]) => [key, [...impacts.values()]])), skipped };
}

export interface MapFilter {
  bound: Bound | "ALL";
  /** Only activities that are placed in this week of the selected solution. */
  week: number | null;
  contract: string | "ALL";
  showClosure: boolean;
}

export function activityWeeks(solution: Solution | null): Map<string, number[]> {
  const weeks = new Map<string, number[]>();
  for (const p of solution?.access ?? []) {
    const list = weeks.get(p.activity_id) ?? [];
    if (!list.includes(p.week)) list.push(p.week);
    weeks.set(p.activity_id, list);
  }
  for (const list of weeks.values()) list.sort((a, b) => a - b);
  return weeks;
}

/** Narrows impacts to the filter; a bound filter also narrows each impact's bounds. */
export function filterImpacts(impacts: Impact[], filter: MapFilter, activities: Map<string, Activity>, weeks: Map<string, number[]>): Impact[] {
  const kept: Impact[] = [];
  for (const impact of impacts) {
    const activity = activities.get(impact.activity_id);
    if (!activity) continue;
    if (filter.contract !== "ALL" && activity.contract_number !== filter.contract) continue;
    if (filter.week !== null && !weeks.get(impact.activity_id)?.includes(filter.week)) continue;
    if (impact.role === "closure" && !filter.showClosure) continue;
    const bounds = filter.bound === "ALL" ? impact.bounds : impact.bounds.filter((b) => b === filter.bound);
    if (bounds.length) kept.push({ ...impact, bounds });
  }
  return kept;
}

export type FeatureStatus = "work" | "closure" | "none";
export function summarise(impacts: Impact[]): { work: number; closure: number; status: FeatureStatus } {
  const work = impacts.filter((i) => i.role === "work").length;
  const closure = impacts.length - work;
  return { work, closure, status: work ? "work" : closure ? "closure" : "none" };
}

/** [1, 2, 3, 5] → "1–3, 5" */
export function formatWeeks(weeks: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < weeks.length; i++) {
    let j = i;
    while (j + 1 < weeks.length && weeks[j + 1] === weeks[j] + 1) j++;
    parts.push(j > i ? `${weeks[i]}–${weeks[j]}` : `${weeks[i]}`);
    i = j;
  }
  return parts.join(", ");
}
