import { Combobox } from "@kobalte/core";
import { createUniqueId, For, Show } from "solid-js";
import { SEARCHABLE_OPTIONS_THRESHOLD, shouldAddCustomValue } from "./multi-select-utils";

export function MultiSelectField(props: {
  label: string;
  selected: string[];
  options: string[];
  placeholder?: string;
  allowCustom?: boolean;
  onChange: (v: string[]) => void;
}) {
  const summaryTriggerId = createUniqueId();

  const showSummary = () => props.selected.length > 2;
  const isSearchable = () => props.options.length > SEARCHABLE_OPTIONS_THRESHOLD;
  const inputPlaceholder = () => isSearchable()
    ? `Search ${props.label.toLowerCase()}…`
    : props.placeholder ?? "None selected";
  // Feed the listbox every selected value, so custom entries and grounded values
  // that aren't in `options` still show up (checked) when the dropdown is opened.
  // Kobalte drops any selected value it can't find here — both from the rendered
  // list and from its `onChange` payload — so this also keeps them selectable.
  const listOptions = () => {
    const extras = props.selected.filter((value) => !props.options.includes(value));
    return extras.length ? [...props.options, ...extras] : props.options;
  };
  const addCustom = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !props.selected.includes(trimmed)) props.onChange([...props.selected, trimmed]);
  };
  const removeValue = (value: string) => props.onChange(props.selected.filter((v) => v !== value));

  return (
    <div class="ui-field">
      <div class="ui-label">{props.label}</div>
      <Combobox.Root<string>
        multiple
        options={listOptions()}
        value={props.selected}
        onChange={props.onChange}
        defaultFilter="contains"
        triggerMode="focus"
        closeOnSelection={false}
        selectionBehavior="toggle"
        removeOnBackspace
        placeholder={props.placeholder ?? "None selected"}
        itemComponent={(itemProps) => (
          <Combobox.Item item={itemProps.item} class="sk-command-item">
            <Combobox.ItemIndicator class="sk-command-check">✓</Combobox.ItemIndicator>
            <Combobox.ItemLabel>{itemProps.item.rawValue}</Combobox.ItemLabel>
          </Combobox.Item>
        )}
      >
        <Combobox.Control<string> class="sk-combobox-control">
          {() => (
            <>
              <div class="sk-combobox-value">
                <Show
                  when={showSummary()}
                  fallback={
                    <For each={props.selected}>
                      {(value) => (
                        <span class="ms-chip">
                          {value}
                          <button
                            class="ms-chip-remove"
                            type="button"
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={(e) => { e.stopPropagation(); removeValue(value); }}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </For>
                  }
                >
                  <Combobox.Trigger
                    id={summaryTriggerId}
                    class="sk-combobox-summary"
                    aria-label={`Toggle the ${props.selected.length} selected ${props.label.toLowerCase()}`}
                  >
                    <span class="sk-combobox-count">{props.selected.length}</span>
                    <span>selected</span>
                  </Combobox.Trigger>
                </Show>
                <Combobox.Input
                  class="sk-combobox-input"
                  aria-label={isSearchable() ? `Search ${props.label.toLowerCase()}` : props.label}
                  placeholder={inputPlaceholder()}
                  onKeyDown={(event) => {
                    if (!props.allowCustom || event.key !== "Enter") return;
                    const value = event.currentTarget.value;
                    if (!shouldAddCustomValue(value, props.options)) return;
                    event.preventDefault();
                    addCustom(value);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <Show when={props.selected.length > 0}>
                <button
                  class="sk-combobox-clear"
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); props.onChange([]); }}
                >
                  Clear
                </button>
              </Show>
              <Combobox.Trigger class="sk-combobox-trigger-button">
                <Combobox.Icon class="sk-combobox-icon">⌄</Combobox.Icon>
              </Combobox.Trigger>
            </>
          )}
        </Combobox.Control>
        <Combobox.Portal>
          <Combobox.Content class="sk-combobox-content">
            <Combobox.Listbox<string> class="sk-command-list" />
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox.Root>
      <Show when={isSearchable()}>
        <p class="ui-hint"><span aria-hidden="true">💡</span> Search the available {props.label.toLowerCase()}, or press Enter to add a value with no match.</p>
      </Show>
    </div>
  );
}
