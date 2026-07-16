import { createSignal, type ParentProps, Show } from "solid-js";
import {
  AREA_PATHS, ASSIGNEES, ITERATIONS, SAVED_QUERIES, STATES, WORK_ITEM_TYPES,
} from "../../data/mock-platform-data";
import type { FilterStore } from "../../stores/sections";
import { MultiSelectField, SelectField, TagChipInput, ToggleField } from "../fields";

function FilterModeToggle(props: { mode: "build" | "query"; onChange: (m: "build" | "query") => void }) {
  return (
    <div class="ui-field">
      <div class="ui-label">Filter method</div>
      <div class="mode-toggle">
        <button type="button" class={`mode-btn${props.mode === "build" ? " mode-btn--active" : ""}`}
          onClick={() => props.onChange("build")}>Build filter</button>
        <button type="button" class={`mode-btn${props.mode === "query" ? " mode-btn--active" : ""}`}
          onClick={() => props.onChange("query")}>Use saved query</button>
      </div>
    </div>
  );
}

function FilterGroup(props: ParentProps<{ title: string; description: string }>) {
  return (
    <section class="filter-group">
      <div class="filter-group-header">
        <h3>{props.title}</h3>
        <p>{props.description}</p>
      </div>
      <div class="filter-group-fields">{props.children}</div>
    </section>
  );
}

export function FilterSection(props: { store: FilterStore }) {
  const f = props.store;

  const hasSecondaryValues = () =>
    f.fields.statesExclude.length > 0 ||
    f.fields.tagsInclude.length > 0 ||
    f.fields.tagsExclude.length > 0 ||
    f.fields.assignedTo.length > 0;

  const [showMore, setShowMore] = createSignal(false);
  const showSecondary = () => showMore() || hasSecondaryValues();

  return (
    <>
      <FilterModeToggle mode={f.fields.filterMode} onChange={(m) => f.set("filterMode", m)} />

      <Show when={f.fields.filterMode === "build"}>
        <FilterGroup
          title="Primary match rules"
          description="Start with the fields teams use most often to decide whether a template applies."
        >
          <MultiSelectField label="Work Item Types"
            selected={f.fields.workItemTypes} options={WORK_ITEM_TYPES}
            placeholder="All types" onChange={(v) => f.set("workItemTypes", v)} />
          <MultiSelectField label="States"
            selected={f.fields.states} options={STATES}
            placeholder="All states" onChange={(v) => f.set("states", v)} />
          <MultiSelectField label="Area Paths"
            selected={f.fields.areaPaths} options={AREA_PATHS}
            placeholder="All areas" onChange={(v) => f.set("areaPaths", v)} />
          <MultiSelectField label="Sprint / Iteration"
            selected={f.fields.iterations} options={ITERATIONS}
            placeholder="All iterations" onChange={(v) => f.set("iterations", v)} />
          <ToggleField
            label="Exclude stories that already have tasks"
            description="Keeps the template from generating duplicate task sets for already-expanded stories."
            checked={f.fields.excludeIfHasTasks}
            onChange={(v) => f.set("excludeIfHasTasks", v)}
          />
        </FilterGroup>

        <Show when={!showSecondary()}>
          <button type="button" class="more-filters-btn" onClick={() => setShowMore(true)}>
            <span class="more-filters-label">+ 4 more filters</span>
            <span class="more-filters-hint">Exclude states · Tags · Assigned to</span>
          </button>
        </Show>

        <Show when={showSecondary()}>
          <FilterGroup
            title="Advanced filters"
            description="Narrow the match set when a team has extra process rules."
          >
            <MultiSelectField label="Exclude states"
              selected={f.fields.statesExclude} options={STATES}
              placeholder="None excluded" onChange={(v) => f.set("statesExclude", v)} />
            <TagChipInput label="Tags — include"
              value={f.fields.tagsInclude} placeholder="backend, needs-testing…"
              onChange={(v) => f.set("tagsInclude", v)} />
            <TagChipInput label="Tags — exclude"
              value={f.fields.tagsExclude} placeholder="wont-fix, skip…"
              onChange={(v) => f.set("tagsExclude", v)} />
            <MultiSelectField label="Assigned to"
              selected={f.fields.assignedTo} options={ASSIGNEES}
              placeholder="Anyone" onChange={(v) => f.set("assignedTo", v)} />
          </FilterGroup>
        </Show>
      </Show>

      <Show when={f.fields.filterMode === "query"}>
        <p class="ui-hint">
          Select a saved query from Azure DevOps. The query path is shown for readability;
          the query ID will be stamped in the YAML.
        </p>
        <SelectField
          label="Saved query"
          value={f.fields.savedQueryIds[0] ?? ""}
          options={SAVED_QUERIES.map((query) => ({ value: query.id, label: query.path }))}
          onInput={(id) => f.set("savedQueryIds", id === "" ? [] : [id])}
        />
      </Show>
    </>
  );
}
