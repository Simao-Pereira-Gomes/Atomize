import type { MetadataStore } from "../../stores/sections";
import { SelectField, TextareaField, TextField } from "../fields";

const DIFFICULTY_VALUES = ["", "beginner", "intermediate", "advanced"] as const;
type DifficultyValue = (typeof DIFFICULTY_VALUES)[number];

function isDifficultyValue(value: string): value is DifficultyValue {
  return DIFFICULTY_VALUES.includes(value as DifficultyValue);
}

export function MetadataSection(props: { store: MetadataStore }) {
  const s = props.store;
  return (
    <>
      <TextField
        label="Category" value={s.fields.category}
        onInput={(v) => s.set("category", v)} placeholder="Frontend"
      />
      <SelectField
        label="Difficulty" value={s.fields.difficulty}
        options={[
          { value: "",             label: "— none —"      },
          { value: "beginner",     label: "Beginner"      },
          { value: "intermediate", label: "Intermediate"  },
          { value: "advanced",     label: "Advanced"      },
        ]}
        onInput={(v) => {
          if (isDifficultyValue(v)) s.set("difficulty", v);
        }}
      />
      <TextareaField
        label="Estimation guidelines" value={s.fields.estimationGuidelines}
        onInput={(v) => s.set("estimationGuidelines", v)}
        placeholder="Guidance on how to estimate stories before using this template…"
      />
    </>
  );
}
