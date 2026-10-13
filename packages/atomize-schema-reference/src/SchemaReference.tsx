import { createSignal, For, Show } from "solid-js";
import type { SchemaNode, SchemaTab, SchemaTrees } from "./tree";

export interface SchemaReferenceProps {
	trees: SchemaTrees;
	versionLabel: string;
}

function Field(props: { node: SchemaNode }) {
	const field = () => props.node;
	return (
		<li class="schema-reference-field">
			<details>
				<summary>
					<code>{field().name}</code>{" "}
					<span class="schema-reference-type">{field().type}</span>
					<Show when={field().requirement !== "optional"}>
						<span class="schema-reference-badge">
							{field().requirement === "unless-extends"
								? "Required unless extends is set"
								: "Required"}
						</span>
					</Show>
					<Show when={field().deprecated}>
						<span class="schema-reference-badge">Deprecated</span>
					</Show>
					<Show when={Object.hasOwn(field(), "default")}>
						<span class="schema-reference-badge">
							Default: {JSON.stringify(field().default)}
						</span>
					</Show>
				</summary>
				<div class="schema-reference-details">
					<code class="schema-reference-path">{field().path}</code>
					<Show when={field().description}>
						<p>{field().description}</p>
					</Show>
					<Show when={field().values}>
						<p>
							Allowed values:{" "}
							<code>
								{field()
									.values?.map((value) => JSON.stringify(value))
									.join(", ")}
							</code>
						</p>
					</Show>
					<Show when={Object.keys(field().constraints).length}>
						<dl class="schema-reference-constraints">
							<For each={Object.entries(field().constraints)}>
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
					</Show>
					<Show when={field().recursive}>
						<p>Recursive structure; follows the same fields as its parent.</p>
					</Show>
					<ul>
						<For each={[...field().children, ...field().alternatives]}>
							{(child) => <Field node={child} />}
						</For>
					</ul>
				</div>
			</details>
		</li>
	);
}

export function SchemaReference(props: SchemaReferenceProps) {
	const [tab, setTab] = createSignal<SchemaTab>("template");
	return (
		<section class="schema-reference" aria-label="Schema Reference">
			<header>
				<h1>Schema Reference</h1>
				<p>Explore the fields of an Atomize YAML File.</p>
				<code>{props.versionLabel}</code>
			</header>
			<nav class="schema-reference-tabs" aria-label="File kind">
				<For each={["template", "mixin"] as const}>
					{(kind) => (
						<button
							type="button"
							aria-pressed={tab() === kind}
							onClick={() => setTab(kind)}
						>
							{kind === "template" ? "Template" : "Mixin"}
						</button>
					)}
				</For>
			</nav>
			<ul aria-label={`${tab() === "template" ? "Template" : "Mixin"} fields`}>
				<For each={props.trees[tab()]}>{(field) => <Field node={field} />}</For>
			</ul>
		</section>
	);
}
