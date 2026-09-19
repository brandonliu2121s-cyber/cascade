import type { Instance, Solution, Scenario, Report, PlanningOptions, CapacityChange, ReplanComparison } from "../../backend/src/planning/types";
export type { Instance, Solution, Scenario, Report, PlanningOptions, CapacityChange, ReplanComparison };
export const INSTANCE_FILES = ["01_LINES.csv", "02_STATIONS.csv", "03_SECTORS.csv", "04_LOCATION_SUPPLY.csv", "05_BUFFER_LOCATION.csv", "06_PARAMETERS.csv", "07_PROJECT_DETAILS.csv", "08_ACTIVITY_DETAILS.csv"];
export interface PlanningResponse { instance: Instance; solutions: Solution[] }
export interface ReplanResponse extends PlanningResponse { options: PlanningOptions; comparisons: ReplanComparison[] }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/planning${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result as T;
}
export const loadPublicInstance = () => request<{ files: Record<string, string>; source: string }>("/sample");
export const solveInstance = (files: Record<string, string>, options: PlanningOptions = {}) => request<PlanningResponse>("/solve", { files, options });
export const replanInstance = (files: Record<string, string>, baselines: Record<Scenario, Record<string, string>>, disruption: CapacityChange, options: PlanningOptions = {}) => request<ReplanResponse>("/replan", { files, baselines, disruption, options });
export const validateSubmission = (files: Record<string, string>, scenario: Scenario, submission: Record<string, string>, options: PlanningOptions = {}) => request<Report>("/validate", { files, scenario, submission, options });
export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
