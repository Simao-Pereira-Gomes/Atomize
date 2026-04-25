export const AtomizeErrorCode = {
  AtomizeError: "AtomizeError",
  TemplateLoadError: "TemplateLoadError",
  TemplateValidationError: "TemplateValidationError",
  PlatformError: "PlatformError",
  ConfigurationError: "ConfigurationError",
  UnknownError: "UnknownError",
  TemplateGenerationError: "TemplateGenerationError",
  CancellationError: "CancellationError",
  TemplateCreationError: "TemplateCreationError",
  AuthError: "AuthError",
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
  constructor(
    message: string,
    public readonly errors: readonly string[],
    public readonly suggestions?: readonly string[]
  ) {
    super(AtomizeErrorCode.TemplateValidationError, message);
  }
}

export class TemplateGenerationError extends AtomizeError {
  constructor(message: string) {
    super(AtomizeErrorCode.TemplateGenerationError, message);
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

export class TemplateCreationError extends AtomizeError {
  constructor(message: string) {
    super(AtomizeErrorCode.TemplateCreationError, message);
  }
}

export class CancellationError extends AtomizeError {
  constructor(message: string) {
    super(AtomizeErrorCode.CancellationError, message);
  }
}

export class AuthError extends AtomizeError {
  constructor(message: string) {
    super(AtomizeErrorCode.AuthError, message);
  }
}

export class LLMGenerationError extends Error {
  constructor(
    message: string,
    public readonly rawOutput: string,
    public readonly validationErrors: string[],
  ) {
    super(message);
    this.name = "LLMGenerationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when circular dependencies are detected
 */
export class CircularDependencyError extends Error {
  constructor(
    message: string,
    public readonly cycle: string[],
    public readonly suggestion?: string
  ) {
    super(message);
    this.name = "CircularDependencyError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
