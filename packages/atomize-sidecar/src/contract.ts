/**
 * The sidecar's wire contract (ADR-0042): every method's params and result, and the
 * notifications it sends. The sidecar's handlers are typed against it, and Atomize Studio
 * imports it type-only, so a change on one side shows up as a type error on the other.
 *
 * Params are what the sidecar receives from the Rust relay. Studio's own calls go to Rust
 * commands that inject credentials (a Connection Profile name becomes a connection), so
 * Studio uses the results and notifications, not the params.
 *
 * Params arrive as parsed JSON, so each method's params are a zod schema that the sidecar parses
 * every request with; the params types are inferred from those schemas, so they can't drift apart.
 */

import type { AtomizationReport, ProgressEvent } from "@sppg2001/atomize-core/core/atomizer";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import type { DocumentGrounding } from "@sppg2001/atomize-core/services/template/reference-documents";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import type { InspectResult, PreviewResult } from "@sppg2001/atomize-core/templates/template-inspector";
import type { TemplateCatalogItem } from "@sppg2001/atomize-core/templates/template-library";
import type { TemplateVerificationResult } from "@sppg2001/atomize-core/templates/template-verification";
import { z } from "zod";

export type { DocumentGrounding, ProjectGrounding, TemplateVerificationResult };

/** A required string that isn't blank; the value is passed on as sent. */
const nonBlank = z.string().refine((value) => value.trim().length > 0);
/** An optional field; the Rust relay sends `null` for an unset value, which becomes `undefined`. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => value ?? undefined, schema.optional());
/** An optional flag that is `false` unless sent as `true`. */
const flag = z.boolean().nullish().transform((value) => value ?? false);
const record = z.record(z.string(), z.unknown());

/** A Connection Profile's connection, with the token Rust injected; never sent back. */
const groundingConnection = z.strictObject({ organizationUrl: nonBlank, project: nonBlank, team: nonBlank, token: nonBlank });
export type GroundingConnection = z.infer<typeof groundingConnection>;

/** Which Stories a `generate.run` call processes (CONTEXT.md, "Generate Scope"). */
/** `resume` finishes each Story as a Partly Created Story: only its missing Tasks are created. */
const generateScope = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("stories"), storyIds: z.array(z.string()).min(1), resume: optional(z.boolean()) }),
  z.strictObject({ kind: z.literal("filter") }),
]);
export type GenerateScope = z.infer<typeof generateScope>;

/** A method that takes no params: the relay sends `{}`. */
const noParams = z.strictObject({}).optional();

const catalogRemoveParams = z.strictObject({ kind: z.enum(["template", "mixin"]), name: nonBlank });
const catalogInstallParams = z.strictObject({
  content: nonBlank,
  name: nonBlank,
  scope: z.enum(["user", "project"]),
  overwrite: flag,
  workspaceRoot: optional(z.string()),
});
const onlineValidationParams = z.strictObject({
  // Checked only as an object: a Template may still be invalid, which verification reports (ADR-0048).
  template: z.custom<TaskTemplate>((value) => typeof value === "object" && value !== null && !Array.isArray(value)),
  connection: groundingConnection,
});
// Grounding is the sidecar's own output, sent back unchanged, so it isn't checked again.
const aiDraftParams = z.strictObject({ draftId: nonBlank, prose: nonBlank, grounding: z.unknown().nullish(), documentGrounding: z.unknown().nullish() });
const aiImproveParams = z.strictObject({
  draftId: nonBlank,
  template: record,
  guidance: z.string().nullish(),
  grounding: z.unknown().nullish(),
  documentGrounding: z.unknown().nullish(),
});
const referencesListParams = z.strictObject({ startPath: nonBlank });
const referencesSaveParams = z.strictObject({ workspaceRoot: nonBlank, entry: nonBlank });
const referencesLoadParams = z.strictObject({ workspaceRoot: nonBlank, entries: z.array(z.string()), connection: optional(groundingConnection) });
const wikiListParams = z.strictObject({ connection: groundingConnection });
const wikiPagesParams = z.strictObject({ connection: groundingConnection, wiki: nonBlank });
/** `withTasks` keeps Stories that already have Tasks (ignoring excludeIfHasTasks), to pick Partly Created Stories to finish. */
const generateQueryStoriesParams = z.strictObject({ source: nonBlank, connection: groundingConnection, withTasks: optional(z.boolean()) });
const generateRunParams = z.strictObject({
  runId: nonBlank,
  source: nonBlank,
  connection: groundingConnection,
  dryRun: z.boolean(),
  scope: generateScope,
  continueOnError: flag,
});

