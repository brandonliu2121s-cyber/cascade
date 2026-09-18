# PS1 correctness and scheduling improvements

Goal: implement the agreed correctness, horizon and difficult-instance work before deployment.

Architecture: keep the existing solver, independent checker and CSV schemas. Enforce the declared horizon by default; explicit flat-supply extension is an assumption rather than official validation. Improve deterministic scheduling only where regressions demonstrate a missed feasible or cheaper solution.

Constraints: no deployment, no safety exemptions inferred solely from the sample, no new dependencies, preserve user's checkout and uncommitted files. Work from updated remote main f5baebaa in an isolated clone. Official validator is unavailable; report that limitation.

## Tasks

- [ ] Establish fresh baseline tests and builds using the cloned main.
- [ ] Horizon: write failing tests for accesses past horizon, strict solver truncation with workload diagnostics, explicit extension and API solve/recheck consistency. Add optional PlanningOptions to solver/checker, strict default, matching API/UI/CLI choices; adjust tests that intentionally extend.
- [ ] Safety investigation: compare precise closure collisions in the official sample with brief rules, report evidence and any demonstrable checker bugs. Add targeted tests before correcting proven defects.
- [ ] Scheduling: build regressions for chain starvation and avoidable B ECLO/excess cost; improve activity ordering and search deterministically, retain only feasible lower-cost candidates. Test cross-contract predecessor and Live/ECLO congestion.
- [ ] Verify: run all backend tests, backend and frontend builds, lint, public CSV generation and exported CSV rechecks; compare A/B/C scores and workloads with baseline.
- [ ] Deliver: review diff, generate updated test report and patch, install checked changes into a branch based on updated main in user's project without touching their old main or caches. Do not push unless requested.

Execution: implement in this session with bounded independent agents and review their diffs before integration.
