# Unified PS1 UI implementation

Goal: align Dashboard, Intake, Requests, Schedule, What-If and Resources with the same PS1 inputs and generated CSVs. User approved this architecture by asking to implement the preceding proposal. Deployment remains out of scope.

Architecture: React provider above routes owns one browser-local planning session. Pure session transitions validate instance edits, invalidate outdated responses, and reject late asynchronous solve responses by revision. All pages read the selected Solution; its CSV content is the same result being displayed. Raw inputs/options/scenario survive reload; results survive navigation and must be regenerated after reload.

Interfaces: `usePlanning()` from `src/lib/planning-context.ts` returns files, instance (Instance|null), solution (Solution|null), response (PlanningResponse|null), selected (Scenario), options (PlanningOptions), revision (number), stale (boolean), busy, error, validation; setSelected, setOptions, replaceFiles, saveActivity(activity, previousId?), updateResources({supplies?,contracts?}), run, recheck, applyPreview(files,response,baseRevision). Editing validates the eight-file instance and may throw a user-readable Error. run/recheck capture failures in shared error. applyPreview rejects changed base revisions. Shared component PlanningEmpty links to planner, PlanningSummary shows selected scenario and stale/result status, ResultExports exports only current locally feasible solution.

Tasks:
- [ ] Write failing pure-session tests for navigation-independent result ownership, selected scenarios, edits/options invalidating exports, unknown references, and late response rejection.
- [ ] Implement session model/provider and shared view/export components, wrap app routes and refactor PS1Planner onto context.
- [ ] Convert Intake to add/edit official activity fields and invalidate schedules on save.
- [ ] Convert Dashboard/Requests/Schedule to exact PS1 result views; include readable occupancy and completion tables without invented weekdays/timestamps.
- [ ] Convert Resources to actual locations, buffers, contract caps/workfronts; What-If previews PS1 supply/workfront/workload changes and applies only against unchanged base.
- [ ] Run backend/pure model tests, builds, lint and browser cross-tab scenario/edit/preview/export checks. Review diff and preserve previous local changes when installing.

Constraints: preserve official schemas and solver rules, no new packages, no SQLite demo API calls from unified tabs, no fabricated crew/equipment/trust fields, no implicit What-If application, no stale CSV export, no push/deployment.
