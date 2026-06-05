import type { EstimationStore } from "../../stores/sections";
import { LockedField, SelectField, TextField } from "../fields";

export function EstimationSection(props: { store: EstimationStore }) {
  const s = props.store;
  return (
    <>
      <LockedField
        label="Strategy"
        value="Percentage"
        note="Only percentage-based estimation is supported in this version."
      />
      <TextField
        label="Source field" value={s.fields.source}
        onInput={(v) => s.set("source", v)} placeholder="story-points"
      />
      <SelectField
        label="Rounding" value={s.fields.rounding}
        options={[
          { value: "none",    label: "None"    },
          { value: "nearest", label: "Nearest" },
          { value: "up",      label: "Up"      },
          { value: "down",    label: "Down"    },
        ]}
        onInput={(v) => s.set("rounding", v)}
      />
      <TextField
        label="Minimum task points" value={s.fields.minimumTaskPoints}
        onInput={(v) => s.set("minimumTaskPoints", v)} placeholder="0"
      />
    </>
  );
}
