// PROTOTYPE: Three structurally different Schema Reference layouts on /schema?variant=A|B|C.
// Question: which hierarchy makes a dense schema feel readable and easy to explore?
// Real schema data; local UI state only. Promote a chosen direction after review.

import type { SchemaNode, SchemaTab, SchemaTrees } from "@sppg2001/atomize-schema-reference";
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import logo from "../../../vscode-extension/icons/atomize-product.svg?url";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import "./schema-reference-prototype.css";

type Props = { trees: SchemaTrees; versionLabel: string };
const children = (node: SchemaNode) => [...node.children, ...node.alternatives];
const requirement = (node: SchemaNode) => node.requirement === "unless-extends" ? "Required unless extends is set" : node.requirement === "required" ? "Required" : "Optional";

function Brand() {
  return <a class="proto-brand" href="/schema"><img src={logo} alt="" width="26" height="26" />atomize<span>/ docs</span></a>;
}

function KindTabs(props: { tab: SchemaTab; setTab: (tab: SchemaTab) => void }) {
  return <nav class="proto-kind-tabs" aria-label="File kind"><For each={["template", "mixin"] as const}>{kind =>
    <button type="button" aria-pressed={props.tab === kind} onClick={() => props.setTab(kind)}>{kind === "template" ? "Template" : "Mixin"}<span>{kind === "template" ? "01" : "02"}</span></button>
  }</For></nav>;
}

function Facts(props: { node: SchemaNode }) {
  return <div class="proto-facts">
    <Show when={Object.hasOwn(props.node, "default")}><div><span>Default</span><code>{JSON.stringify(props.node.default)}</code></div></Show>
    <Show when={props.node.values}><div><span>Allowed values</span><p class="proto-enums"><For each={props.node.values}>{value => <code>{JSON.stringify(value)}</code>}</For></p></div></Show>
    <For each={Object.entries(props.node.constraints)}>{([key, value]) => <div><span>{key}</span><code>{JSON.stringify(value)}</code></div>}</For>
    <Show when={props.node.deprecated}><div><span>Status</span><code>Deprecated</code></div></Show>
  </div>;
}

function NestedFields(props: { nodes: SchemaNode[] }) {
  return <div class="proto-nested"><For each={props.nodes}>{node => <details>
    <summary><code>{node.name === "[]" ? "Array item" : node.name}</code><span>{node.type}</span><span class="proto-nested-arrow">↗</span></summary>
    <div class="proto-nested-body"><span class="proto-status" data-kind={node.requirement}>{requirement(node)}</span><p>{node.description}</p><Facts node={node} /><NestedFields nodes={children(node)} /></div>
  </details>}</For></div>;
}

