import { createUniqueId } from "solid-js";
import { SchemaInfo } from "../schema-reference-navigation";

export function TextareaField(props: {
  label: string;
  schemaPath?: string;
  value: string;
  placeholder?: string;
  onInput: (v: string) => void;
}) {
  const id = createUniqueId();

  return (
    <div class="ui-field">
      <div class="flex items-center gap-2"><label class="ui-label" for={id}>{props.label}</label><SchemaInfo path={props.schemaPath} label={props.label} /></div>
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
