# PS1 implementation

Approved scope: the five implementation parts proposed in this task.

Keep the React/Vite and Express application. Add a PS1 planner at /app/ps1 with independent uploaded instances, multiweek activity placements, shared possessions, and scenario comparisons. The existing nightly demo remains available. All PS1 schedules are checked by an independent local checker derived from the published brief; do not label it the organisers' validator, which is not distributed in the public repository.

## Execution and verification

- [x] CSV/model: add backend/src/ps1/{types,csv,instance,topology}.ts. Test the actual public files, invalid references, quoting, date boundaries, and dependency cycles.
- [x] Checker: add backend/src/ps1/check.ts. Test workload, precedence, legal mixes, capacities, buffers, mirroring, interchange coupling, access budgets, workfronts, and ECLO continuity with deliberately invalid schedules.
- [x] Solver: add backend/src/ps1/solve.ts. Schedule all workloads, support co-sharing and planned overruns, and use scenario policies with priority-tier weighting. Test congested, predecessor, ECLO, and impossible-deadline examples, then the public dataset. Heuristic schedules are not guaranteed global optima; failure to find a feasible B schedule is diagnostic, not proof of impossibility.
- [x] API/UI: add backend/src/routes/ps1.ts and src/pages/PS1Planner.tsx; use browser file reading with JSON CSV content, server-side schema parsing, A/B/C results, weekly timeline, diagnostics, and checked CSV downloads. Keep uploads isolated per solve, with no cross-user server state. Test HTTP requests and browser upload/download.
- [x] Deliver: add CLI and reproducible public CSV outputs; run existing/new backend tests, both TypeScript checks, frontend build, lint, and UI smoke test; copy verified changed files to the user's project without touching their database or existing lockfile changes.

## Operational semantics

access_night is local to contract/type/week, never a global weekday. Possession groups are local to location/week. Full spans include all endpoint platforms and intervening sectors. Closures include buffers, the opposite bound for Live, and the other line at the interchange for Live only. Scenario A forbids ECLO/excess capacity; B enforces planned completion dates and prices unlimited excess; C permits one excess group per location/week and a continuous two-week ECLO window per affected line. Completion dates use the Sunday ending each planning week, matching the public sample. Congested A/C schedules may extend a flat-supply planning horizon, with this extension disclosed.

