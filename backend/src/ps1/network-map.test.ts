import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INPUT_FILES, parseInstance } from "./instance";
import { solve } from "./solve";
import { footprint } from "./topology";
import { activityWeeks, buildImpactIndex, filterImpacts, formatWeeks, layoutNetwork, sectorKey, stationKey, summarise } from "../../../src/lib/network-map";
import type { MapFilter } from "../../../src/lib/network-map";

const load = (dataset: string) => parseInstance(Object.fromEntries(INPUT_FILES.map((name) => [name, readFileSync(resolve(__dirname, "../../data", dataset, name), "utf8")])));
const instance = load("official_dataset");
const activities = new Map(instance.activities.map((a) => [a.activity_id, a]));
const open: MapFilter = { bound: "ALL", week: null, contract: "ALL", showClosure: true };

describe("layoutNetwork", () => {
  const layout = layoutNetwork(instance);
  it("places every station once and every sector between its two stations", () => {
    expect(layout.stations.map((s) => s.id).sort()).toEqual([...new Set(instance.stations.map((s) => s.station_id))].sort());
    expect(layout.sectors).toHaveLength(instance.sectors.length);
  });
  it("puts the shared interchange stations in one place, flagged as such", () => {
    const hubs = layout.stations.filter((s) => s.interchange).map((s) => s.id).sort();
    expect(hubs).toEqual(["H01", "H02"]);
    expect(layout.stations.find((s) => s.id === "H01")!.lines.sort()).toEqual(["ALP", "BET"]);
  });
  it("keeps every element inside the canvas and never stacks two stations", () => {
    for (const s of layout.stations) { expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(layout.width); expect(s.y).toBeGreaterThan(0); expect(s.y).toBeLessThan(layout.height); }
    expect(new Set(layout.stations.map((s) => `${s.x},${s.y}`)).size).toBe(layout.stations.length);
  });
  it("draws the two lines' shared H01-H02 sectors side by side rather than on top of each other", () => {
    const [a, b] = layout.sectors.filter((s) => s.from === "H01" && s.to === "H02");
    expect(a.y1).not.toBeCloseTo(b.y1);
  });
  it("never lets two count badges overlap (badge radius is 8) or sit on their own station's label", () => {
    for (const l of [layout, layoutNetwork(load("test_dataset"))]) {
      const badges = [...l.sectors.map((s) => s.badge), ...l.stations.map((s) => s.badge)];
      badges.forEach((a, i) => badges.slice(i + 1).forEach((b) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(16)));
      for (const s of l.stations) expect(Math.abs(s.badge.y - s.labelY)).toBeGreaterThan(12);
    }
  });
  it("lays out the test dataset and an interchange-free line without throwing", () => {
    expect(layoutNetwork(load("test_dataset")).stations.length).toBeGreaterThan(0);
    const detached = { ...instance, stations: instance.stations.map((s) => ({ ...s, is_interchange: false })) };
    const flat = layoutNetwork(detached);
    expect(new Set(flat.stations.map((s) => `${s.x},${s.y}`)).size).toBe(flat.stations.length);
  });
  it("returns an empty layout for an empty network", () => {
    expect(layoutNetwork({ ...instance, lines: [], stations: [], sectors: [] }).stations).toEqual([]);
  });
});

