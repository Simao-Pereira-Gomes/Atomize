import { describe, expect, it } from 'bun:test';
import { fmtEstimate, formatEstimateValue, withUnit } from '../estimate-format.js';

describe('formatEstimateValue', () => {
	it('hides floating-point noise from summed estimates', () => {
		expect(formatEstimateValue(1.2 + 1.2 + 1.2 + 1.2 + 1.2)).toBe('6');
		expect(formatEstimateValue(13.000000000000002)).toBe('13');
	});

	it('rounds to two decimals', () => {
		expect(formatEstimateValue(2.3333333)).toBe('2.33');
		expect(formatEstimateValue(2.346)).toBe('2.35');
	});

	it('keeps values that already have two decimals or fewer as they are', () => {
		expect(formatEstimateValue(1.3)).toBe('1.3');
		expect(formatEstimateValue(0.25)).toBe('0.25');
		expect(formatEstimateValue(8)).toBe('8');
	});
});

describe('withUnit / fmtEstimate', () => {
	it('appends the unit to the rounded value', () => {
		expect(withUnit(5.999999999999999, 'hours')).toBe('6 hours');
		expect(withUnit(5.999999999999999, undefined)).toBe('6');
	});

	it('shows a blank estimate as unestimated, never zero', () => {
		expect(fmtEstimate(undefined, 'hours')).toBe('unestimated');
		expect(fmtEstimate(1.3333, 'hours')).toBe('1.33 hours');
	});
});
