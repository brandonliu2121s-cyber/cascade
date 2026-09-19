import { useRef, useState, type ReactNode } from "react";
import { PlanningContext } from "../lib/planning-context";
import { newSession, replaceSessionFiles, withSessionOptions, withSessionScenario, acceptSessionResponse, editActivity, editResources, applySessionPreview, applyReplanResponse } from "../lib/planning-session";
import type { PlanningSession } from "../lib/planning-session";
import { PS1_FILES, loadPublicInstance, solveInstance, validateSubmission } from "../lib/ps1";
import type { Report } from "../lib/ps1";

function initialState(): PlanningSession {
  try {
    const saved = JSON.parse(sessionStorage.getItem('cascade.ps1.session') || 'null');
    const source = saved?.files ?? JSON.parse(sessionStorage.getItem('cascade.ps1.files') || '{}');
    const files = Object.fromEntries(Object.entries(source).filter(([key, value]) => PS1_FILES.includes(key) && typeof value === 'string')) as Record<string, string>;
    return newSession(files, { allowHorizonExtension: saved?.options?.allowHorizonExtension === true, capacityChanges: saved?.options?.capacityChanges ?? [] }, ['A', 'B', 'C'].includes(saved?.selected) ? saved.selected : 'A');
  } catch { return newSession(); }
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Unable to update the planning session.';
export default function PlanningProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  const current = useRef(state);
  const [busy, setBusy] = useState(false); const working = useRef(false);
  const [error, setError] = useState(''); const [validation, setValidation] = useState<Report | null>(null);
  const commit = (next: PlanningSession) => {
    current.current = next; setState(next); setValidation(null);
    try { sessionStorage.setItem('cascade.ps1.session', JSON.stringify({ files: next.files, options: next.options, selected: next.selected })); } catch { /* In-memory session remains available. */ }
  };
  const editable = () => { if (working.current) throw new Error('Wait for the current planning operation to finish.'); };
  async function operation(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await action(); } catch (err) { setError(message(err)); }
    finally { working.current = false; setBusy(false); }
  }
  const run = () => operation(async () => {
    const base = current.current;
    if (!base.instance) throw new Error('Load all eight valid instance files first.');
    const response = await solveInstance(base.files, base.options);
    commit(acceptSessionResponse(current.current, response, base.revision));
  });
  const recheck = () => operation(async () => {
    const base = current.current; const solution = base.response?.solutions.find((s) => s.scenario === base.selected);
    if (!solution) throw new Error('Run the scenarios first.');
    const report = await validateSubmission(base.files, base.selected, solution.csv, base.options);
    if (base.revision === current.current.revision && base.selected === current.current.selected) setValidation(report);
  });
  const freshInputs = (files: Record<string, string>) => replaceSessionFiles({ ...current.current, options: { allowHorizonExtension: current.current.options.allowHorizonExtension } }, files);
  const loadPublic = () => operation(async () => { commit(freshInputs((await loadPublicInstance()).files)); });
  const uploadFiles = (uploaded: File[]) => operation(async () => {
    if (!uploaded.length) return;
    if (uploaded.some((f) => !PS1_FILES.includes(f.name))) throw new Error('Select only the eight official instance CSV filenames.');
    if (uploaded.some((f) => f.size > 2_000_000)) throw new Error('Each CSV must be smaller than 2 MB.');
    if (new Set(uploaded.map((f) => f.name)).size !== uploaded.length) throw new Error('Select one file per required filename.');
    const additions = Object.fromEntries(await Promise.all(uploaded.map(async (f) => [f.name, await f.text()])));
    commit(freshInputs({ ...current.current.files, ...additions }));
  });
  return <PlanningContext.Provider value={{ ...state, solution: state.response?.solutions.find((s) => s.scenario === state.selected) ?? null, busy, error, validation, setError,
    setSelected: (selected) => commit(withSessionScenario(current.current, selected)),
    setOptions: (options) => { editable(); commit(withSessionOptions(current.current, options)); },
    replaceFiles: (files) => { editable(); commit(freshInputs(files)); setError(''); },
    saveActivity: (activity, previousId) => { editable(); commit(editActivity(current.current, activity, previousId)); setError(''); },
    updateResources: (updates) => { editable(); commit(editResources(current.current, updates)); setError(''); },
    applyPreview: (files, response, revision) => { editable(); commit(applySessionPreview(current.current, files, response, revision)); setError(''); },
    applyReplan: (response, revision) => { editable(); commit(applyReplanResponse(current.current, response, revision)); setError(''); },
    run, recheck, loadPublic, uploadFiles,
  }}>{children}</PlanningContext.Provider>;
}
