import { Combobox } from "@kobalte/core";
import { createMemo, createUniqueId, Show } from "solid-js";

export type SearchableOption = { value: string; label: string; description?: string };

/** A single-choice select whose options can be filtered by typing; only listed options can be chosen. */
export function SearchableSelectField(props: {
  label: string;
  value: string;
  options: SearchableOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Offers a Clear button that resets the value to "" (nothing chosen). */
  clearable?: boolean;
  onChange: (value: string) => void;
}) {
  const id = createUniqueId();
  const selected = createMemo(() => props.options.find((option) => option.value === props.value) ?? null);

  return (
    <div class="ui-field">
      <label class="ui-label" for={id}>{props.label}</label>
      <Combobox.Root<SearchableOption>
        options={props.options}
        value={selected()}
        optionValue="value"
        optionTextValue={(option) => `${option.label} ${option.description ?? ""}`}
        optionLabel="label"
        defaultFilter="contains"
        triggerMode="focus"
        disabled={props.disabled}
        onChange={(option) => {
          if (option) props.onChange(option.value);
        }}
        itemComponent={(itemProps) => (
          <Combobox.Item item={itemProps.item} class="sk-command-item">
            <Combobox.ItemLabel>{itemProps.item.rawValue.label}</Combobox.ItemLabel>
            <Show when={itemProps.item.rawValue.description}>
              <Combobox.ItemDescription class="block text-xs text-slate-500">{itemProps.item.rawValue.description}</Combobox.ItemDescription>
            </Show>
          </Combobox.Item>
        )}
      >
        <Combobox.Control class={`sk-combobox-control${props.error ? " ui-input--error" : ""}`}>
          {/* Selecting the shown value on focus lets typing replace it to search, not append to it. */}
          <Combobox.Input id={id} class="sk-combobox-input" placeholder={props.placeholder ?? `Search ${props.label.toLowerCase()}…`} onFocus={(event) => event.currentTarget.select()} />
          <Show when={props.clearable && props.value && !props.disabled}>
            <button
              class="sk-combobox-clear"
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); props.onChange(""); }}
            >
              Clear
            </button>
          </Show>
          <Combobox.Trigger class="sk-combobox-trigger-button" aria-label={`Show ${props.label.toLowerCase()}`}>
            <Combobox.Icon class="sk-combobox-icon">⌄</Combobox.Icon>
          </Combobox.Trigger>
        </Combobox.Control>
        <Combobox.Portal>
          <Combobox.Content class="sk-combobox-content">
            <Combobox.Listbox<SearchableOption> class="sk-command-list" />
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox.Root>
      <Show when={props.error}><p class="ui-error">{props.error}</p></Show>
    </div>
  );
}