export function VariantA(props: Props) {
  const [tab, setTab] = createSignal<SchemaTab>("template");
  const [active, setActive] = createSignal("name");
  const [query, setQuery] = createSignal("");
  const nodes = createMemo(() => props.trees[tab()].filter(node => `${node.name} ${node.description}`.toLowerCase().includes(query().toLowerCase())));
  return <div class="proto-a">
    <header class="proto-a-top"><Brand /><nav><span class="proto-active-link">Schema Reference</span><a href="https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Template-Reference.md">Template Reference ↗</a></nav><span class="proto-build"><i />main · development</span></header>
    <div class="proto-a-layout">
      <aside class="proto-a-sidebar"><div class="proto-eyebrow">AUTHORING REFERENCE</div><KindTabs tab={tab()} setTab={setTab} /><label class="proto-search"><span>⌕</span><input value={query()} onInput={event => setQuery(event.currentTarget.value)} placeholder="Find a field…" aria-label="Find a field" /><kbd>/</kbd></label>
        <div class="proto-sidebar-heading">FIELDS <span>{nodes().length}</span></div>
        <nav class="proto-a-field-nav" aria-label="Schema fields"><For each={nodes()}>{node => <a href={`#proto-a-${node.name}`} classList={{ selected: active() === node.name }} onClick={() => setActive(node.name)}><span>{node.name}</span><Show when={children(node).length}><span>⌄</span></Show></a>}</For></nav>
        <div class="proto-sidebar-footer"><span class="proto-eyebrow">SCHEMA SOURCE</span><code>{props.versionLabel}</code><p>Generated from the schema Atomize validates with.</p></div>
      </aside>
      <main class="proto-a-main"><div class="proto-breadcrumb">Reference <span>/</span> Atomize YAML <span>/</span> {tab() === "template" ? "Template" : "Mixin"}</div>
        <div class="proto-a-intro"><div class="proto-eyebrow">THE FORMAT, FIELD BY FIELD</div><h1>Schema Reference<span>.</span></h1><p>Everything you can put in an Atomize YAML File.<br />Types, defaults and constraints, straight from the source.</p></div>
        <div class="proto-a-callout"><span>i</span><p>You’re reading the development schema on <strong>main</strong>. In-app references match your installed version.</p></div>
        <div class="proto-a-section-title"><div><h2>{tab() === "template" ? "Template" : "Mixin"}</h2><p>{tab() === "template" ? "A recipe for turning Stories into Tasks." : "Reusable Tasks to compose into your Templates."}</p></div><code>{props.trees[tab()].length} fields</code></div>
        <div class="proto-a-fields"><For each={nodes()}>{node => <article id={`proto-a-${node.name}`}>
          <header><div><code class="proto-field-name">{node.name}</code><span class="proto-type">{node.type}</span></div><span class="proto-status" data-kind={node.requirement}>{requirement(node)}</span></header>
          <p>{node.description || "An optional field in this file."}</p><Facts node={node} /><NestedFields nodes={children(node)} />
        </article>}</For><Show when={!nodes().length}><p>No fields match “{query()}”.</p></Show></div>
        <footer class="proto-page-footer">Generated from the Atomize schema · {props.versionLabel}</footer>
      </main>
    </div>
  </div>;
}

function Outline(props: { nodes: SchemaNode[]; active: string; select: (node: SchemaNode) => void; depth?: number }) {
  return <div class="proto-outline"><For each={props.nodes}>{node => <div>
    <button type="button" classList={{ selected: props.active === node.path }} style={{ "padding-left": `${16 + (props.depth ?? 0) * 16}px` }} onClick={() => props.select(node)}><span class="proto-outline-glyph">{children(node).length ? "◇" : "·"}</span><code>{node.name}</code><span>{node.type === "object" ? "{ }" : node.type === "array" ? "[ ]" : ""}</span></button>
    <Show when={children(node).length && (props.active === node.path || props.active.startsWith(`${node.path}.`) || props.active.startsWith(`${node.path}[`))}><Outline nodes={children(node)} active={props.active} select={props.select} depth={(props.depth ?? 0) + 1} /></Show>
  </div>}</For></div>;
}

export function VariantB(props: Props) {
  const [tab, setTab] = createSignal<SchemaTab>("template");
  const [selected, setSelected] = createSignal(props.trees.template.find(node => node.name === "tasks") ?? props.trees.template[0]);
  const setKind = (kind: SchemaTab) => { setTab(kind); setSelected(props.trees[kind].find(node => node.name === "tasks") ?? props.trees[kind][0]); };
  return <div class="proto-b">
    <header class="proto-b-top"><Brand /><span class="proto-b-title">Schema explorer</span><span class="proto-build"><i />{props.versionLabel}</span></header>
    <div class="proto-b-workspace">
      <aside class="proto-b-sidebar"><div class="proto-eyebrow">SCHEMA REFERENCE</div><KindTabs tab={tab()} setTab={setKind} /><div class="proto-b-file"><span>≡</span> {tab()}.atomize.yaml <span>YAML</span></div><Outline nodes={props.trees[tab()]} active={selected().path} select={setSelected} /><footer>Read-only · generated schema</footer></aside>
      <main class="proto-b-inspector"><div class="proto-b-breadcrumb"><span>{tab()}</span><span>/</span><code>{selected().path}</code></div>
        <div class="proto-b-heading"><span class="proto-eyebrow">FIELD INSPECTOR</span><h1>{selected().name === "[]" ? "Array item" : selected().name}</h1><div><span class="proto-type">{selected().type}</span><span class="proto-status" data-kind={selected().requirement}>{requirement(selected())}</span></div><p>{selected().description || "Explore this field’s structure and accepted values."}</p></div>
        <section class="proto-b-properties"><h2>Specification <span>01</span></h2><div class="proto-b-property"><span>Schema path</span><code>{selected().path}</code></div><div class="proto-b-property"><span>Type</span><code>{selected().type}</code></div><div class="proto-b-property"><span>Requirement</span><span>{requirement(selected())}</span></div><Facts node={selected()} /></section>
        <Show when={children(selected()).length}><section class="proto-b-properties"><h2>Structure <span>02</span></h2><NestedFields nodes={children(selected())} /></section></Show>
      </main>
      <aside class="proto-b-context"><div class="proto-eyebrow">AT A GLANCE</div><h2>Know the shape.<br /><span>Then make it yours.</span></h2><p>The same schema powers editor validation and this reference.</p><div class="proto-b-code-header"><span>JSON Schema</span><span>↙ source</span></div><pre><code>{JSON.stringify({ type: selected().type, ...(selected().values ? { enum: selected().values } : {}), ...selected().constraints, ...(Object.hasOwn(selected(), "default") ? { default: selected().default } : {}) }, null, 2)}</code></pre><div class="proto-b-version"><span class="proto-status">Development build</span><p>Looking for your installed version? Open the Schema Reference inside Studio or VS Code.</p></div><a href="https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Template-Reference.md">Read the Template Reference ↗</a></aside>
    </div>
  </div>;
}

