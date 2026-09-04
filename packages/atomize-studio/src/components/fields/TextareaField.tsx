import { createUniqueId } from "solid-js";

export function TextareaField(props: {
  label: string;
  value: string;
  placeholder?: string;
  onInput: (v: string) => void;
}) {
  const id = createUniqueId();

  return (
    <div class="ui-field">
      <label class="ui-label" for={id}>{props.label}</label>
      <textarea
        id={id}
        class="ui-textarea"
        placeholder={props.placeholder}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      >
        {props.value}
      </textarea>
    </div>
  );
}
