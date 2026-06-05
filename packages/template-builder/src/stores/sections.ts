import { createStore } from "solid-js/store";

export type SectionId = "basic-info" | "filter" | "estimation" | "validation" | "metadata";
export type Errors = Partial<Record<string, string>>;

export const SECTION_META: { id: SectionId; label: string; description: string }[] = [
  { id: "basic-info", label: "Basic Info",  description: "Name the template and add the metadata people need before using it." },
  { id: "filter",     label: "Filter",      description: "Define which Azure DevOps work items this template can apply to."   },
  { id: "estimation", label: "Estimation",  description: "Map story estimates into generated task estimates."                 },
  { id: "validation", label: "Validation",  description: "Set the guardrails that keep generated tasks within expected bounds." },
  { id: "metadata",   label: "Metadata",    description: "Add classification and guidance for template discovery and review." },
];

export function makeBasicInfo() {
  const [fields, set] = createStore({ name: "", description: "", author: "", tags: [] as string[], version: "1.0" });
  const [errors, setErrors] = createStore<Errors>({});
  const validate = () => setErrors("name", fields.name.trim() === "" ? "Name is required" : undefined);
  const isValid  = () => !errors.name && fields.name.trim() !== "";
  return { fields, set, errors, validate, isValid };
}

export function makeFilter() {
  const [fields, set] = createStore({
    filterMode:       "build" as "build" | "query",
    workItemTypes:    [] as string[],
    states:           [] as string[],
    statesExclude:    [] as string[],
    areaPaths:        [] as string[],
    iterations:       [] as string[],
    tagsInclude:      [] as string[],
    tagsExclude:      [] as string[],
    excludeIfHasTasks: true,
    assignedTo:       [] as string[],
    savedQueryIds:    [] as string[],
  });
  const errors: Errors = {};
  return { fields, set, errors, validate: () => {}, isValid: () => true };
}

export function makeEstimation() {
  const [fields, set] = createStore({ strategy: "percentage", source: "", rounding: "none", minimumTaskPoints: "" });
  const errors: Errors = {};
  return { fields, set, errors, validate: () => {}, isValid: () => true };
}

export function makeValidation() {
  const [fields, set] = createStore({ mode: "", totalEstimationMustBe: "", minTasks: "", maxTasks: "" });
  const [errors, setErrors] = createStore<Errors>({});
  function validate() {
    const v = fields.totalEstimationMustBe;
    setErrors(
      "totalEstimationMustBe",
      v !== "" && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100) ? "Must be 0–100" : undefined,
    );
  }
  const isValid = () => !errors.totalEstimationMustBe;
  return { fields, set, errors, validate, isValid };
}

export function makeMetadata() {
  const [fields, set] = createStore({ category: "", difficulty: "", estimationGuidelines: "" });
  const errors: Errors = {};
  return { fields, set, errors, validate: () => {}, isValid: () => true };
}

export type BasicInfoStore  = ReturnType<typeof makeBasicInfo>;
export type FilterStore     = ReturnType<typeof makeFilter>;
export type EstimationStore = ReturnType<typeof makeEstimation>;
export type ValidationStore = ReturnType<typeof makeValidation>;
export type MetadataStore   = ReturnType<typeof makeMetadata>;

export function useSectionStores() {
  return {
    "basic-info": makeBasicInfo(),
    filter:       makeFilter(),
    estimation:   makeEstimation(),
    validation:   makeValidation(),
    metadata:     makeMetadata(),
  };
}

export type SectionStores = ReturnType<typeof useSectionStores>;
