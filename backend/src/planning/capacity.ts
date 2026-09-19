import type { CapacityChange, Instance, PlanningOptions } from "./types";

export function validateCapacityChanges(instance: Instance, changes: CapacityChange[] = []): void {
  if (changes.length > 100) throw new Error("At most 100 capacity changes are supported.");
  for (const [index, change] of changes.entries()) {
    if (!instance.supplies.some(s => s.location_id === change.location_id)) throw new Error(`Unknown disruption location ${change.location_id}`);
    if (!Number.isInteger(change.from_week) || !Number.isInteger(change.to_week) || change.from_week < 1 || change.to_week < change.from_week || change.to_week > instance.horizon_weeks) throw new Error("Capacity-change weeks must form an inclusive range within the declared horizon.");
    if (!Number.isInteger(change.supply_capacity) || change.supply_capacity < 0 || change.supply_capacity > 1000) throw new Error("Capacity must be an integer from 0 to 1000.");
    if (changes.slice(0, index).some(other => other.location_id === change.location_id && other.from_week <= change.to_week && change.from_week <= other.to_week)) throw new Error("Capacity changes for the same location must not overlap.");
  }
}
export function capacityAt(instance: Instance, location: string, week: number, options: PlanningOptions = {}): number {
  const change = options.capacityChanges?.find(c => c.location_id === location && week >= c.from_week && week <= c.to_week);
  return change?.supply_capacity ?? instance.supplies.find(s => s.location_id === location)!.supply_capacity;
}
