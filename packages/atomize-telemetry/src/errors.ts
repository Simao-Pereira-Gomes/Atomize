import type { ErrorCategory, Outcome } from "./events";

const CATEGORY_BY_ERROR_NAME: Readonly<Record<string, ErrorCategory>> = {
	AuthError: "auth",
	ConfigurationError: "config",
	PlatformError: "platform",
	TemplateLoadError: "template",
	TemplateValidationError: "template",
	TemplateCompositionError: "template",
	TemplateCreationError: "template",
	CircularDependencyError: "template",
	CopilotAuthenticationError: "ai",
	LLMGenerationError: "ai",
	ProjectGroundingError: "ai",
	ReferenceDocumentError: "reference-docs",
	GenerationTimeoutError: "timeout",
};

export type ErrorClassification = { outcome: Extract<Outcome, "cancelled"> } | { outcome: "failure"; errorCategory: ErrorCategory };

/**
 * Maps an error to how the action ended, from its class name only, never its message, which can
 * carry user content. Class names keep this package free of core and ai dependencies.
 */
export function categorizeError(err: unknown): ErrorClassification {
	const name = err instanceof Error ? err.name : undefined;
	if (name === "CancellationError") return { outcome: "cancelled" };
	return { outcome: "failure", errorCategory: (name && CATEGORY_BY_ERROR_NAME[name]) || "unknown" };
}
