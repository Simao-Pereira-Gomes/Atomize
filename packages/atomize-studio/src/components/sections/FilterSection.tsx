import { Combobox } from "@kobalte/core";
import { createSignal, createUniqueId, type ParentProps, Show } from "solid-js";
import {
  statesForTypes,
} from "../../grounding/grounding-service";
import type { FilterStore } from "../../stores/sections";
import { MultiSelectField, TagChipInput, ToggleField } from "../fields";
import type { GroundingSession } from "../GroundingSettings";

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

const SEARCHABLE_OPTIONS_THRESHOLD = 6;

type GroundedOption = { value: string; label: string };

function GroundedTextField(props: { label: string; value: string; options: GroundedOption[]; placeholder: string; onInput: (value: string) => void }) {
  const id = createUniqueId();
  const listId = `${id}-options`;
  const selectedLabel = () => props.options.find((option) => option.value === props.value)?.label;
  const selectedOption = () => props.options.find((option) => option.value === props.value) ?? null;
  const isSearchable = () => props.options.length > SEARCHABLE_OPTIONS_THRESHOLD;
  const updateValue = (input: string) => {
    const selected = props.options.find((option) => option.label === input);
    props.onInput(selected?.value ?? input);
  };
  return (
    <div class="ui-field">
      <label class="ui-label" for={id}>{props.label}</label>
      <Show
        when={isSearchable()}
        fallback={<>
          <input id={id} class="ui-input" list={listId} value={selectedLabel() ?? props.value} placeholder={props.placeholder} onInput={(event) => updateValue(event.currentTarget.value)} />
          <datalist id={listId}>{props.options.map((option) => <option value={option.label} />)}</datalist>
        </>}
      >
        <Combobox.Root<GroundedOption>
          options={props.options}
          value={selectedOption()}
          optionValue="value"
          optionTextValue="label"
          optionLabel="label"
          defaultFilter="contains"
          triggerMode="focus"
          onChange={(option) => props.onInput(option?.value ?? "")}
          itemComponent={(itemProps) => (
            <Combobox.Item item={itemProps.item} class="sk-command-item">
              <Combobox.ItemLabel>{itemProps.item.rawValue.label}</Combobox.ItemLabel>
            </Combobox.Item>
          )}
        >
          <Combobox.Control class="sk-combobox-control">
            <Combobox.Input
              id={id}
              class="sk-combobox-input"
              placeholder={`Search ${props.label.toLowerCase()}…`}
              onBlur={(event) => window.setTimeout(() => updateValue(event.currentTarget.value))}
            />
            <Combobox.Trigger class="sk-combobox-trigger-button" aria-label={`Show ${props.label.toLowerCase()}`}>
              <Combobox.Icon class="sk-combobox-icon">⌄</Combobox.Icon>
            </Combobox.Trigger>
          </Combobox.Control>
          <Combobox.Portal>
            <Combobox.Content class="sk-combobox-content">
              <Combobox.Listbox<GroundedOption> class="sk-command-list" />
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox.Root>
      </Show>
    </div>
  );
}

export function FilterSection(props: { store: FilterStore; grounding: GroundingSession }) {
  const f = props.store;
  const options = () => props.grounding.options();
  const stateOptions = () => statesForTypes(options(), f.fields.workItemTypes);

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
            selected={f.fields.workItemTypes} options={options()?.workItemTypes ?? []} allowCustom
            placeholder="All types — type to add" onChange={(v) => f.set("workItemTypes", v)} />
          <MultiSelectField label="States"
            selected={f.fields.states} options={stateOptions()} allowCustom
            placeholder="All states — type to add" onChange={(v) => f.set("states", v)} />
          <GroundedTextField label="Team" value={f.fields.team} options={(options()?.teams ?? []).map((team) => ({ value: team, label: team }))} placeholder="Profile default or team name" onInput={(v) => f.set("team", v)} />
          <MultiSelectField label="Area Paths"
            selected={f.fields.areaPaths} options={options()?.areaPaths ?? []} allowCustom
            placeholder="All areas — type to add" onChange={(v) => f.set("areaPaths", v)} />
          <MultiSelectField label="Sprint / Iteration"
            selected={f.fields.iterations} options={options()?.iterationPaths ?? []} allowCustom
            placeholder="All iterations — type to add" onChange={(v) => f.set("iterations", v)} />
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
              selected={f.fields.statesExclude} options={stateOptions()} allowCustom
              placeholder="None excluded — type to add" onChange={(v) => f.set("statesExclude", v)} />
            <TagChipInput label="Tags — include"
              value={f.fields.tagsInclude} placeholder="backend, needs-testing…"
              onChange={(v) => f.set("tagsInclude", v)} />
            <TagChipInput label="Tags — exclude"
              value={f.fields.tagsExclude} placeholder="wont-fix, skip…"
              onChange={(v) => f.set("tagsExclude", v)} />
            <MultiSelectField label="Assigned to"
              selected={f.fields.assignedTo} options={[]} allowCustom
              placeholder="Anyone — type to add" onChange={(v) => f.set("assignedTo", v)} />
          </FilterGroup>
        </Show>
      </Show>

      <Show when={f.fields.filterMode === "query"}>
        <p class="ui-hint">Choose a grounded saved query or enter its Azure DevOps ID manually. The ID is stamped in YAML.</p>
        <GroundedTextField label="Saved query" value={f.fields.savedQueryIds[0] ?? ""} options={(options()?.savedQueries ?? []).map((query) => ({ value: query.id, label: query.path }))} placeholder="Saved query ID" onInput={(id) => { f.set("savedQueryIds", id === "" ? [] : [id]); f.validate(); }} />
        <Show when={f.errors.savedQueryIds}><p class="ui-error">{f.errors.savedQueryIds}</p></Show>
      </Show>
    </>
  );
}
