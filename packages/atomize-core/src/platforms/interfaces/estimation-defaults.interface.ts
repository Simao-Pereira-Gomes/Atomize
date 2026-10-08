/**
 * A platform's default Estimation Field Mapping (ADR 0064). Field names are the
 * platform's own reference names; core never names them itself.
 */
export interface EstimationDefaults {
  /** Ordered Story fields; the first with a value supplies the Story Estimate. */
  readonly storyEstimateFields: readonly string[];
  /** Work Item type generated Tasks are created as. */
  readonly taskWorkItemType: string;
  /** Task fields that receive the Task Estimate. */
  readonly taskEstimateFields: readonly string[];
  /** Unit of the default Task estimate fields, for display. */
  readonly unitLabel?: string;
  /** Fields that never hold effort (rankings, priorities, metadata), so they are offered neither as Story Estimate sources nor as Task estimate targets. Entries ending in ".*" match a whole namespace. */
  readonly nonEstimateFields?: readonly string[];
}

export interface EstimationDefaultsProvider {
  getEstimationDefaults(): EstimationDefaults;
}
