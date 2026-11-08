import type { AuthError } from '@sppg2001/atomize-core/utils/errors';

/** What to show when Azure DevOps refuses a Connection Profile's token: the reason, without the "Authentication failed" prefix. */
export function authFailureDetail(error: AuthError): string {
	return error.message.replace(/^authentication failed[:\s]*/i, '').trim() || 'Personal access token may be expired or revoked.';
}
