<img width="1213" height="492" alt="image" src="https://github.com/user-attachments/assets/0007c164-cf49-44af-99b6-26e7c181f50c" />

Cascade is a rail maintenance scheduling optimisation prototype built around the CAPO framework:

- **Capture** maintenance demand and available resources
- **Assess** time, space, resource, and safety constraints
- **Prioritise** work by urgency, trust, and operational value
- **Optimise** the nightly schedule against limited engineering hours and manpower

The app helps a duty manager turn competing maintenance requests into a conflict-aware nightly plan, understand why work was moved or deferred, and test whether adding resources would improve output.

## Features

### PS1 possession planner

After sign-in, open **PS1 Planner** (`/app/ps1`). Load the bundled official public dataset or upload all eight CSV instance files, then run Scenarios A, B, and C. The planner shows full workload accounting, per-contract completion, a weekly activity timeline, possession groups, explanations, and local feasibility diagnostics. Recheck the exported CSVs and download each scenario's three files into its own folder.

- Official topology, EB/WB bounds, tunnel/platform span expansion, nature-specific buffers, Live opposite-bound and interchange coupling.
- Contract/type weekly access accounting, workfront caps, strict predecessor weeks, planned starts, PM/PC/C possession groups, and co-sharing.
- A forbids excess capacity and ECLO; B holds planned dates and prices extra capacity/ECLO; C permits one excess possession per location-week and a continuous two-week ECLO window per affected line.
- Multiple deterministic heuristic passes select the best locally feasible result found. No global optimum or feasibility on every hidden instance is promised. A failed B search retains scheduled workloads and reports deadline violations rather than claiming the instance is mathematically impossible.
- The published supply is flat by location; A/C may extend the nominal horizon using that same supply to finish work, with an explicit warning. Supply CSVs with week-specific quotas are not supported by the published schema.

**Validation limitation:** this repository contains a local checker derived from the brief, not the organiser's validator. The public problem-statement repository does not distribute the validator. The local checker conservatively enforces the statement's "buffers never overlap" requirement; the organiser-declared feasible reference sample includes overlaps under that interpretation. For example, reference week 21 overlaps the buffers of A025 (PC Consist) and A074 (PC Live) at `SEC:ALP:S03_S04:EB`. Their access-night indices are local to different contracts and cannot be interpreted as distinct global nights. Confirm that ambiguity with the organisers, and run all exported CSVs through their validator before submission. Local scores should not be presented as official judging scores.

PS1 uploads are request-isolated and do not overwrite the legacy SQLite nightly demo. Uploaded CSV text is kept in sessionStorage in the uploading browser; results can be recomputed after page navigation. The legacy CAPO demonstration is still available in the other navigation tabs.

Run tests and generate public schedules:

```bash
npm --prefix backend test
npm --prefix backend run build
npm run build
cd backend
npm run ps1:export
# Optional: npm run ps1:export -- path/to/instance path/to/output
```

The CLI generates `submission/ps1/A`, `B`, and `C`, each with `SCHEDULE_ACCESS.csv`, `SCHEDULE_OCCUPANCY.csv`, `RESULTS.csv`, and a clearly labelled `LOCAL_REPORT.json`. The three CSVs are the submission; the JSON is supplementary local evidence.

To serve the built frontend and API together on a hosting provider with Node.js 24+, build both apps, set `SERVE_FRONTEND=1`, optionally set `PORT`, and run `npm start` inside `backend`. In PowerShell:

```powershell
$env:SERVE_FRONTEND = '1'
$env:PORT = '3001'
npm --prefix backend start
```

The app has not been published to a hosting provider. Hosting, the YouTube walkthrough, and GitLab submission remain packaging tasks.

### Original nightly demonstration

- Maintenance request intake with trust and priority scoring
- Constraint and conflict detection across sectors, crews, equipment, and work compatibility
- Priority-weighted schedule optimisation for overnight engineering windows
- Interactive Gantt-style crew schedule
- Conflict warnings with suggested alternatives
- Resource management for crews, equipment, and sectors
- What-if simulator for extra crews, equipment, or engineering time
- Dashboard KPIs and bottleneck analysis

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
