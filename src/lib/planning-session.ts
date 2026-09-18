import { INPUT_FILES, parseInstance } from "../../backend/src/ps1/instance";
import { parseCsv, writeCsv } from "../../backend/src/ps1/csv";
import type { Activity, Instance, PlanningOptions, Scenario } from "../../backend/src/ps1/types";
import type { PlanningResponse } from "./ps1";

export interface PlanningSession {
  files: Record<string, string>;
  instance: Instance | null;
  response: PlanningResponse | null;
  selected: Scenario;
  options: PlanningOptions;
  revision: number;
  stale: boolean;
}
const instanceFor = (files: Record<string, string>) => INPUT_FILES.every((name) => typeof files[name] === "string") ? parseInstance(files) : null;
export function newSession(files: Record<string, string> = {}, options: PlanningOptions = {}, selected: Scenario = "A"): PlanningSession {
  return { files: { ...files }, instance: instanceFor(files), response: null, selected, options: { ...options }, revision: 0, stale: false };
}
export function replaceSessionFiles(state: PlanningSession, files: Record<string, string>): PlanningSession {
  return { ...state, files: { ...files }, instance: instanceFor(files), response: null, revision: state.revision + 1, stale: state.stale || state.response !== null };
}
export function withSessionOptions(state: PlanningSession, options: PlanningOptions): PlanningSession {
  if (Boolean(options.allowHorizonExtension) === Boolean(state.options.allowHorizonExtension)) return state;
  return { ...state, options: { ...options }, response: null, revision: state.revision + 1, stale: state.stale || state.response !== null };
}
export function withSessionScenario(state: PlanningSession, selected: Scenario): PlanningSession { return { ...state, selected }; }
export function acceptSessionResponse(state: PlanningSession, response: PlanningResponse, revision: number): PlanningSession {
  if (state.revision !== revision) return state;
  if (JSON.stringify(state.instance) !== JSON.stringify(response.instance)) throw new Error("Schedule does not match the current input instance.");
  return { ...state, response, stale: false };
}
export function replaceInstanceRows(files: Record<string, string>, name: string, rows: object[]): Record<string, string> {
  const original = parseCsv(files[name]);
  if (!original.length || !rows.length) throw new Error(`${name} must contain at least one data row.`);
  return { ...files, [name]: writeCsv(Object.keys(original[0]), rows) };
}
export function editActivity(state: PlanningSession, activity: Activity, previousId?: string): PlanningSession {
  if (!state.instance) throw new Error("Load the eight instance files first.");
  const exists = state.instance.activities.some((a) => a.activity_id === (previousId ?? activity.activity_id));
  if (previousId && !exists) throw new Error("The activity being edited no longer exists.");
  if (previousId && previousId !== activity.activity_id) throw new Error("Activity ID cannot be changed when editing.");
  if (!previousId && exists) throw new Error(`Activity ${activity.activity_id} already exists.`);
  const rows = parseCsv(state.files['08_ACTIVITY_DETAILS.csv']);
  const next = previousId ? rows.map((a) => a.activity_id === previousId ? { ...a, ...activity } : a) : [...rows, activity];
  return replaceSessionFiles(state, replaceInstanceRows(state.files, '08_ACTIVITY_DETAILS.csv', next));
}
export function editResources(state: PlanningSession, updates: { supplies?: Instance['supplies']; contracts?: Instance['contracts'] }): PlanningSession {
  if (!state.instance) throw new Error("Load the eight instance files first.");
  let files = state.files;
  for (const [name, rows, key] of [
    ['04_LOCATION_SUPPLY.csv', updates.supplies, 'location_id'],
    ['07_PROJECT_DETAILS.csv', updates.contracts, 'contract_number'],
  ] as const) {
    if (!rows) continue;
    const original = parseCsv(files[name]);
    files = replaceInstanceRows(files, name, rows.map((row) => ({ ...original.find((r) => r[key] === row[key as keyof typeof row]), ...row })));
  }
  return replaceSessionFiles(state, files);
}
export function applySessionPreview(state: PlanningSession, files: Record<string, string>, response: PlanningResponse, baseRevision: number): PlanningSession {
  if (state.revision !== baseRevision) throw new Error("The planning inputs changed. Run a new What-If preview before applying it.");
  const next = replaceSessionFiles(state, files);
  return acceptSessionResponse(next, response, next.revision);
}
