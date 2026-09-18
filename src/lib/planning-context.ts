import { createContext, useContext } from "react";
import type { Activity, Instance, PlanningOptions, Report, Scenario, Solution } from "../../backend/src/ps1/types";
import type { PlanningResponse } from "./ps1";
import type { PlanningSession } from "./planning-session";

export interface PlanningContextValue extends PlanningSession {
  solution: Solution | null;
  busy: boolean;
  error: string;
  validation: Report | null;
  setError: (message: string) => void;
  setSelected: (scenario: Scenario) => void;
  setOptions: (options: PlanningOptions) => void;
  replaceFiles: (files: Record<string, string>) => void;
  saveActivity: (activity: Activity, previousId?: string) => void;
  updateResources: (updates: { supplies?: Instance['supplies']; contracts?: Instance['contracts'] }) => void;
  applyPreview: (files: Record<string, string>, response: PlanningResponse, baseRevision: number) => void;
  run: () => Promise<void>;
  recheck: () => Promise<void>;
  loadPublic: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
}
export const PlanningContext = createContext<PlanningContextValue | null>(null);
export function usePlanning(): PlanningContextValue {
  const planning = useContext(PlanningContext);
  if (!planning) throw new Error("PlanningProvider is required.");
  return planning;
}
