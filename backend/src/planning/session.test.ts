import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INPUT_FILES } from "./instance";
import { solve } from "./solve";
import { parseCsv } from "./csv";
import { newSession, replaceSessionFiles, withSessionOptions, withSessionScenario, acceptSessionResponse, editActivity, editResources, applySessionPreview, applyReplanResponse } from "../../../src/lib/planning-session";

const files = Object.fromEntries(INPUT_FILES.map((name) => [name, readFileSync(resolve(__dirname, "../../data/official_dataset", name), "utf8")]));
function solved() {
  const state = newSession(files);
  const response = { instance: state.instance!, solutions: (["A", "B", "C"] as const).map((scenario) => solve(state.instance!, scenario)) };
  return acceptSessionResponse(state, response, state.revision);
}
describe("shared planning session", () => {
  it("invalidates results when a capacity overlay changes and applies revised options atomically", () => {
    const state = solved();
    const options = { capacityChanges: [{ location_id: "SEC:ALP:S01_S02:EB", from_week: 12, to_week: 14, supply_capacity: 2 }] };
    const changed = withSessionOptions(state, options);
    expect(changed.revision).toBe(state.revision + 1); expect(changed.response).toBeNull();
    const response = { instance: state.instance!, solutions: (["A", "B", "C"] as const).map(s => solve(state.instance!, s, options)), options, comparisons: [] };
    const applied = applyReplanResponse(state, response, state.revision);
    expect(applied.files).toEqual(state.files); expect(applied.options).toEqual(options); expect(applied.response).toBe(response); expect(applied.stale).toBe(false);
    expect(() => applyReplanResponse(changed, response, state.revision)).toThrow(/changed/);
    expect(newSession(state.files, applied.options).options).toEqual(options);
    expect(() => withSessionOptions(state, { capacityChanges: [{ ...options.capacityChanges[0], location_id: "missing" }] })).toThrow();
  });
  it("rejects infeasible replan application instead of installing unexportable shared results", () => {
    const state = solved(); const options = { capacityChanges: [{ location_id: "SEC:BET:S15_S16:EB", from_week: 1, to_week: 30, supply_capacity: 0 }] };
    const response = { instance: state.instance!, solutions: (["A", "B", "C"] as const).map(s => solve(state.instance!, s, options)), options, comparisons: [] };
    expect(() => applyReplanResponse(state, response, state.revision)).toThrow(/feasible/);
  });
  it("owns the same schedule and CSVs while changing selected scenario", () => {
    const state = solved(); const b = withSessionScenario(state, "B");
    expect(b.response).toBe(state.response);
    const result = b.response!.solutions.find((s) => s.scenario === b.selected)!;
    expect(parseCsv(result.csv['SCHEDULE_ACCESS.csv']).map((r) => r.activity_id)).toEqual(result.access.map((p) => p.activity_id));
    expect(parseCsv(result.csv['RESULTS.csv']).every((r) => r.scenario === "B")).toBe(true);
  });
  it("invalidates every generated scenario when editing workload", () => {
    const state = solved(); const activity = { ...state.instance!.activities[0], total_accesses: 9 };
    const changed = editActivity(state, activity, activity.activity_id);
    expect(changed.response).toBeNull(); expect(changed.stale).toBe(true);
    expect(changed.revision).toBe(state.revision + 1);
    expect(changed.instance!.activities[0].total_accesses).toBe(9);
    expect(parseCsv(changed.files['08_ACTIVITY_DETAILS.csv'])[0].total_accesses).toBe("9");
    expect(state.instance!.activities[0].total_accesses).not.toBe(9);
  });
  it("validates new activities, immutable IDs, unknown contracts and predecessor cycles", () => {
    const state = solved(); const activity = state.instance!.activities[0];
    expect(() => editActivity(state, activity)).toThrow(/already exists/);
    expect(() => editActivity(state, { ...activity, activity_id: 'RENAMED' }, activity.activity_id)).toThrow(/cannot be changed/);
    expect(() => editActivity(state, { ...activity, contract_number: 'UNKNOWN' }, activity.activity_id)).toThrow(/contract/i);
    expect(() => editActivity(state, { ...activity, predecessor_activity_id: activity.activity_id }, activity.activity_id)).toThrow(/cycle/i);
    const added = editActivity(state, { ...activity, activity_id: 'NEW', predecessor_activity_id: null });
    expect(added.instance!.activities).toHaveLength(55); expect(added.response).toBeNull();
  });
  it("uses actual resources and invalidates schedules after a capacity edit", () => {
    const state = solved(); const supplies = state.instance!.supplies.map((s, i) => i ? s : { ...s, supply_capacity: 0 });
    const changed = editResources(state, { supplies });
    expect(changed.response).toBeNull(); expect(changed.stale).toBe(true);
    expect(changed.instance!.supplies[0].supply_capacity).toBe(0);
    expect(parseCsv(changed.files['04_LOCATION_SUPPLY.csv'])[0].supply_capacity).toBe('0');
  });
  it("rejects late solves and What-If applications after base inputs changed", () => {
    const state = solved(); const changed = withSessionOptions(state, { allowHorizonExtension: true });
    expect(changed.response).toBeNull(); expect(changed.stale).toBe(true);
    expect(acceptSessionResponse(changed, state.response!, state.revision)).toBe(changed);
    expect(() => applySessionPreview(changed, state.files, state.response!, state.revision)).toThrow(/changed/);
    expect(state.response).not.toBeNull();
  });
  it("keeps a What-If preview separate until explicitly applied", () => {
    const state = solved(); const preview = editActivity(state, { ...state.instance!.activities[0], total_accesses: 1 }, state.instance!.activities[0].activity_id);
    const response = { instance: preview.instance!, solutions: (["A", "B", "C"] as const).map((s) => solve(preview.instance!, s)) };
    expect(state.instance!.activities[0].total_accesses).not.toBe(1);
    const applied = applySessionPreview(state, preview.files, response, state.revision);
    expect(applied.instance!.activities[0].total_accesses).toBe(1);
    expect(applied.response).toBe(response); expect(applied.stale).toBe(false);
    const replaced = replaceSessionFiles(applied, files);
    expect(replaced.response).toBeNull();
  });
});
