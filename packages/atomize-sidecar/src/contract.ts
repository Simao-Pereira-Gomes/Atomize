/**
 * The sidecar's wire contract (ADR-0042): every method's params and result, and the
 * notifications it sends. The sidecar's handlers are typed against it, and Atomize Studio
 * imports it type-only, so a change on one side shows up as a type error on the other.
 *
 * Params are what the sidecar receives from the Rust relay. Studio's own calls go to Rust
 * commands that inject credentials (a Connection Profile name becomes a connection), so
 * Studio uses the results and notifications, not the params.
 */
import type { AtomizationReport, ProgressEvent } from "@sppg2001/atomize-core/core/atomizer";
import type { WorkItem } from "@sppg2001/atomize-core/platforms/interfaces/work-item.interface";
import type { ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import type { DocumentGrounding } from "@sppg2001/atomize-core/services/template/reference-documents";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import type { InspectResult, PreviewResult } from "@sppg2001/atomize-core/templates/template-inspector";
import type {
  TemplateCatalogItem,
  TemplateCatalogKind,
  TemplateCatalogScope,
} from "@sppg2001/atomize-core/templates/template-library";
import type { TemplateVerificationResult } from "@sppg2001/atomize-core/templates/template-verification";

export type { DocumentGrounding, ProjectGrounding, TemplateVerificationResult };

/** A Connection Profile's connection, with the token Rust injected; never sent back. */
export type GroundingConnection = { organizationUrl: string; project: string; team: string; token: string };

/** Which Stories a `generate.run` call processes (CONTEXT.md, "Generate Scope"). */
/** `resume` finishes each Story as a Partly Created Story: only its missing Tasks are created. */
export type GenerateScope = { kind: "stories"; storyIds: string[]; resume?: boolean } | { kind: "filter" };

export type CatalogListItem = TemplateCatalogItem & { content: unknown };
export type CatalogRemoveParams = { kind: TemplateCatalogKind; name: string };
export type CatalogInstallParams = {
  content: string;
  name: string;
  scope: Extract<TemplateCatalogScope, "user" | "project">;
  overwrite: boolean;
  workspaceRoot?: string;
};
export type OnlineValidationParams = { template: TaskTemplate; connection: GroundingConnection };
export type AIDraftParams = { draftId: string; prose: string; grounding?: unknown; documentGrounding?: unknown };
export type AIDraftResult = { template: Record<string, unknown>; errors?: string[] };
export type AIImproveParams = { draftId: string; template: Record<string, unknown>; guidance?: string | null; grounding?: unknown; documentGrounding?: unknown };
/** A proposal, Copilot's notes, and what's left to fix or worth a look. */
export type AIImproveResult = { template: Record<string, unknown>; notes: string[]; errors?: string[]; warnings?: string[] };
/** Where Reference Documents are looked up: a Workspace Root, discovered from a folder or file inside it. */
export type ReferencesListParams = { startPath: string };
export type ReferencesListResult = { workspaceRoot: string; entries: string[]; problems: string[] };
export type ReferencesSaveParams = { workspaceRoot: string; entry: string };
/** Reference Documents to load and fit; wiki entries need the Rust-injected connection. */
export type ReferencesLoadParams = { workspaceRoot: string; entries: string[]; connection?: GroundingConnection };
export type ReferencesLoadResult = { grounding: DocumentGrounding | null; notices: string[]; skipped: { entry: string; message: string }[] };
export type WikiListParams = { connection: GroundingConnection };
export type WikiPagesParams = { connection: GroundingConnection; wiki: string };
export type GenerateQueryStoriesParams = { source: string; connection: GroundingConnection };
export type GenerateRunParams = { runId: string; source: string; connection: GroundingConnection; dryRun: boolean; scope: GenerateScope; continueOnError?: boolean };

/** Every method the sidecar answers, by its dotted name. */
export interface SidecarMethods {
  "catalog.list": { params: undefined; result: CatalogListItem[] };
  "catalog.remove": { params: CatalogRemoveParams; result: { removed: true } };
  "catalog.install": { params: CatalogInstallParams; result: TemplateCatalogItem };
  "grounding.fetch": { params: GroundingConnection; result: ProjectGrounding };
  "references.list": { params: ReferencesListParams; result: ReferencesListResult };
  "references.save": { params: ReferencesSaveParams; result: { saved: true } };
  "references.load": { params: ReferencesLoadParams; result: ReferencesLoadResult };
  "wiki.list": { params: WikiListParams; result: { wikis: { id: string; name: string }[] } };
  "wiki.pages": { params: WikiPagesParams; result: { paths: string[] } };
  "validation.online": { params: OnlineValidationParams; result: TemplateVerificationResult };
  "ai.generate": { params: AIDraftParams; result: AIDraftResult };
  "ai.improve": { params: AIImproveParams; result: AIImproveResult };
  "ai.cancel": { params: { draftId: string }; result: { cancelled: boolean } };
  "ai.authStatus": { params: undefined; result: { authenticated: boolean } };
  /** The Template at a path with its `extends` and Mixins applied (ADR-0048). */
  "template.resolveLocal": { params: { path: string }; result: TaskTemplate };
  "generate.queryStories": { params: GenerateQueryStoriesParams; result: { stories: WorkItem[] } };
  "generate.run": { params: GenerateRunParams; result: { report: AtomizationReport } };
  "preview.inspect": { params: { source: string }; result: InspectResult };
  "preview.mockStory": { params: { source: string; mockStory: string }; result: PreviewResult };
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
