import type { Instance, Solution, Scenario, Report } from "../../backend/src/ps1/types";
export type { Instance, Solution, Scenario, Report };
export const PS1_FILES = ["01_LINES.csv", "02_STATIONS.csv", "03_SECTORS.csv", "04_LOCATION_SUPPLY.csv", "05_BUFFER_LOCATION.csv", "06_PARAMETERS.csv", "07_PROJECT_DETAILS.csv", "08_ACTIVITY_DETAILS.csv"];
export interface PlanningResponse { instance: Instance; solutions: Solution[] }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/ps1${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result as T;
}
export const loadPublicInstance = () => request<{ files: Record<string, string>; source: string }>("/sample");
export const solveInstance = (files: Record<string, string>) => request<PlanningResponse>("/solve", { files });
export const validateSubmission = (files: Record<string, string>, scenario: Scenario, submission: Record<string, string>) => request<Report>("/validate", { files, scenario, submission });
export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
