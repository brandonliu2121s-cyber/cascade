import { describe, expect, it } from "vitest";
import { runBenchmark } from "./benchmark";

describe("replanning benchmark", () => {
  it("measures nine feasible baselines and genuinely disruptive identical-overlay comparisons without losing seeded history", () => {
    const report = runBenchmark(1);
    expect(report.rows).toHaveLength(9);
    for (const row of report.rows) {
      expect(row.unchangedBaseline.feasible).toBe(true);
      expect(row.unchangedBaseline.changedActivities).toBe(0);
      expect(row.directlyAffectedActivities.length).toBeGreaterThan(0);
      if (row.scenario === "A") expect(row.seededRepair.changedActivities).toBeGreaterThan(0);
      expect(row.seededRepair.frozenPlacements).toBeGreaterThan(0);
      expect(row.seededRepair.allFrozenPreserved).toBe(true);
      expect(row.freshSolve.frozenPlacements).toBe(row.seededRepair.frozenPlacements);
      expect(row.seededRepair.sampleCount).toBe(1);
      expect(row.freshSolve.runtimeMillis).toBeGreaterThanOrEqual(0);
    }
  });
});
