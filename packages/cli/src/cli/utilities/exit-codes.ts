export const ExitCode = {
  Success: 0,
  Failure: 1,
  NoMatch: 2,
  AuthFailure: 3,
} as const;

export class ExitError {
  constructor(readonly code: number) {}
}
