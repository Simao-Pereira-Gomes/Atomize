import { Switch } from "@kobalte/core";
import { Show } from "solid-js";
import { SchemaInfo } from "../schema-reference-navigation";

export function ToggleField(props: {
  label: string;
  schemaPath?: string;
  checked: boolean;
  description?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <Switch.Root class="ui-field sk-switch-row" checked={props.checked} onChange={props.onChange}>
      <Switch.Input />
      <Switch.Control class="sk-switch-control">
        <Switch.Thumb class="sk-switch-thumb" />
      </Switch.Control>
      <div class="sk-switch-copy">
        <div class="flex items-center gap-2"><Switch.Label class="sk-switch-label">{props.label}</Switch.Label><SchemaInfo path={props.schemaPath} label={props.label} /></div>
        <Show when={props.description}>
          <Switch.Description class="sk-switch-description">{props.description}</Switch.Description>
        </Show>
      </div>
    </Switch.Root>
  );
}
