export const AtomizeErrorCode = {
  AtomizeError: "AtomizeError",
  TemplateLoadError: "TemplateLoadError",
  TemplateValidationError: "TemplateValidationError",
  PlatformError: "PlatformError",
  ConfigurationError: "ConfigurationError",
  UnknownError: "UnknownError",
} as const;

export type AtomizeErrorCode =
  (typeof AtomizeErrorCode)[keyof typeof AtomizeErrorCode];

export abstract class AtomizeError extends Error {
  public readonly code: AtomizeErrorCode;

  protected constructor(code: AtomizeErrorCode, message: string) {
    super(message);

    this.code = code;
    this.name = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TemplateLoadError extends AtomizeError {
  constructor(message: string, public readonly filePath: string) {
    super(AtomizeErrorCode.TemplateLoadError, message);
  }
}

export class TemplateValidationError extends AtomizeError {
  constructor(message: string, public readonly errors: readonly string[]) {
    super(AtomizeErrorCode.TemplateValidationError, message);
  }
}

export class PlatformError extends AtomizeError {
  constructor(message: string, public readonly platform: string) {
    super(AtomizeErrorCode.PlatformError, message);
  }
}

export class ConfigurationError extends AtomizeError {
  constructor(message: string) {
    super(AtomizeErrorCode.ConfigurationError, message);
  }
}

export class UnknownError extends AtomizeError {
  constructor(message: string) {
    super(AtomizeErrorCode.UnknownError, message);
  }
}
