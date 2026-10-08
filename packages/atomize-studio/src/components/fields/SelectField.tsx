import { Select } from "@kobalte/core";
import { createMemo, Show } from "solid-js";

type SelectOption = { value: string; label: string };

export function SelectField(props: {
  label: string;
  value: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  /** Keeps the label for assistive technology without showing it, e.g. inside a table cell. */
  hideLabel?: boolean;
  onInput: (v: string) => void;
}) {
  const selected = createMemo(() => props.options.find((o) => o.value === props.value) ?? null);

  return (
    <div class="ui-field">
      <div class={props.hideLabel ? "sr-only" : "ui-label"}>{props.label}</div>
      <Select.Root<SelectOption>
        options={props.options}
        optionValue="value"
        optionTextValue="label"
        value={selected()}
        placeholder={props.placeholder ?? "Select an option"}
        onChange={(option) => props.onInput(option?.value ?? "")}
        itemComponent={(itemProps) => (
          <Select.Item item={itemProps.item} class="sk-select-item">
            <Select.ItemLabel>{itemProps.item.rawValue.label}</Select.ItemLabel>
            <Select.ItemIndicator class="sk-select-indicator">✓</Select.ItemIndicator>
          </Select.Item>
        )}
      >
        <Select.Trigger class={`sk-select-trigger${props.error ? " ui-input--error" : ""}`} aria-label={props.label}>
          <Select.Value<SelectOption>>
            {(state) => state.selectedOption()?.label ?? props.placeholder ?? "Select an option"}
          </Select.Value>
          <Select.Icon class="sk-select-icon">⌄</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content class="sk-select-content">
            <Select.Listbox class="sk-select-listbox" />
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <Show when={props.error}><p class="ui-error">{props.error}</p></Show>
    </div>
  );
}