export function VariantC(props: Props) {
  const [tab, setTab] = createSignal<SchemaTab>("template");
  return <div class="proto-c">
    <header class="proto-c-top"><Brand /><span>THE AUTHOR’S COMPANION</span><a href="https://github.com/Simao-Pereira-Gomes/Atomize">GitHub ↗</a></header>
    <main class="proto-c-main"><div class="proto-c-hero"><div><div class="proto-eyebrow">ATOMIZE / REFERENCE NO. 01</div><h1>A little structure.<br /><em>A lot of possibility.</em></h1><p>The anatomy of an Atomize YAML File.<br />An open reference to every field, type and rule.</p></div><div class="proto-c-stamp"><span>SCHEMA</span><strong>{props.trees[tab()].length.toString().padStart(2, "0")}</strong><span>FIELDS TO BUILD WITH</span></div></div>
      <div class="proto-c-toolbar"><KindTabs tab={tab()} setTab={setTab} /><div><i /> Development edition <span>·</span> main</div></div>
      <div class="proto-c-content"><aside><span class="proto-eyebrow">IN THIS REFERENCE</span><nav aria-label="Field index"><For each={props.trees[tab()]}>{(node, index) => <a href={`#proto-c-${node.name}`}><span>{(index() + 1).toString().padStart(2, "0")}</span>{node.name}</a>}</For></nav><p>Field facts come directly from the schema. For behaviour and worked examples, visit the <a href="https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Template-Reference.md">Template Reference ↗</a>.</p></aside>
        <div class="proto-c-entries"><For each={props.trees[tab()]}>{(node, index) => <article id={`proto-c-${node.name}`}><div class="proto-c-entry-number">{(index() + 1).toString().padStart(2, "0")}</div><div><header><h2>{node.name}</h2><span class="proto-type">{node.type}</span></header><span class="proto-status" data-kind={node.requirement}>{requirement(node)}</span><p>{node.description || "An optional field in this file."}</p><Facts node={node} /><NestedFields nodes={children(node)} /></div></article>}</For></div>
      </div><footer class="proto-page-footer">An always-current reference. {props.versionLabel}<p>In-app references match the version you have installed.</p></footer>
    </main>
  </div>;
}

export function SchemaReferencePrototype(props: Props) {
  const [variant, setVariant] = createSignal("A");
  function readVariant() {
    const value = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
    setVariant(value === "B" || value === "C" ? value : "A");
  }
  function changeVariant(key: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState(null, "", url);
    setVariant(key);
    window.scrollTo({ top: 0 });
  }
  onMount(() => { readVariant(); window.addEventListener("popstate", readVariant); onCleanup(() => window.removeEventListener("popstate", readVariant)); });
  return <div class="reference-prototype" data-variant={variant()}>
    <Switch><Match when={variant() === "A"}><VariantA {...props} /></Match><Match when={variant() === "B"}><VariantB {...props} /></Match><Match when={variant() === "C"}><VariantC {...props} /></Match></Switch>
    <PrototypeSwitcher current={variant()} change={changeVariant} />
  </div>;
}
