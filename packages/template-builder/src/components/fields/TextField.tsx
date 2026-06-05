import { createUniqueId, Show } from "solid-js";

export function TextField(props: {
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  required?: boolean;
  onInput: (v: string) => void;
  onBlur?: () => void;
}) {
  const id = createUniqueId();

  return (
    <div class="ui-field">
      <label class="ui-label" for={id}>
        {props.label}
        <Show when={props.required}><span class="ui-required"> *</span></Show>
      </label>
      <input
        id={id}
        class={`ui-input${props.error ? " ui-input--error" : ""}`}
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onBlur={props.onBlur}
      />
      <Show when={props.error}><p class="ui-error">{props.error}</p></Show>
    </div>
  );
}
