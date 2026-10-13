import type { MetadataStore } from "../../stores/sections";
import { TextareaField } from "../fields";

export function MetadataSection(props: { store: MetadataStore }) {
  const s = props.store;
  return (
    <>
      <TextareaField
        label="Estimation guidelines" schemaPath="metadata.estimationGuidelines" value={s.fields.estimationGuidelines}
        onInput={(v) => s.set("estimationGuidelines", v)}
        placeholder="Guidance on how to estimate stories before using this template…"
      />
      <TextareaField
        label="Template notes" schemaPath="metadata.notes" value={s.fields.notes}
        onInput={(v) => s.set("notes", v)}
        placeholder="Optional context for template authors and maintainers…"
      />
    </>
  );
}
