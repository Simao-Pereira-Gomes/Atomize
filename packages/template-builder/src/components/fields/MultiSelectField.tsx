import { Combobox } from "@kobalte/core";
import { For, Show } from "solid-js";

export function MultiSelectField(props: {
  label: string;
  selected: string[];
  options: string[];
  placeholder?: string;
  onChange: (v: string[]) => void;
}) {
  const showSummary = () => props.selected.length > 2;

  return (
    <div class="ui-field">
      <div class="ui-label">{props.label}</div>
      <Combobox.Root<string>
        multiple
        options={props.options}
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
          {(state) => (
            <>
              <div class="sk-combobox-value">
                <Show when={showSummary()}>
                  <span class="sk-combobox-summary">
                    <span class="sk-combobox-count">{props.selected.length}</span>
                    <span>selected</span>
                  </span>
                </Show>
                <Show when={!showSummary()}>
                  <For each={state.selectedOptions()}>
                    {(option) => (
                      <span class="ms-chip">
                        {option}
                        <button
                          class="ms-chip-remove"
                          type="button"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={(e) => { e.stopPropagation(); state.remove(option); }}
                        >
                          ×
                        </button>
                      </span>
                    )}
                  </For>
                </Show>
                <Combobox.Input class="sk-combobox-input" />
              </div>
              <Show when={props.selected.length > 0}>
                <button
                  class="sk-combobox-clear"
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); state.clear(); }}
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
    </div>
  );
}
