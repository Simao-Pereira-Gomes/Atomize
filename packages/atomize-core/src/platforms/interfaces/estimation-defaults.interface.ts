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
  /** Writable numeric fields that hold rankings or values, never effort, so they are not offered as estimate targets. */
  readonly nonEstimateFields?: readonly string[];
}

export interface EstimationDefaultsProvider {
  getEstimationDefaults(): EstimationDefaults;
}
