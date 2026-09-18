import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { INPUT_FILES, parseInstance } from "./instance";
import { solve } from "./solve";
import type { Scenario } from "./types";

const inputDirectory = resolve(process.argv[2] || "data/ps1");
const outputDirectory = resolve(process.argv[3] || "../submission/ps1");
try {
  const files = Object.fromEntries(INPUT_FILES.map((name) => [name, readFileSync(resolve(inputDirectory, name), "utf8")]));
  const instance = parseInstance(files);
  for (const scenario of ["A", "B", "C"] as Scenario[]) {
    const solution = solve(instance, scenario); const destination = resolve(outputDirectory, scenario);
    mkdirSync(destination, { recursive: true });
    for (const [name, content] of Object.entries(solution.csv)) writeFileSync(resolve(destination, name), content, "utf8");
    writeFileSync(resolve(destination, "LOCAL_REPORT.json"), JSON.stringify(solution.report, null, 2) + "\n");
    console.log(`Scenario ${scenario}: ${solution.report.feasible ? "local checks passed" : "hard violations"}, ${solution.report.detail.completed_activities}/${solution.report.detail.total_activities} activities, ${solution.report.detail.workload_delivered}/${solution.report.detail.workload_required} units, penalty=${solution.report.soft_scores.objective_score}, overrun=${solution.report.soft_scores.overrun_days_total} days, ECLO=${solution.report.soft_scores.eclo_nights_total}, extra=${solution.report.soft_scores.excess_access_nights_total}`);
    if (!solution.report.feasible) process.exitCode = 1;
  }
  console.log(`CSV files saved to ${outputDirectory}. These local reports are not official validator results.`);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
