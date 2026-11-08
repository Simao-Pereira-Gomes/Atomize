import { describe, expect, it } from 'bun:test';
import { AuthError } from '@sppg2001/atomize-core/utils/errors';
import { authFailureDetail } from '../profiles/auth-failure.js';

describe('authFailureDetail', () => {
	it('drops the "Authentication failed" prefix', () => {
		expect(authFailureDetail(new AuthError('Authentication failed: the token has expired'))).toBe('the token has expired');
	});

	it('falls back to a likely cause when there is no reason', () => {
		expect(authFailureDetail(new AuthError('Authentication failed'))).toBe('Personal access token may be expired or revoked.');
	});
});
