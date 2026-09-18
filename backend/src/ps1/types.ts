export interface PlanningOptions { allowHorizonExtension?: boolean }
export type Scenario = "A" | "B" | "C";
export type Nature = "Live" | "Non-live (Consist)" | "Non-live (Others)";
export type AccessType = "PM" | "PC" | "C";
export interface Contract {
  contract_number: string; contract_description: string; activity_type: string;
  nature_of_activity: Nature; access_type: AccessType; contract_priority: number;
  contract_completion_date: string; planned_completion_date: string;
  number_of_workfronts: number; number_of_maximum_access_per_week: number;
}
export interface Activity {
  activity_id: string; contract_number: string; activity_type: string;
  start_location_id: string; end_location_id: string; total_accesses: number;
  planned_start_date: string; predecessor_activity_id: string | null; activity_priority: number;
}
export interface Instance {
  horizon_start: string; horizon_weeks: number;
  lines: { line_code: string; line_name: string }[];
  stations: { station_id: string; line_code: string; seq: number; is_interchange: boolean }[];
  sectors: { sector_id: string; line_code: string; from_station_id: string; to_station_id: string; seq: number }[];
  supplies: { location_id: string; location_kind: string; line_code: string; bound: string; supply_capacity: number }[];
  buffers: { nature_of_works: Nature; up_to_buffer_sectors: number; opposite_bound_required: boolean }[];
  contracts: Contract[]; activities: Activity[];
}
export interface Footprint { work: string[]; buffer: string[]; closure: string[]; affected_lines: string[] }
export interface Placement { activity_id: string; access_seq: number; week: number; eclo: 0 | 1; access_night: number }
export interface Occupancy { activity_id: string; week: number; location_id: string; co_share_group: string }
export interface Result { scenario: Scenario; contract_number: string; simulated_completion_date: string; overrun_days: number }
export interface Violation { rule: string; severity: "hard"; detail: string }
export interface Report {
  scenario: Scenario; feasible: boolean; checker: string; hard_violations: Violation[];
  soft_scores: { overrun_days_total: number; contracts_overrunning: number; earliness_days_total: number; excess_access_nights_total: number; eclo_nights_total: number; priority_overrun: Record<string, number>; priority_weighted_score: number; objective_score: number | null; formula_version: string };
  detail: { capacity_hotspots: { location_id: string; week: number; used: number; capacity: number }[]; nights_scheduled: number; completed_activities: number; total_activities: number; workload_required: number; workload_delivered: number; horizon_weeks_used: number; eclo_windows: Record<string, number[]> };
}
export interface Solution {
  scenario: Scenario; access: Placement[]; occupancy: Occupancy[]; results: Result[]; report: Report;
  csv: Record<string, string>; explanations: { activity_id: string; detail: string }[];
  warnings: string[];
}
