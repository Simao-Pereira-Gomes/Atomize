export const ExitCode = {
  Success: 0,
  Failure: 1,
  NoMatch: 2,
  AuthFailure: 3,
  /** The run was cancelled (Ctrl+C) or timed out before it finished. */
  Stopped: 4,
} as const;

export class ExitError {
  constructor(readonly code: number) {}
}
