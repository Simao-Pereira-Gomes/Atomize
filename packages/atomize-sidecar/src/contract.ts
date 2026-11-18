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
/** An optional field that may also arrive as `null`, which the Rust relay sends for an unset value; both become `undefined`. */
const optionalOrNull = <T extends z.ZodType>(schema: T) => z.preprocess((value) => value ?? undefined, schema.optional());
/** An optional flag that is `false` unless sent as `true`. */
const flag = z.boolean().nullish().transform((value) => value ?? false);
/** Any JSON object, whatever its fields. */
const jsonObject = z.record(z.string(), z.unknown());

/** A Connection Profile's connection, with the token Rust injected; never sent back. */
const groundingConnection = z.strictObject({ organizationUrl: nonBlank, project: nonBlank, team: nonBlank, token: nonBlank });
export type GroundingConnection = z.infer<typeof groundingConnection>;

/** Which Stories a `generate.run` call processes (CONTEXT.md, "Generate Scope"). */
/** `resume` finishes each Story as a Partly Created Story: only its missing Tasks are created. */
const generateScope = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("stories"), storyIds: z.array(z.string()).min(1), resume: optionalOrNull(z.boolean()) }),
  z.strictObject({ kind: z.literal("filter") }),
]);
export type GenerateScope = z.infer<typeof generateScope>;

/** A method that takes no params: the relay sends `{}`. */
const noParams = z.strictObject({}).optional();

const catalogRemoveParams = z.strictObject({ kind: z.enum(["template", "mixin"]), name: nonBlank });
/** A project install also needs a usable Workspace Root, checked by the handler, which answers `PROJECT_WORKSPACE_REQUIRED`. */
const catalogInstallParams = z.strictObject({
  content: nonBlank,
  name: nonBlank,
  scope: z.enum(["user", "project"]),
  overwrite: flag,
  workspaceRoot: optionalOrNull(z.string()),
});
const onlineValidationParams = z.strictObject({
  // Checked only as an object: reporting what's wrong with a Template is Online Validation's job.
  template: z.custom<TaskTemplate>((value) => typeof value === "object" && value !== null && !Array.isArray(value)),
  connection: groundingConnection,
});
/** The grounding an AI request carries. It is the sidecar's own output, sent back unchanged, so it isn't checked again. */
const aiGrounding = { grounding: optionalOrNull(z.unknown()), documentGrounding: optionalOrNull(z.unknown()) };
const aiDraftParams = z.strictObject({ draftId: nonBlank, prose: nonBlank, ...aiGrounding });
const aiImproveParams = z.strictObject({ draftId: nonBlank, template: jsonObject, guidance: optionalOrNull(z.string()), ...aiGrounding });
const aiCancelParams = z.strictObject({ draftId: nonBlank });
const referencesListParams = z.strictObject({ startPath: nonBlank });
const referencesSaveParams = z.strictObject({ workspaceRoot: nonBlank, entry: nonBlank });
const referencesLoadParams = z.strictObject({ workspaceRoot: nonBlank, entries: z.array(z.string()), connection: optionalOrNull(groundingConnection) });
const wikiListParams = z.strictObject({ connection: groundingConnection });
const wikiPagesParams = z.strictObject({ connection: groundingConnection, wiki: nonBlank });
const resolveLocalParams = z.strictObject({ path: nonBlank });
/** `withTasks` keeps Stories that already have Tasks (ignoring excludeIfHasTasks), to pick Partly Created Stories to finish. */
const generateQueryStoriesParams = z.strictObject({ source: nonBlank, connection: groundingConnection, withTasks: optionalOrNull(z.boolean()) });
const generateRunParams = z.strictObject({
  runId: nonBlank,
  source: nonBlank,
  connection: groundingConnection,
  dryRun: z.boolean(),
  scope: generateScope,
  continueOnError: flag,
});
const previewInspectParams = z.strictObject({ source: nonBlank });
const previewMockStoryParams = z.strictObject({ source: nonBlank, mockStory: z.string() });

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
  "ai.cancel": { schema: aiCancelParams, message: "AI cancellation requires a draft id." },
  "ai.authStatus": { schema: noParams, message: "Checking Copilot sign-in takes no params." },
  "template.resolveLocal": { schema: resolveLocalParams, message: "Resolving a local template requires a file path." },
  "generate.queryStories": { schema: generateQueryStoriesParams, message: "Browsing Stories requires a Template source and a resolved connection." },
  "generate.run": { schema: generateRunParams, message: "Generating requires a run id, Template source, resolved connection, scope, and dryRun flag." },
  "preview.inspect": { schema: previewInspectParams, message: "Inspecting a Template requires its source." },
  "preview.mockStory": { schema: previewMockStoryParams, message: "Previewing a Template requires its source and mock Story values." },
} satisfies { [M in SidecarMethod]: { schema: z.ZodType; message: string } };

export type CatalogListItem = TemplateCatalogItem & { content: unknown };
export type OnlineValidationParams = SidecarParams<"validation.online">;
export type AIDraftParams = SidecarParams<"ai.generate">;
export type AIDraftResult = { template: Record<string, unknown>; errors?: string[] };
export type AIImproveParams = SidecarParams<"ai.improve">;
/** A proposal, Copilot's notes, and what's left to fix or worth a look. */
export type AIImproveResult = { template: Record<string, unknown>; notes: string[]; errors?: string[]; warnings?: string[] };
/** Where Reference Documents are looked up: a Workspace Root, discovered from a folder or file inside it. */
export type ReferencesListParams = SidecarParams<"references.list">;
export type ReferencesListResult = { workspaceRoot: string; entries: string[]; problems: string[] };
export type ReferencesSaveParams = SidecarParams<"references.save">;
/** Reference Documents to load and fit; wiki entries need the Rust-injected connection. */
export type ReferencesLoadParams = SidecarParams<"references.load">;
export type ReferencesLoadResult = { grounding: DocumentGrounding | null; notices: string[]; skipped: { entry: string; message: string }[] };
export type WikiPagesParams = SidecarParams<"wiki.pages">;
export type GenerateQueryStoriesParams = SidecarParams<"generate.queryStories">;
export type GenerateRunParams = SidecarParams<"generate.run">;

/** Every method the sidecar answers, by its dotted name, with its result; its params are in `SIDECAR_PARAMS`. */
export interface SidecarResults {
  "catalog.list": CatalogListItem[];
  "catalog.remove": { removed: true };
  "catalog.install": TemplateCatalogItem;
  "grounding.fetch": ProjectGrounding;
  "references.list": ReferencesListResult;
  "references.save": { saved: true };
  "references.load": ReferencesLoadResult;
  "wiki.list": { wikis: { id: string; name: string }[] };
  "wiki.pages": { paths: string[] };
  "validation.online": TemplateVerificationResult;
  "ai.generate": AIDraftResult;
  "ai.improve": AIImproveResult;
  "ai.cancel": { cancelled: boolean };
  "ai.authStatus": { authenticated: boolean };
  /** The Template at a path with its `extends` and Mixins applied (ADR-0048). */
  "template.resolveLocal": TaskTemplate;
  "generate.queryStories": { stories: WorkItem[] };
  "generate.run": { report: AtomizationReport };
  "preview.inspect": InspectResult;
  "preview.mockStory": PreviewResult;
}

export type SidecarMethod = keyof SidecarResults;
/** A method's params as the sidecar's handler gets them: the output of parsing them against the method's schema. */
export type SidecarParams<M extends SidecarMethod> = z.output<(typeof SIDECAR_PARAMS)[M]["schema"]>;
export type SidecarResult<M extends SidecarMethod> = SidecarResults[M];

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
