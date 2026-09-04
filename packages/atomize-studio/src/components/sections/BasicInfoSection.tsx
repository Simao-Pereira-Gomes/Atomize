import type { BasicInfoStore } from "../../stores/sections";
import { TagChipInput, TextareaField, TextField } from "../fields";

export function BasicInfoSection(props: { store: BasicInfoStore }) {
  const s = props.store;
  return (
    <>
      <TextField
        label="Name" value={s.fields.name} error={s.errors.name} required
        onInput={(v) => { s.set("name", v); s.validate(); }} onBlur={s.validate} placeholder="My Template"
      />
      <TextareaField
        label="Description" value={s.fields.description}
        onInput={(v) => s.set("description", v)} placeholder="What this template is for…"
      />
      <TextField
        label="Category" value={s.fields.category}
        onInput={(v) => s.set("category", v)} placeholder="Frontend"
      />
      <TextField
        label="Author" value={s.fields.author}
        onInput={(v) => s.set("author", v)} placeholder="Team or person"
      />
      <TagChipInput
        label="Tags" value={s.fields.tags}
        onChange={(v) => s.set("tags", v)} placeholder="frontend, react…"
      />
      <TextField
        label="Version" value={s.fields.version}
        onInput={(v) => s.set("version", v)}
      />
    </>
  );
}
