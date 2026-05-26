import { describe, expect, it } from 'bun:test';
import { parseValidationOutput } from '../validation-output.js';

describe('parseValidationOutput', () => {
	it('parses JSON validation output prefixed by spinner control bytes', () => {
		const result = parseValidationOutput(
			'\u001b[?25l\u001b[90m│\u001b[39m\n\u001b[32m◇\u001b[39m  Project reference validation failed\n\u001b[?25h{"valid":true,"errors":[],"warnings":[{"path":"template","message":"Could not validate project references against ADO"}],"mode":"lenient"}',
		);

		expect(result?.valid).toBe(true);
		expect(result?.warnings[0]?.path).toBe('template');
	});

	it('returns undefined when no JSON object is present', () => {
		expect(parseValidationOutput('Project reference validation failed')).toBeUndefined();
	});
});
