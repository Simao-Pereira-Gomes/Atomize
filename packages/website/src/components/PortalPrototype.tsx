// THROWAWAY #263: three structurally different guide/schema layouts on /schema?variant=A|B|C.
// Question: how should focused prose, documentation navigation, and field reference coexist?
import { createSignal, For, onCleanup, onMount, Show, Switch, Match } from "solid-js";
import { SchemaReference, type SchemaReferenceProps } from "@sppg2001/atomize-schema-reference/viewer";
import { PrototypeSwitcher, prototypeVariants } from "./PrototypeSwitcher";
import "./portal-prototype.css";

type Content = { intro: string; inheritanceIntro: string; inheritanceExample: string; mixinIntro: string; mixinExample: string; resolution: string[] };
type Props = Pick<SchemaReferenceProps, "trees" | "versionLabel"> & { content: Content; logo: string };
const github = "https://github.com/Simao-Pereira-Gomes/Atomize";
const topics = [
  { id: "overview", title: "Composition", detail: "Reuse your team's task breakdowns" },
  { id: "inheritance", title: "Inherit a Template", detail: "Build on a base with extends" },
  { id: "mixins", title: "Add reusable task groups", detail: "Compose Templates with Mixins" },
  { id: "resolution", title: "Understand resolution order", detail: "See how the pieces come together" },
];