/**
 * Each method's params schema, and the one message Studio shows when params don't match it.
 * A mismatch is a Studio or relay bug, not user input, so the message names everything the method needs.
 */
export const SIDECAR_PARAMS = {
  "catalog.list": { schema: noParams, message: "Listing the Catalog takes no params." },
  "catalog.remove": { schema: catalogRemoveParams, message: "Removing a Catalog item requires its kind and name." },
  "catalog.install": { schema: catalogInstallParams, message: "Installing a Catalog item requires its content, name, and scope." },
  "grounding.fetch": { schema: groundingConnection, message: "Grounding requires a resolved connection." },
  "references.list": { schema: referencesListParams, message: "Listing Reference Documents requires a project folder." },
  "references.save": { schema: referencesSaveParams, message: "Saving a Reference Document requires a project folder and an entry." },
  "references.load": { schema: referencesLoadParams, message: "Loading Reference Documents requires a project folder and a list of entries." },
  "wiki.list": { schema: wikiListParams, message: "Listing wikis requires a resolved connection." },
  "wiki.pages": { schema: wikiPagesParams, message: "Listing wiki pages requires a wiki and a resolved connection." },
  "validation.online": { schema: onlineValidationParams, message: "Online Validation requires a Template and resolved connection." },
  "ai.generate": { schema: aiDraftParams, message: "AI drafting requires a draft id and description." },
  "ai.improve": { schema: aiImproveParams, message: "Improving with AI requires a request id and the Template; any guidance must be text." },
  "ai.cancel": { schema: z.strictObject({ draftId: nonBlank }), message: "AI cancellation requires a draft id." },
  "ai.authStatus": { schema: noParams, message: "Checking Copilot sign-in takes no params." },
  "template.resolveLocal": { schema: z.strictObject({ path: nonBlank }), message: "Resolving a local template requires a file path." },
  "generate.queryStories": { schema: generateQueryStoriesParams, message: "Browsing Stories requires a Template source and a resolved connection." },
  "generate.run": { schema: generateRunParams, message: "Generating requires a run id, Template source, resolved connection, scope, and dryRun flag." },
  "preview.inspect": { schema: z.strictObject({ source: nonBlank }), message: "Inspecting a Template requires its source." },
  "preview.mockStory": { schema: z.strictObject({ source: nonBlank, mockStory: z.string() }), message: "Previewing a Template requires its source and mock Story values." },
} satisfies Record<string, { schema: z.ZodType; message: string }>;

type ParamsOf<M extends keyof typeof SIDECAR_PARAMS> = z.infer<(typeof SIDECAR_PARAMS)[M]["schema"]>;

