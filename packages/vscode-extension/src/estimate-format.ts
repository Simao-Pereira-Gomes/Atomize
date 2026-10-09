import { formatEstimateValue } from '@sppg2001/atomize-core/templates/schema';

export { formatEstimateValue };

/** An estimate with its platform unit when one is known; overridden target fields have none. */
export function withUnit(value: number, unit: string | undefined): string {
	const formatted = formatEstimateValue(value);
	return unit ? `${formatted} ${unit}` : formatted;
}

/** A blank Task Estimate is unknown, never zero. */
export function fmtEstimate(value: number | undefined, unit: string | undefined): string {
	return value === undefined ? 'unestimated' : withUnit(value, unit);
}