export function PortalPrototype(props: Props) {
  const [variant, setVariant] = createSignal("");
  const [theme, setTheme] = createSignal("light");
  const [mode, setMode] = createSignal("guide");
  const [query, setQuery] = createSignal("");
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [schemaOpen, setSchemaOpen] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [activeTopic, setActiveTopic] = createSignal("overview");
  const [schemaField, setSchemaField] = createSignal("");

  const chooseVariant = (key: string) => {
    const url = new URL(location.href); url.searchParams.set("variant", key);
    history.replaceState(null, "", url); setVariant(key);
    setSchemaOpen(false); setMenuOpen(false); window.scrollTo(0, 0);
    console.info("Portal prototype", { variant: key, mode: mode(), theme: theme(), query: query(), activeTopic: activeTopic() });
  };
  onMount(() => {
    const key = new URL(location.href).searchParams.get("variant");
    if (!prototypeVariants.some(v => v.key === key)) return;
    setVariant(key!); setTheme(document.documentElement.dataset.theme || "light");
    document.documentElement.dataset.portalPrototype = "true";
    window.scrollTo(0, 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSearchOpen(false); setSchemaOpen(false); setMenuOpen(false); }
    };
    window.addEventListener("keydown", keydown);
    onCleanup(() => { delete document.documentElement.dataset.portalPrototype; window.removeEventListener("keydown", keydown); });
  });
  const toggleTheme = () => {
    const value = theme() === "dark" ? "light" : "dark"; setTheme(value);
    document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value;
  };
  const goTopic = (id: string) => {
    setMode("guide"); setActiveTopic(id); setSearchOpen(false); setMenuOpen(false); setSchemaOpen(false);
    requestAnimationFrame(() => document.getElementById(`prototype-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const openSchema = () => { variant() === "B" ? setSchemaOpen(true) : setMode("schema"); setMenuOpen(false); };
  const Brand = () => <a class="pp-brand" href="#prototype-overview" onClick={event => { event.preventDefault(); goTopic("overview"); }}><img src={props.logo} width="27" height="27" alt="" />atomize<span>docs</span></a>;
  const SearchButton = () => <button class="pp-search" onClick={() => { setSearchOpen(true); setQuery(""); requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".pp-search-dialog input")?.focus()); }}><span>⌕</span> Search documentation <kbd>/</kbd></button>;
  const Utilities = () => <div class="pp-utilities"><a href={github}>GitHub ↗</a><button class="pp-theme" aria-label="Toggle theme" onClick={toggleTheme}>{theme() === "dark" ? "☼" : "◐"}</button><button class="pp-menu" aria-expanded={menuOpen()} onClick={() => setMenuOpen(!menuOpen())}>Menu</button></div>;
  const Notice = () => <div class="pp-notice"><span class="pp-dot" /> You're reading development docs on <strong>main</strong>.<span class="pp-notice-tail"> Your installed version may differ.</span><a href={`${github}/releases`}>Releases ↗</a></div>;
  const Navigation = () => <nav class="pp-navigation" aria-label="Documentation">
    <p class="pp-nav-label">START HERE</p>
    <a href={`${github}/blob/main/README.md`}>Getting started <span>↗</span></a>
    <a href={`${github}/blob/main/docs/Workflows.md`}>Workflows <span>↗</span></a>
    <p class="pp-nav-label">TEMPLATE REFERENCE</p>
    <button classList={{ selected: mode() === "guide" }} onClick={() => goTopic("overview")}>Composition <span>⌄</span></button>
    <div class="pp-nav-children"><For each={topics.slice(1)}>{t => <button classList={{ active: activeTopic() === t.id && mode() === "guide" }} onClick={() => goTopic(t.id)}>{t.title}</button>}</For></div>
    <a href={`${github}/blob/main/docs/Template-Reference.md#estimation`}>Estimation <span>↗</span></a>
    <a href={`${github}/blob/main/docs/Template-Reference.md#validation`}>Validation <span>↗</span></a>
    <button classList={{ selected: mode() === "schema" }} onClick={openSchema}>Schema Reference <span>↗</span></button>
    <p class="pp-nav-label">YOUR TOOLS</p>
    <For each={[['Atomize Studio', 'Atomize-Studio'], ['VS Code extension', 'VS-Code-Extension'], ['Command line', 'Cli-Reference']]}>{([name, file]) => <a href={`${github}/blob/main/docs/${file}.md`}>{name}<span>↗</span></a>}</For>
    <div class="pp-nav-footer"><span class="pp-dot" /> main · development<br /><small>{props.versionLabel}</small></div>
  </nav>;
  const Contents = () => <aside class="pp-contents"><p class="pp-nav-label">ON THIS PAGE</p><For each={topics}>{t => <button classList={{ active: activeTopic() === t.id }} onClick={() => goTopic(t.id)}>{t.title}</button>}</For><div class="pp-field-link"><span>Need an exact field?</span><button onClick={openSchema}>Open Schema Reference ↗</button><small>Types, defaults, and constraints.</small></div></aside>;
  const Code = (p: { text: string; name: string }) => <div class="pp-code"><div><span>{p.name}</span><button onClick={async () => { await navigator.clipboard.writeText(p.text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied() ? "Copied" : "Copy"}</button></div><pre><code>{p.text}</code></pre></div>;
  const InlineText = (p: { text: string }) => <For each={p.text.split("`")}>{(part, index) => index() % 2 ? <code>{part}</code> : part}</For>;
  const Article = () => <article class="pp-article" id="prototype-overview">
    <div class="pp-breadcrumb">Template Reference <span>/</span> Composition</div>
    <p class="pp-eyebrow">BUILD ON WHAT WORKS</p>
    <h1>Good Templates.<br /><span>Better together.</span></h1>
    <p class="pp-lede">{props.content.intro}</p>
    <div class="pp-article-meta"><span>GUIDE</span><span>5 min read</span><a href={`${github}/blob/main/docs/Template-Reference.md#composition`}>View source ↗</a></div>
    <div class="pp-composition-map" aria-label="A base Template plus Mixin tasks becomes a Resolved Template"><div><small>START WITH</small><strong>Base Template</strong></div><span>+</span><div><small>ADD</small><strong>Mixin Tasks</strong></div><span>→</span><div><small>INSPECT</small><strong>Resolved Template</strong></div></div>
    <section id="prototype-inheritance"><span class="pp-section-number">01</span><h2>Inherit a Template</h2><p><InlineText text={props.content.inheritanceIntro} /></p><Code text={props.content.inheritanceExample} name="secure-backend.atomize.yaml" /><button class="pp-inline-link" onClick={() => { setSchemaField("#template.extends"); openSchema(); }}>Explore the extends field <span>↗</span></button></section>
    <section id="prototype-mixins"><span class="pp-section-number">02</span><h2>Add reusable task groups</h2><p>{props.content.mixinIntro}</p><Code text={props.content.mixinExample} name="feature-with-checks.atomize.yaml" /><button class="pp-inline-link" onClick={() => { setSchemaField("#template.mixins"); openSchema(); }}>Explore the mixins field <span>↗</span></button></section>
    <section id="prototype-resolution"><span class="pp-section-number">03</span><h2>Understand resolution order</h2><ol class="pp-steps"><For each={props.content.resolution}>{item => <li>{item.replaceAll("`", "")}</li>}</For></ol><div class="pp-callout"><strong>See the whole picture</strong><p>Inspect the Resolved Template before generating Tasks.</p><code>atomize template resolve &lt;template&gt;</code></div></section>
    <footer class="pp-article-footer"><a href={`${github}/edit/main/docs/Template-Reference.md`}>Edit this guide ↗</a><span>Source: canonical Template Reference</span></footer>
  </article>;
  const Schema = () => <SchemaReference trees={props.trees} versionLabel={props.versionLabel} syncUrl={false} permalink={schemaField()} guideUrl={() => "#prototype-inheritance"} openExternalLink={() => goTopic("inheritance")} />;

  // A: persistent tree + article + contents, closest to Starlight's familiar structure.
  const VariantA = () => <div class="pp-variant-a"><header class="pp-header"><Brand /><SearchButton /><Utilities /></header><Notice /><div class="pp-a-layout"><aside class="pp-sidebar" classList={{ "pp-mobile-open": menuOpen() }}><Navigation /></aside><Show when={mode() === "guide"} fallback={<div class="pp-full-schema"><button class="pp-back" onClick={() => goTopic("overview")}>← Back to composition</button><Schema /></div>}><Article /><Contents /></Show></div></div>;
  // B: topic navigation above a wide reading column; field reference is a temporary drawer.
  const VariantB = () => <div class="pp-variant-b"><header class="pp-header"><Brand /><nav class="pp-top-navigation"><button onClick={() => goTopic("overview")}>Learn</button><button onClick={openSchema}>Reference</button><a href={`${github}/releases`}>Releases ↗</a></nav><SearchButton /><Utilities /></header><Notice /><div class="pp-topic-bar"><span>Template Reference</span><For each={topics}>{t => <button classList={{ active: activeTopic() === t.id }} onClick={() => goTopic(t.id)}>{t.id === "overview" ? "Composition" : t.id === "inheritance" ? "Inheritance" : t.id === "mixins" ? "Mixins" : "Resolution"}</button>}</For></div><div class="pp-b-layout"><div class="pp-reading-marker"><span>THE TEMPLATE HANDBOOK</span><span>01 — COMPOSITION</span></div><Article /><div class="pp-b-aside"><p class="pp-eyebrow">A RECIPE, NOT A ONE-OFF</p><h2>Keep the shared parts shared.</h2><p>Build a library your whole team can use. Compose the pieces that fit each Story.</p><button onClick={openSchema}>Look up a field ↗</button><Contents /></div></div><Show when={menuOpen()}><div class="pp-mobile-navigation"><Navigation /></div></Show><Show when={schemaOpen()}><div class="pp-drawer-shade" onClick={() => setSchemaOpen(false)} /><aside class="pp-schema-drawer" aria-label="Schema Reference"><div class="pp-pane-heading"><strong>Field reference</strong><button onClick={() => setSchemaOpen(false)}>Close ×</button></div><Schema /></aside></Show></div>;
  // C: compact project-style rail + two independent reading panes, guide and actual viewer.
  const VariantC = () => <div class="pp-variant-c"><header class="pp-header"><Brand /><div class="pp-workspace-title">Template Reference <span>/</span> Composition</div><SearchButton /><Utilities /></header><Notice /><div class="pp-c-layout"><aside class="pp-workbench-nav" classList={{ "pp-mobile-open": menuOpen() }}><span class="pp-nav-label">EXPLORE</span><button classList={{ selected: mode() === "guide" }} onClick={() => goTopic("overview")}>◫<span>Guide</span></button><button classList={{ selected: mode() === "schema" }} onClick={openSchema}>⌘<span>Schema</span></button><a href={`${github}/blob/main/docs/README.md`}>↗<span>All docs</span></a></aside><div class="pp-guide-pane"><div class="pp-pane-heading"><span>01 / GUIDE</span><span>Composition</span></div><Article /></div><aside class="pp-schema-pane"><div class="pp-pane-heading"><span>02 / FIELD REFERENCE</span><span>Live schema · main</span></div><Schema /></aside></div></div>;

  return <Show when={variant()}><div class="portal-prototype" data-variant={variant()}>
    <a class="pp-skip" href="#prototype-overview">Skip to guide</a>
    <Switch><Match when={variant() === "A"}><VariantA /></Match><Match when={variant() === "B"}><VariantB /></Match><Match when={variant() === "C"}><VariantC /></Match></Switch>
    <Show when={searchOpen()}><div class="pp-search-shade" onClick={() => setSearchOpen(false)} /><section class="pp-search-dialog" role="dialog" aria-modal="true" aria-label="Search prototype documentation"><label>Search this guide<input type="search" placeholder="Try inheritance or Mixins…" value={query()} onInput={event => setQuery(event.currentTarget.value)} /></label><div><For each={topics.filter(t => `${t.title} ${t.detail}`.toLowerCase().includes(query().toLowerCase()))}>{t => <button onClick={() => goTopic(t.id)}><strong>{t.title}</strong><span>{t.detail} →</span></button>}</For><Show when={"schema reference fields".includes(query().toLowerCase())}><button onClick={() => { setSearchOpen(false); openSchema(); }}><strong>Schema Reference</strong><span>Browse the actual field viewer →</span></button></Show><Show when={topics.every(t => !`${t.title} ${t.detail}`.toLowerCase().includes(query().toLowerCase())) && !"schema reference fields".includes(query().toLowerCase())}><p>No matching prototype pages.</p></Show></div><button class="pp-search-close" onClick={() => setSearchOpen(false)}>Close · Esc</button></section></Show>
    <PrototypeSwitcher current={variant()} change={chooseVariant} state={`${variant()} · ${prototypeVariants.find(v => v.key === variant())?.description} | ${theme()} | ${mode()}${schemaOpen() ? " + field drawer" : ""} | ${activeTopic()}${searchOpen() ? ` | search: ${query() || "(empty)"}` : ""}`} />
  </div></Show>;
}