export type CatalogListItem = TemplateCatalogItem & { content: unknown };
export type CatalogRemoveParams = ParamsOf<"catalog.remove">;
export type CatalogInstallParams = ParamsOf<"catalog.install">;
export type OnlineValidationParams = ParamsOf<"validation.online">;
export type AIDraftParams = ParamsOf<"ai.generate">;
export type AIDraftResult = { template: Record<string, unknown>; errors?: string[] };
export type AIImproveParams = ParamsOf<"ai.improve">;
/** A proposal, Copilot's notes, and what's left to fix or worth a look. */
export type AIImproveResult = { template: Record<string, unknown>; notes: string[]; errors?: string[]; warnings?: string[] };
/** Where Reference Documents are looked up: a Workspace Root, discovered from a folder or file inside it. */
export type ReferencesListParams = ParamsOf<"references.list">;
export type ReferencesListResult = { workspaceRoot: string; entries: string[]; problems: string[] };
export type ReferencesSaveParams = ParamsOf<"references.save">;
/** Reference Documents to load and fit; wiki entries need the Rust-injected connection. */
export type ReferencesLoadParams = ParamsOf<"references.load">;
export type ReferencesLoadResult = { grounding: DocumentGrounding | null; notices: string[]; skipped: { entry: string; message: string }[] };
export type WikiListParams = ParamsOf<"wiki.list">;
export type WikiPagesParams = ParamsOf<"wiki.pages">;
export type GenerateQueryStoriesParams = ParamsOf<"generate.queryStories">;
export type GenerateRunParams = ParamsOf<"generate.run">;

/** Every method the sidecar answers, by its dotted name. */
export interface SidecarMethods {
  "catalog.list": { params: ParamsOf<"catalog.list">; result: CatalogListItem[] };
  "catalog.remove": { params: ParamsOf<"catalog.remove">; result: { removed: true } };
  "catalog.install": { params: ParamsOf<"catalog.install">; result: TemplateCatalogItem };
  "grounding.fetch": { params: ParamsOf<"grounding.fetch">; result: ProjectGrounding };
  "references.list": { params: ParamsOf<"references.list">; result: ReferencesListResult };
  "references.save": { params: ParamsOf<"references.save">; result: { saved: true } };
  "references.load": { params: ParamsOf<"references.load">; result: ReferencesLoadResult };
  "wiki.list": { params: ParamsOf<"wiki.list">; result: { wikis: { id: string; name: string }[] } };
  "wiki.pages": { params: ParamsOf<"wiki.pages">; result: { paths: string[] } };
  "validation.online": { params: ParamsOf<"validation.online">; result: TemplateVerificationResult };
  "ai.generate": { params: ParamsOf<"ai.generate">; result: AIDraftResult };
  "ai.improve": { params: ParamsOf<"ai.improve">; result: AIImproveResult };
  "ai.cancel": { params: ParamsOf<"ai.cancel">; result: { cancelled: boolean } };
  "ai.authStatus": { params: ParamsOf<"ai.authStatus">; result: { authenticated: boolean } };
  /** The Template at a path with its `extends` and Mixins applied (ADR-0048). */
  "template.resolveLocal": { params: ParamsOf<"template.resolveLocal">; result: TaskTemplate };
  "generate.queryStories": { params: ParamsOf<"generate.queryStories">; result: { stories: WorkItem[] } };
  "generate.run": { params: ParamsOf<"generate.run">; result: { report: AtomizationReport } };
  "preview.inspect": { params: ParamsOf<"preview.inspect">; result: InspectResult };
  "preview.mockStory": { params: ParamsOf<"preview.mockStory">; result: PreviewResult };
}

export type SidecarMethod = keyof SidecarMethods;
export type SidecarParams<M extends SidecarMethod> = SidecarMethods[M]["params"];
export type SidecarResult<M extends SidecarMethod> = SidecarMethods[M]["result"];

/** Out-of-band notifications (no request id), by method. */
export interface SidecarNotifications {
  "sidecar.ready": undefined;
  "ai.progress": { draftId: string; length: number };
  "generate.progress": { runId: string; event: ProgressEvent };
}

/**
 * An error response; `code` names the failure so callers branch without reading the message.
 * `tokenRejected` is set when Azure DevOps refused the Connection Profile's token (expired or
 * revoked), so the relay forgets the cached token; no other failure sets it.
 */
export type SidecarError = { code: string; message: string; tokenRejected?: true };
