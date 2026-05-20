export const ExitCode = {
  Success: 0,
  Failure: 1,
  NoMatch: 2,
} as const;

export class ExitError {
  constructor(readonly code: number) {}
}
