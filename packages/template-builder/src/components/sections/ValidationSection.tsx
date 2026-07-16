import type { ValidationStore } from "../../stores/sections";
import { SelectField, TextField } from "../fields";

const VALIDATION_MODES = ["", "strict", "lenient"] as const;
type ValidationModeValue = (typeof VALIDATION_MODES)[number];

function isValidationModeValue(value: string): value is ValidationModeValue {
  return VALIDATION_MODES.includes(value as ValidationModeValue);
}

export function ValidationSection(props: { store: ValidationStore }) {
  const s = props.store;
  return (
    <>
      <SelectField
        label="Mode" value={s.fields.mode}
        options={[
          { value: "",        label: "— inherit —" },
          { value: "strict",  label: "Strict"      },
          { value: "lenient", label: "Lenient"      },
        ]}
        onInput={(v) => {
          if (isValidationModeValue(v)) s.set("mode", v);
        }}
      />
      <TextField
        label="Total estimation must be (%)" value={s.fields.totalEstimationMustBe}
        error={s.errors.totalEstimationMustBe}
        onInput={(v) => s.set("totalEstimationMustBe", v)}
        onBlur={s.validate} placeholder="100"
      />
      <TextField
        label="Min tasks" value={s.fields.minTasks}
        onInput={(v) => s.set("minTasks", v)} placeholder="1"
      />
      <TextField
        label="Max tasks" value={s.fields.maxTasks}
        onInput={(v) => s.set("maxTasks", v)} placeholder="20"
      />
    </>
  );
}
