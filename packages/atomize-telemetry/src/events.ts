import { z } from "zod";

/**
 * The telemetry event schema. The rule for every field: an enum, a boolean, a bounded
 * non-negative number, or a string pinned to a strict pattern. Never a free-form string, so no
 * work-item content, identifier, or template name can ever ride along.
 */

export const SURFACES = ["cli", "studio", "vscode"] as const;
export type Surface = (typeof SURFACES)[number];

/** The closed, surface-neutral list of what a user asked Atomize to do. */
export const TELEMETRY_ACTIONS = [
	"generate",
	"generate.resume",
	"preview",
	"validate",
	"template.create",
	"template.improve",
	"template.improve.review",
	"catalog.list",
	"catalog.install",
	"catalog.remove",
	"template.resolve",
	"template.migrate",
	"template.metadata",
	"auth.add",
	"auth.remove",
	"auth.rotate",
	"auth.test",
	"auth.use",
	"auth.list",
	"fields.list",
	"queries.list",
	"schemaReference.open",
	"telemetry.status",
] as const;
export type TelemetryAction = (typeof TELEMETRY_ACTIONS)[number];

export const OUTCOMES = ["success", "failure", "cancelled"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const ERROR_CATEGORIES = [
	"auth",
	"config",
	"platform",
	"template",
	"ai",
	"reference-docs",
	"timeout",
	"unknown",
] as const;
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

const count = z.number().int().min(0).max(1_000_000);
const durationMs = z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000);

const VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,32}$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const anonymousIdSchema = z.string().regex(UUID_V4_PATTERN);

const envelopeShape = {
	surface: z.enum(SURFACES),
	atomizeVersion: z.string().regex(VERSION_PATTERN),
	runtimeVersion: z.string().regex(VERSION_PATTERN),
	os: z.enum(["darwin", "linux", "win32", "other"]),
	anonymousId: anonymousIdSchema,
	timestamp: z.iso.datetime(),
};

const commandBase = {
	event: z.literal("command_finished"),
	outcome: z.enum(OUTCOMES),
	errorCategory: z.enum(ERROR_CATEGORIES).optional(),
	durationMs,
};

const generateProps = {
	mode: z.enum(["dry-run", "execute"]),
	output: z.enum(["human", "json", "json-stream"]),
	continueOnError: z.boolean(),
	storyCount: count,
	taskCount: count,
	failedStoryCount: count,
};

const referenceProps = { grounded: z.boolean(), referenceDocCount: count };

function command<A extends TelemetryAction, P extends z.ZodRawShape>(action: A, props: P) {
	return z.object({ ...envelopeShape, ...commandBase, action: z.literal(action), ...props });
}

const scope = { scope: z.enum(["user", "project"]) };

/** Every `command_finished` variant: the action decides which props it carries. */
export const commandFinishedSchema = z.discriminatedUnion("action", [
	command("generate", generateProps),
	command("generate.resume", generateProps),
	command("preview", { variant: z.enum(["render", "inspect", "mock-story", "live", "resolved"]) }),
	command("validate", { mode: z.enum(["offline", "online"]), valid: z.boolean(), issueCount: count }),
	command("template.create", { mode: z.enum(["scratch", "from-existing", "ai"]), ...referenceProps }),
	command("template.improve", referenceProps),
	command("template.improve.review", { decision: z.enum(["accepted", "saved-as-new", "rejected"]) }),
	command("catalog.list", {}),
	command("catalog.install", scope),
	command("catalog.remove", scope),
	command("template.resolve", {}),
	command("template.migrate", {}),
	command("template.metadata", {}),
	command("auth.add", {}),
	command("auth.remove", {}),
	command("auth.rotate", {}),
	command("auth.test", {}),
	command("auth.use", {}),
	command("auth.list", {}),
	command("fields.list", {}),
	command("queries.list", {}),
	command("schemaReference.open", {}),
	command("telemetry.status", {}),
]);

export const sessionStartedSchema = z.object({ ...envelopeShape, event: z.literal("session_started") });

export const telemetryEnabledSchema = z.object({
	...envelopeShape,
	event: z.literal("telemetry_enabled"),
	source: z.enum(["command", "vscode-notification", "studio"]),
});

export const telemetryDeletionRequestedSchema = z.object({
	...envelopeShape,
	event: z.literal("telemetry_deletion_requested"),
});

/** Every event telemetry can send; anything that does not parse against it is dropped. */
export const telemetryEventSchema = z.union([
	commandFinishedSchema,
	sessionStartedSchema,
	telemetryEnabledSchema,
	telemetryDeletionRequestedSchema,
]);

export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

type EnvelopeKey = keyof typeof envelopeShape;

/** What a surface hands to `track`: the event without the envelope the client fills in. */
export type TelemetryEventInput = TelemetryEvent extends infer E
	? E extends TelemetryEvent
		? Omit<E, EnvelopeKey>
		: never
	: never;