describe("buildImpactIndex", () => {
  const { byFeature, skipped } = buildImpactIndex(instance);
  it("resolves every activity in the public instance", () => expect(skipped).toEqual([]));
  it("marks the activity's own sector as work on its bound", () => {
    // A001 works SEC:BET:S15_S16:EB → SEC:BET:S16_S17:EB
    const impact = byFeature.get(sectorKey("SEC:BET:S15_S16"))!.find((i) => i.activity_id === "A001")!;
    expect(impact.role).toBe("work");
    expect(impact.bounds).toContain("EB");
  });
  it("agrees with the solver's footprint for work locations", () => {
    for (const activity of instance.activities) {
      const fp = footprint(instance, activity);
      for (const id of fp.work.filter((l) => l.startsWith("SEC:"))) {
        const parts = id.split(":");
        const impact = byFeature.get(sectorKey(parts.slice(0, 3).join(":")))?.find((i) => i.activity_id === activity.activity_id);
        expect(impact?.role, `${activity.activity_id} ${id}`).toBe("work");
      }
    }
  });
  it("never reports work where the solver's footprint has none", () => {
    const featureOf = (id: string) => { const p = id.split(":"); return p[0] === "PLAT" ? stationKey(p[2]) : sectorKey(p.slice(0, 3).join(":")); };
    for (const [key, impacts] of byFeature) for (const i of impacts.filter((x) => x.role === "work")) {
      const fp = footprint(instance, activities.get(i.activity_id)!);
      expect(fp.work.some((w) => featureOf(w) === key), `${i.activity_id} at ${key}`).toBe(true);
    }
  });
  it("reports activities with an unresolvable span instead of throwing", () => {
    const broken = { ...instance, activities: [...instance.activities, { ...instance.activities[0], activity_id: "AXX", start_location_id: "SEC:ALP:S99_S98:EB", end_location_id: "SEC:ALP:S99_S98:EB" }] };
    expect(buildImpactIndex(broken).skipped[0]).toMatch(/^AXX:/);
  });
});

describe("filterImpacts", () => {
  const { byFeature } = buildImpactIndex(instance);
  const solution = solve(instance, "A");
  const weeks = activityWeeks(solution);
  const impacts = byFeature.get(sectorKey("SEC:ALP:S03_S04"))!;
  it("hides closure impacts when asked", () => {
    const work = filterImpacts(impacts, { ...open, showClosure: false }, activities, weeks);
    expect(work.every((i) => i.role === "work")).toBe(true);
    expect(filterImpacts(impacts, open, activities, weeks).length).toBeGreaterThanOrEqual(work.length);
  });
  it("narrows by bound", () => {
    for (const i of filterImpacts(impacts, { ...open, bound: "WB" }, activities, weeks)) expect(i.bounds).toEqual(["WB"]);
  });
  it("narrows by contract", () => {
    for (const i of filterImpacts(impacts, { ...open, contract: "C001" }, activities, weeks)) expect(activities.get(i.activity_id)!.contract_number).toBe("C001");
  });
  it("narrows by week to activities the solution places in that week", () => {
    const week = solution.access[0].week;
    const kept = filterImpacts([...byFeature.values()].flat(), { ...open, week }, activities, weeks);
    expect(kept.length).toBeGreaterThan(0);
    for (const i of kept) expect(weeks.get(i.activity_id)).toContain(week);
    expect(filterImpacts(impacts, { ...open, week: 9999 }, activities, weeks)).toEqual([]);
  });
  it("shows nothing for week filtering when there is no solution", () => {
    expect(filterImpacts(impacts, { ...open, week: 1 }, activities, activityWeeks(null))).toEqual([]);
  });
});

describe("summaries", () => {
  it("counts work and closure and picks the strongest status", () => {
    expect(summarise([])).toEqual({ work: 0, closure: 0, status: "none" });
    expect(summarise([{ activity_id: "a", role: "closure", bounds: ["EB"], lines: ["ALP"] }]).status).toBe("closure");
    expect(summarise([{ activity_id: "a", role: "closure", bounds: ["EB"], lines: ["ALP"] }, { activity_id: "b", role: "work", bounds: ["EB"], lines: ["ALP"] }])).toEqual({ work: 1, closure: 1, status: "work" });
  });
  it("formats week lists as ranges", () => {
    expect(formatWeeks([])).toBe("");
    expect(formatWeeks([4])).toBe("4");
    expect(formatWeeks([1, 2, 3, 5, 7, 8])).toBe("1–3, 5, 7–8");
  });
  it("addresses stations and sectors distinctly", () => expect(stationKey("S01")).not.toBe(sectorKey("S01")));
});
