import { Show } from "solid-js";
import type { EstimationStore } from "../../stores/sections";
import { LockedField, SelectField, TextField } from "../fields";

const ROUNDING_VALUES = ["none", "nearest", "up", "down"] as const;
const NO_ESTIMATION_VALUES = ["", "skip", "warn", "use-default"] as const;
type RoundingValue = (typeof ROUNDING_VALUES)[number];
type NoEstimationValue = (typeof NO_ESTIMATION_VALUES)[number];

function isRoundingValue(value: string): value is RoundingValue {
  return ROUNDING_VALUES.includes(value as RoundingValue);
}

function isNoEstimationValue(value: string): value is NoEstimationValue {
  return NO_ESTIMATION_VALUES.includes(value as NoEstimationValue);
}

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
        onInput={(v) => {
          if (isRoundingValue(v)) s.set("rounding", v);
        }}
      />
      <TextField
        label="Minimum task points" value={s.fields.minimumTaskPoints}
        error={s.errors.minimumTaskPoints}
        onInput={(v) => { s.set("minimumTaskPoints", v); s.validate(); }} onBlur={s.validate} placeholder="0"
      />
      <SelectField
        label="When the parent has no estimate" value={s.fields.ifParentHasNoEstimation}
        options={[
          { value: "", label: "— no special behaviour —" },
          { value: "skip", label: "Skip task generation" },
          { value: "warn", label: "Warn and continue" },
          { value: "use-default", label: "Use a default estimate" },
        ]}
        onInput={(v) => { if (isNoEstimationValue(v)) s.set("ifParentHasNoEstimation", v); }}
      />
      <Show when={s.fields.ifParentHasNoEstimation === "use-default"}>
        <TextField
          label="Default parent estimate" value={s.fields.defaultParentEstimation}
          error={s.errors.defaultParentEstimation}
          onInput={(v) => { s.set("defaultParentEstimation", v); s.validate(); }} onBlur={s.validate} placeholder="8"
        />
      </Show>
    </>
  );
}
