<img width="1213" height="492" alt="image" src="https://github.com/user-attachments/assets/0007c164-cf49-44af-99b6-26e7c181f50c" />

Cascade is a rail maintenance scheduling optimisation prototype built around the CAPO framework:

- **Capture** maintenance demand and available resources
- **Assess** time, space, resource, and safety constraints
- **Prioritise** contracted work by priority and completion targets
- **Optimise** weekly track possessions against access capacity and safety constraints

The app helps a duty manager turn contracted activities into a conflict-aware weekly possession plan, understand why work was moved or deferred, and test whether adding resources would improve output.

## Features

### Possession planner

After sign-in, open **Planner** (`/app/planner`). Load the bundled official public dataset or upload all eight CSV instance files, then run Scenarios A, B, and C. The planner shows full workload accounting, per-contract completion, a weekly activity timeline, possession groups, explanations, and local feasibility diagnostics. Recheck the exported CSVs and download each scenario's three files into its own folder.

- Official topology, EB/WB bounds, tunnel/platform span expansion, nature-specific buffers, Live opposite-bound and interchange coupling.
- Contract/type weekly access accounting, workfront caps, strict predecessor weeks, planned starts, PM/PC/C possession groups, and co-sharing.
- A forbids excess capacity and ECLO; B holds planned dates and prices extra capacity/ECLO; C permits one excess possession per location-week and a continuous two-week ECLO window per affected line.
- Multiple deterministic heuristic passes select the best locally feasible result found. No global optimum or feasibility on every hidden instance is promised. A failed B search retains scheduled workloads and reports deadline violations rather than claiming the instance is mathematically impossible.
  - The published supply is flat by location. Planning stays inside `horizon_weeks` by default; the UI's explicit horizon-extension option assumes that supply continues beyond the declared period. Incomplete work is reported when a strict-horizon schedule cannot be found. Supply CSVs with week-specific quotas are not supported by the published schema.

**Checker scope:** Cascade evaluates schedules against the published brief. Its conservative buffer-overlap interpretation differs from the published reference sample: reference week 21 overlaps the buffers of A025 (PC Consist) and A074 (PC Live) at `SEC:ALP:S03_S04:EB`. Access-night indices belong to individual contracts, so they do not establish distinct global nights. The reported scores describe Cascade’s own checks.

All planning tabs share one instance and selected scenario. Request edits activities; What-If previews input changes separately until applied. Dashboard and Status show matching generated results, and Planner displays the schedule. Editing inputs clears stale schedules and disables exports until regeneration. Inputs persist in browser session storage; a page reload requires regenerating results. Edits affect the browser instance rather than the original CSV files on disk. Uploads are request-isolated and do not overwrite the legacy SQLite demo database.

Run tests and generate public schedules:

```bash
npm --prefix backend test
npm --prefix backend run build
npm run build
cd backend
npm run planning:export
# Optional: npm run planning:export -- path/to/instance path/to/output
```

The CLI generates `submission/planning/A`, `B`, and `C`, each with `SCHEDULE_ACCESS.csv`, `SCHEDULE_OCCUPANCY.csv`, `RESULTS.csv`, and a clearly labelled `LOCAL_REPORT.json`. The three CSVs are the submission; the JSON is supplementary local evidence. To explicitly explore an extended flat-supply horizon, run `npm run planning:export -- --allow-horizon-extension` inside `backend`. The API accepts `options: { allowHorizonExtension: true }` on both solve and validate; omitted options enforce the declared horizon. The horizon extension is an exploratory policy beyond the declared planning period.

The solver additionally protects downstream contract deadlines when ordering predecessors, uses activity priority within contract tiers, and tries lower-cost supply plans before selecting the best feasible candidate. Regression examples reduce B excess cost from 21 to 0, A delay cost from 9.1 to 7, and C cost from 21 to 7. These are targeted examples, not guarantees of global optimality or hidden-instance performance. See `docs/validation-notes.md` for unresolved safety semantics.

To serve the built frontend and API together on a hosting provider with Node.js 24+, build both apps, set `SERVE_FRONTEND=1`, optionally set `PORT`, and run `npm start` inside `backend`. In PowerShell:

```powershell
$env:SERVE_FRONTEND = '1'
$env:PORT = '3001'
npm --prefix backend start
```

The app has not been published to a hosting provider. Hosting, the YouTube walkthrough, and GitLab submission remain packaging tasks.


### Disruption replanning

In **What-If**, generate a feasible baseline for all three scenarios, then choose a location, inclusive start/end weeks and revised weekly capacity. **Preview disruption** preserves allocations before the start week, prefers valid future allocations and repairs displaced work. Compare changed activities, retained placements and contract completion shifts before **Apply repaired schedule** updates every planning tab. An infeasible or stale preview cannot be applied.

These capacity changes are exploratory overlays, not additions to the official eight-file schema. Scenarios B and C retain their purchased-capacity flexibility; setting nominal supply to zero does not close the track. CSV rechecks use the active overlays, and exports offer supplementary `PLANNING_OPTIONS.json` to record them. New instance uploads reset overlays. Input edits and full planner reruns invalidate/rebuild the schedule; only disruption preview preserves the baseline history. Clear overlays using the shared planning summary.

Run `npm --prefix backend run planning:benchmark` for deterministic dependency, congestion and mixed-work comparisons across A/B/C. An optional output path records the JSON report. Results report local feasibility, objective, changed allocations, history preservation and median runtime for repaired and fresh schedules. Repair does not guarantee minimum churn or a better score than a fresh solve.

## Architecture

```text
React + Vite frontend
        |
        | /api proxy
        v
Express backend (Node.js)
        |
        v
SQLite local database
```

- Frontend: React 19, TypeScript, Vite, React Router, TanStack Query, Recharts, Tailwind CSS
- Backend: Express, TypeScript, built-in Node.js SQLite (`node:sqlite`)
- Database: generated locally in `backend/capo.db` and seeded automatically on first run

## Requirements

- Node.js 24+
- npm

## Setup

Install dependencies for both apps:

```bash
npm install
cd backend && npm install && cd ..
```

Start frontend and backend together:

```bash
npm run dev:all
```

Open:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001/api`

If port `3001` is already in use, stop the old backend process and run `npm run dev:all` again.

## Scripts

Root project:

```bash
npm run dev       # start Vite frontend only
npm run dev:all   # start backend + frontend together
npm run build     # type-check and build frontend
npm run lint      # run oxlint
npm run preview   # preview frontend build
```

Backend:

```bash
cd backend
npm run dev       # start backend in watch mode
npm run build     # compile backend TypeScript
npm start         # run compiled backend
```

## Database

Cascade uses a local SQLite database file under `backend/`. Runtime database files are intentionally ignored by git:

```text
backend/*.db*
```

A fresh database is created and seeded automatically from `backend/src/db/seed.ts` when the backend starts and no requests exist.

## Main API areas

- `GET /api/requests` — list maintenance requests
- `POST /api/requests` — create a request
- `POST /api/optimise` — run scheduling optimisation
- `GET /api/schedule` — retrieve the current schedule
- `POST /api/what-if` — simulate added resources or time
- `GET /api/crews` — list crews
- `GET /api/equipment` — list equipment
- `GET /api/sectors` — list sectors

## Notes

This is a hackathon/MVP prototype. It is designed for local demonstration rather than production deployment.
