import { parseCsv } from "./csv";
import { dateValue } from "./instance";
import type { Occupancy, Placement, Result, Scenario } from "./types";

export function readSubmission(submission: Record<string, string>): { access: Placement[]; occupancy: Occupancy[]; results: Result[] } {
  const rows = (name: string, headers: string[]) => {
    if (typeof submission[name] !== "string") throw new Error(`Missing submission file ${name}`);
    const csv = submission[name];
    if (csv.replace(/^\uFEFF/, "").split(/\r?\n/)[0] !== headers.join(",")) throw new Error(`${name}: expected header ${headers.join(",")}`);
    return parseCsv(csv);
  };
  const number = (value: string) => { if (!/^\d+$/.test(value)) throw new Error(`Invalid submission number: ${value}`); return Number(value); };
  return {
    access: rows("SCHEDULE_ACCESS.csv", ["activity_id", "access_seq", "week", "eclo", "access_night"]).map(r => ({ activity_id: r.activity_id, access_seq: number(r.access_seq), week: number(r.week), eclo: number(r.eclo) as 0 | 1, access_night: number(r.access_night) })),
    occupancy: rows("SCHEDULE_OCCUPANCY.csv", ["activity_id", "week", "location_id", "co_share_group"]).map(r => ({ activity_id: r.activity_id, week: number(r.week), location_id: r.location_id, co_share_group: r.co_share_group })),
    results: rows("RESULTS.csv", ["scenario", "contract_number", "simulated_completion_date", "overrun_days"]).map(r => ({ scenario: r.scenario as Scenario, contract_number: r.contract_number, simulated_completion_date: dateValue(r.simulated_completion_date), overrun_days: number(r.overrun_days) })),
  };
}
