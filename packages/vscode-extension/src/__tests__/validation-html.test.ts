import { describe, expect, it } from 'bun:test';
import { renderValidationHtml } from '../validation-html.js';

describe('renderValidationHtml', () => {
	it('renders invalid CLI validation results as a failed report', () => {
		const html = renderValidationHtml({
			valid: false,
			errors: [{
				path: 'filter',
				message: 'Unrecognized key: "test"',
				code: 'unrecognized_keys',
			}],
			warnings: [],
			mode: 'lenient',
		}, 'examples/advanced-filtering.atomize.yaml');

		expect(html).toContain('Validation Failed');
		expect(html).toContain('Unrecognized key: ');
		expect(html).toContain('>test</code>');
		expect(html).toContain('filter');
		expect(html).toContain('bg-fail');
	});
});
