import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
	untrack,
} from "solid-js";
import { stringify } from "yaml";
import {
	buildPermalink,
	normalizeDocumentPath,
	parsePermalink,
} from "./permalinks";
import { searchSchemaTree } from "./search";
import type { SchemaNode, SchemaTab, SchemaTrees } from "./tree";

export interface SchemaReferenceProps {
	trees: SchemaTrees;
	versionLabel: string;
	initialTab?: SchemaTab;
	notice?: string;
	guideUrl?: (anchor: string) => string;
	openExternalLink?: (url: string) => void | Promise<void>;
	permalink?: string;
	syncUrl?: boolean;
	showPermalinks?: boolean;
}

type GuideLinks = Pick<SchemaReferenceProps, "guideUrl" | "openExternalLink">;

const nestedFields = (node: SchemaNode) => [
	...node.children,
	...node.alternatives,
];
const fieldLabel = (node: SchemaNode) =>
	node.name === "[]" ? "Array item" : node.name;
const requirementLabel = (node: SchemaNode) =>
	node.requirement === "unless-extends"
		? "Required unless extends is set"
		: node.requirement === "required"
			? "Required"
			: "Optional";

function FieldFacts(props: { node: SchemaNode; links: GuideLinks }) {
	const guideUrl = () =>
		props.node.guideAnchor && props.links.guideUrl?.(props.node.guideAnchor);
	return (
		<>
			<Show when={props.node.description}>
				<p class="schema-reference-description">{props.node.description}</p>
			</Show>
			<dl class="schema-reference-facts">
				<Show when={Object.hasOwn(props.node, "default")}>
					<div>
						<dt>Default</dt>
						<dd>
							<code>{JSON.stringify(props.node.default)}</code>
						</dd>
					</div>
				</Show>
				<Show when={props.node.values}>
					<div>
						<dt>Allowed values</dt>
						<dd class="schema-reference-values">
							<For each={props.node.values}>
								{(value) => <code>{JSON.stringify(value)}</code>}
							</For>
						</dd>
					</div>
				</Show>
				<For each={Object.entries(props.node.constraints)}>
					{([key, value]) => (
						<div>
							<dt>{key}</dt>
							<dd>
								<code>{JSON.stringify(value)}</code>
							</dd>
						</div>
					)}
				</For>
			</dl>
			<Show when={props.node.rules.length}>
				<div class="schema-reference-rules">
					<h3>Runtime rules</h3>
					<ul>
						<For each={props.node.rules}>{(rule) => <li>{rule}</li>}</For>
					</ul>
				</div>
			</Show>
			<Show when={props.node.recursive}>
				<p class="schema-reference-description">
					Recursive structure; follows the same fields as its parent.
				</p>
			</Show>
			<Show when={props.node.examples.length}>
				<div class="schema-reference-examples">
					<h3>YAML examples</h3>
					<For each={props.node.examples}>
						{(example) => (
							<figure aria-label={`YAML example for ${props.node.path}`}>
								<pre>
									<code>{stringify(
										props.node.name === "[]" ? example : { [props.node.name]: example },
										{ lineWidth: 0 },
									)}</code>
								</pre>
							</figure>
						)}
					</For>
				</div>
			</Show>
			<Show when={guideUrl()}>
				{(url) => (
					<p class="schema-reference-guide">
						<a
							href={url()}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Read about ${props.node.path} in the Template Reference`}
							onClick={(event) => {
								if (props.links.openExternalLink) {
									event.preventDefault();
									void props.links.openExternalLink(url());
								}
							}}
						>
							Template Reference <span aria-hidden="true">↗</span>
						</a>
					</p>
				)}
			</Show>
		</>
	);
}

function CopyFieldLink(props: { node: SchemaNode }) {
	const [copied, setCopied] = createSignal(false);
	const [manualLink, setManualLink] = createSignal("");
	let reset: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	onCleanup(() => {
		disposed = true;
		clearTimeout(reset);
	});
	async function copy(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		const url = new URL(window.location.href);
		url.hash = props.node.permalink;
		setCopied(false);
		clearTimeout(reset);
		try {
			await navigator.clipboard.writeText(url.href);
			if (disposed) return;
			setCopied(true);
			setManualLink("");
			clearTimeout(reset);
			reset = setTimeout(() => setCopied(false), 1800);
		} catch {
			if (!disposed) setManualLink(url.href);
		}
	}
	return (
		<span class="schema-reference-link-control">
			<button
				type="button"
				class="schema-reference-copy-link"
				aria-label={`Copy link to ${props.node.path}`}
				title="Copy field link"
				onClick={copy}
			>
				{copied() ? "Copied" : "#"}
			</button>
			<span class="schema-reference-sr-only" role="status">
				{copied() ? `Link to ${props.node.path} copied` : ""}
			</span>
			<Show when={manualLink()}>
				<input
					type="text"
					readOnly
					value={manualLink()}
					aria-label={`Permalink to ${props.node.path}`}
					onClick={(event) => {
						event.stopPropagation();
						event.currentTarget.select();
					}}
					ref={(element) =>
						queueMicrotask(() => {
							element.focus();
							element.select();
						})
					}
				/>
			</Show>
		</span>
	);
}

function FieldHeading(props: { node: SchemaNode; showPermalinks?: boolean }) {
	return (
		<>
			<code class="schema-reference-field-name">{fieldLabel(props.node)}</code>
			<span class="schema-reference-type">{props.node.type}</span>
			<span
				class="schema-reference-requirement"
				data-kind={props.node.requirement}
			>
				{requirementLabel(props.node)}
			</span>
			<Show when={props.node.deprecated}>
				<span class="schema-reference-deprecated">Deprecated</span>
			</Show>
			<Show when={props.showPermalinks !== false}><CopyFieldLink node={props.node} /></Show>
		</>
	);
}

type FieldListProps = {
	showPermalinks?: boolean;
	links: GuideLinks;
	nodes: SchemaNode[];
	parentKey: string;
	active: string;
	searching: boolean;
	register: (key: string, element: HTMLElement) => void;
};

function NestedFields(props: FieldListProps) {
	return (
		<Show when={props.nodes.length}>
			<ul class="schema-reference-nested">
				<For each={props.nodes}>
					{(node, index) => {
						const key = () => `${props.parentKey}.${index()}`;
						return (
							<li>
								<details
									data-permalink={node.permalink}
									open={props.searching}
									ref={(element) => props.register(key(), element)}
									classList={{
										"schema-reference-selected": props.active === key(),
									}}
								>
									<summary>
										<FieldHeading node={node} showPermalinks={props.showPermalinks} />
										<span class="schema-reference-chevron" aria-hidden="true">
											›
										</span>
									</summary>
									<div class="schema-reference-nested-body">
										<code class="schema-reference-path">{node.path}</code>
										<FieldFacts node={node} links={props.links} />
										<NestedFields
											showPermalinks={props.showPermalinks}
											links={props.links}
											nodes={nestedFields(node)}
											parentKey={key()}
											active={props.active}
											searching={props.searching}
											register={props.register}
										/>
									</div>
								</details>
							</li>
						);
					}}
				</For>
			</ul>
		</Show>
	);
}

function FieldNavigation(props: {
	nodes: SchemaNode[];
	parentKey: string;
	active: string;
	searching: boolean;
	register: (key: string, element: HTMLDetailsElement) => void;
	navigate: (key: string) => void;
}) {
	return (
		<ul class="schema-reference-navigation">
			<For each={props.nodes}>
				{(node, index) => {
					const key = () => `${props.parentKey}.${index()}`;
					const button = () => (
						<button
							type="button"
							aria-current={props.active === key() ? "location" : undefined}
							onClick={(event) => {
								event.preventDefault();
								props.navigate(key());
							}}
						>
							<code>{fieldLabel(node)}</code>
							<span aria-hidden="true">
								{node.type === "array"
									? "[ ]"
									: node.type === "object"
										? "{ }"
										: ""}
							</span>
						</button>
					);
					return (
						<li>
							<Show when={nestedFields(node).length} fallback={button()}>
								<details
									open={props.searching}
									ref={(element) => props.register(key(), element)}
								>
									<summary>
										<span class="schema-reference-chevron" aria-hidden="true">
											›
										</span>
										{button()}
									</summary>
									<FieldNavigation
										nodes={nestedFields(node)}
										parentKey={key()}
										active={props.active}
										searching={props.searching}
										register={props.register}
										navigate={props.navigate}
									/>
								</details>
							</Show>
						</li>
					);
				}}
			</For>
		</ul>
	);
}

export function SchemaReference(props: SchemaReferenceProps) {
	const [tab, setTab] = createSignal<SchemaTab>(props.initialTab ?? "template");
	const [active, setActive] = createSignal("");
	const [query, setQuery] = createSignal("");
	const searching = () => Boolean(query().trim());
	const fields = createMemo(() =>
		searchSchemaTree(props.trees[tab()], query()),
	);
	const fieldElements = new Map<string, HTMLElement>();
	const navigationElements = new Map<string, HTMLDetailsElement>();
	let savedFields = new Set<string>();
	let savedNavigation = new Set<string>();
	let navigationRequest = 0;
	const register = (key: string, element: HTMLElement) =>
		fieldElements.set(key, element);
	const registerNavigation = (key: string, element: HTMLDetailsElement) =>
		navigationElements.set(key, element);
	function updateQuery(next: string) {
		if (!searching() && next.trim()) {
			savedFields = new Set(
				[...fieldElements]
					.filter(
						([, element]) =>
							element.isConnected && element.matches("details[open]"),
					)
					.map(([key]) => key),
			);
			savedNavigation = new Set(
				[...navigationElements]
					.filter(([, element]) => element.isConnected && element.open)
					.map(([key]) => key),
			);
		}
		const wasSearching = searching();
		setActive("");
		setQuery(next);
		if (wasSearching && !next.trim())
			queueMicrotask(() => {
				if (searching()) return;
				for (const [key, element] of fieldElements) {
					if (element.isConnected && element.matches("details"))
						element.toggleAttribute("open", savedFields.has(key));
				}
				for (const [key, element] of navigationElements) {
					if (element.isConnected) element.open = savedNavigation.has(key);
				}
			});
	}

	function navigate(key: string, updateFragment = true) {
		const target = fieldElements.get(key);
		if (!target?.isConnected) return;
		setActive(key);
		const current = parsePermalink(window.location.hash);
		const currentLink = current
			? buildPermalink(current.tab, current.path)
			: undefined;
		if (
			props.syncUrl !== false &&
			updateFragment &&
			target.dataset.permalink &&
			currentLink !== target.dataset.permalink
		) {
			const url = new URL(window.location.href);
			url.hash = target.dataset.permalink;
			window.history.pushState(null, "", url);
		}
		for (const [navKey, element] of navigationElements) {
			if (
				element.isConnected &&
				(key === navKey || key.startsWith(`${navKey}.`))
			) {
				element.open = true;
				const index = element.closest(".schema-reference-index");
				index?.setAttribute("open", "");
			}
		}
		if (target.matches("details")) target.setAttribute("open", "");
		let ancestor = target.parentElement?.closest("details");
		while (ancestor) {
			ancestor.open = true;
			ancestor = ancestor.parentElement?.closest("details") ?? null;
		}
		const focusTarget = target.matches("details")
			? target.querySelector("summary")
			: target;
		(focusTarget as HTMLElement | null)?.focus({ preventScroll: true });
		target.scrollIntoView({
			block: "start",
			behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
				? "instant"
				: "smooth",
		});
	}

	function openPermalink(fragment: string) {
		const request = ++navigationRequest;
		const parsed = parsePermalink(fragment);
		if (!parsed) {
			if (!fragment) setActive("");
			return;
		}
		const resolved = normalizeDocumentPath(
			props.trees,
			parsed.path,
			parsed.tab,
		);
		setTab(parsed.tab);
		updateQuery("");
		queueMicrotask(() => {
			if (request !== navigationRequest) return;
			if (props.syncUrl !== false && window.location.hash !== fragment && !props.permalink) return;
			const candidates = [...fieldElements].filter(
				([, element]) =>
					element.isConnected && element.dataset.permalink === resolved,
			);
			// Union alternatives share a path: land on its owning field first.
			candidates.sort(
				([left], [right]) =>
					left.split(".").length - right.split(".").length ||
					left.localeCompare(right, undefined, { numeric: true }),
			);
			if (candidates[0]) navigate(candidates[0][0], false);
		});
	}
	createEffect(() => {
		const permalink = props.permalink;
		if (permalink) untrack(() => openPermalink(permalink));
	});
	onMount(() => {
		if (props.syncUrl === false) return;
		const openFragment = () => openPermalink(window.location.hash);
		if (!props.permalink) openFragment();
		window.addEventListener("hashchange", openFragment);
		onCleanup(() => window.removeEventListener("hashchange", openFragment));
	});

	return (
		<section class="schema-reference" aria-label="Schema Reference">
			<div class="schema-reference-layout">
				<aside class="schema-reference-sidebar">
					<p class="schema-reference-eyebrow">Authoring reference</p>
					<nav class="schema-reference-tabs" aria-label="File kind">
						<For each={["template", "mixin"] as const}>
							{(kind) => (
								<button
									type="button"
									aria-pressed={tab() === kind}
									onClick={() => {
										setTab(kind);
										setActive("");
									}}
								>
									{kind === "template" ? "Template" : "Mixin"}
									<span aria-hidden="true">
										{kind === "template" ? "01" : "02"}
									</span>
								</button>
							)}
						</For>
					</nav>
					<div class="schema-reference-search">
						<label>
							<span aria-hidden="true">⌕</span>
							<input
								type="search"
								aria-label="Search fields and descriptions"
								placeholder="Find a field…"
								value={query()}
								onInput={(event) => updateQuery(event.currentTarget.value)}
								onKeyDown={(event) => {
									if (event.key === "Escape") updateQuery("");
								}}
							/>
						</label>
						<Show when={query()}>
							<button
								type="button"
								aria-label="Clear search"
								onClick={() => updateQuery("")}
							>
								×
							</button>
						</Show>
					</div>
					<details class="schema-reference-index" open>
						<summary>
							<span>Fields</span>
							<span>{fields().length}</span>
							<span class="schema-reference-chevron" aria-hidden="true">
								›
							</span>
						</summary>
						<nav
							aria-label={`${tab() === "template" ? "Template" : "Mixin"} field index`}
						>
							<FieldNavigation
								nodes={fields()}
								parentKey={tab()}
								active={active()}
								searching={searching()}
								register={registerNavigation}
								navigate={navigate}
							/>
						</nav>
					</details>
					<footer class="schema-reference-source">
						<p class="schema-reference-eyebrow">Schema source</p>
						<code>{props.versionLabel}</code>
						<p>Generated from the schema Atomize validates with.</p>
					</footer>
				</aside>
				<div class="schema-reference-content">
					<div class="schema-reference-breadcrumb">
						Reference <span aria-hidden="true">/</span> Atomize YAML{" "}
						<span aria-hidden="true">/</span>{" "}
						{tab() === "template" ? "Template" : "Mixin"}
					</div>
					<header class="schema-reference-intro">
						<p class="schema-reference-eyebrow">The format, field by field</p>
						<h1>
							Schema Reference<span>.</span>
						</h1>
						<p>
							Everything you can put in an Atomize YAML File.
							<br />
							Types, defaults and constraints, straight from the source.
						</p>
					</header>
					<Show when={props.notice}>
						<div class="schema-reference-notice">
							<span aria-hidden="true">ⓘ</span>
							<p>{props.notice}</p>
						</div>
					</Show>
					<div class="schema-reference-section-heading">
						<div>
							<h2>{tab() === "template" ? "Template" : "Mixin"}</h2>
							<p>
								{tab() === "template"
									? "A recipe for turning Stories into Tasks."
									: "Reusable Tasks to compose into your Templates."}
							</p>
						</div>
						<span>{props.trees[tab()].length} fields</span>
					</div>
					<div class="schema-reference-fields">
						<Show
							when={fields().length}
							fallback={
								<div class="schema-reference-empty" role="status">
									<h2>No matching fields</h2>
									<p>
										No {tab()} fields match “{query()}”. Try a field name or
										part of its description.
									</p>
									<button type="button" onClick={() => updateQuery("")}>
										Clear search
									</button>
								</div>
							}
						>
							<For each={fields()}>
								{(node, index) => {
									const key = () => `${tab()}.${index()}`;
									return (
										<article
											data-permalink={node.permalink}
											tabIndex={-1}
											ref={(element) => register(key(), element)}
											classList={{
												"schema-reference-selected": active() === key(),
											}}
										>
											<header>
												<FieldHeading node={node} showPermalinks={props.showPermalinks} />
											</header>
												<FieldFacts node={node} links={props} />
											<NestedFields
													showPermalinks={props.showPermalinks}
													links={props}
												nodes={nestedFields(node)}
												parentKey={key()}
												active={active()}
												searching={searching()}
												register={register}
											/>
										</article>
									);
								}}
							</For>
						</Show>
					</div>
					<footer class="schema-reference-footer">
						Generated from the Atomize schema <span aria-hidden="true">·</span>{" "}
						<code>{props.versionLabel}</code>
					</footer>
				</div>
			</div>
		</section>
	);
}
