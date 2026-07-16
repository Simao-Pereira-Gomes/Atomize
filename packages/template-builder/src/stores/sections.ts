import {
  type EstimationConfig,
  type FilterCriteria,
  type Metadata,
  type TaskDefinition,
  type TaskTemplate,
  TaskTemplateSchema,
  type ValidationConfig,
} from "@sppg2001/atomize-schema";
import { createStore, reconcile } from "solid-js/store";
import { stringify } from "yaml";

export type SectionId = "basic-info" | "filter" | "tasks" | "estimation" | "validation" | "metadata" | "review";
export type AuthoringSectionId = Exclude<SectionId, "review">;
export type Errors = Partial<Record<string, string>>;

export const SECTION_META: { id: SectionId; label: string; description: string }[] = [
  { id: "basic-info", label: "Basic Info", description: "Name the template and add the metadata people need before using it." },
  { id: "filter", label: "Filter", description: "Define which Azure DevOps work items this template can apply to." },
  { id: "tasks", label: "Tasks", description: "Define the child work items this template generates." },
  { id: "estimation", label: "Estimation", description: "Map story estimates into generated task estimates." },
  { id: "validation", label: "Validation", description: "Set the guardrails that keep generated tasks within expected bounds." },
  { id: "metadata", label: "Metadata", description: "Add classification and guidance for template discovery and review." },
  { id: "review", label: "Review", description: "Review the completed Template and its Atomize YAML before saving." },
];

type BasicInfoFields = {
  name: string;
  description: string;
  author: string;
  tags: string[];
  version: string;
};

type BasicInfoAdvanced = Pick<TaskTemplate, "created" | "lastModified" | "extends" | "mixins" | "origin">;

type FilterFields = {
  filterMode: "build" | "query";
  workItemTypes: string[];
  states: string[];
  statesExclude: string[];
  areaPaths: string[];
  iterations: string[];
  tagsInclude: string[];
  tagsExclude: string[];
  excludeIfHasTasks: boolean;
  assignedTo: string[];
  savedQueryIds: string[];
};

type FilterAdvanced = Omit<
  FilterCriteria,
  | "workItemTypes"
  | "states"
  | "statesExclude"
  | "areaPaths"
  | "iterations"
  | "tags"
  | "excludeIfHasTasks"
  | "assignedTo"
  | "savedQuery"
>;

type TaskFields = {
  id: string;
  title: string;
  description: string;
  estimationPercent: string;
  tags: string[];
};

type EditableTask = {
  fields: TaskFields;
  advanced: Omit<TaskDefinition, keyof TaskFields | "estimationPercent">;
};

type TasksFields = {
  items: EditableTask[];
};

type EstimationFields = {
  strategy: "percentage";
  source: string;
  rounding: "none" | "nearest" | "up" | "down";
  minimumTaskPoints: string;
};

type EstimationAdvanced = Omit<EstimationConfig, keyof EstimationFields | "strategy" | "minimumTaskPoints">;

type ValidationFields = {
  mode: "" | "strict" | "lenient";
  totalEstimationMustBe: string;
  minTasks: string;
  maxTasks: string;
};

type ValidationAdvanced = Omit<ValidationConfig, "mode" | "totalEstimationMustBe" | "minTasks" | "maxTasks">;

type MetadataFields = {
  category: string;
  difficulty: "" | "beginner" | "intermediate" | "advanced";
  estimationGuidelines: string;
};

type MetadataAdvanced = Omit<Metadata, keyof MetadataFields>;

const defaultBasicInfo = (): BasicInfoFields => ({
  name: "",
  description: "",
  author: "",
  tags: [],
  version: "1.0",
});

const defaultFilter = (): FilterFields => ({
  filterMode: "build",
  workItemTypes: [],
  states: [],
  statesExclude: [],
  areaPaths: [],
  iterations: [],
  tagsInclude: [],
  tagsExclude: [],
  excludeIfHasTasks: true,
  assignedTo: [],
  savedQueryIds: [],
});

const defaultTask = (): EditableTask => ({
  fields: {
    id: "",
    title: "",
    description: "",
    estimationPercent: "",
    tags: [],
  },
  advanced: {},
});

const defaultTasks = (): TasksFields => ({
  items: [defaultTask()],
});

const defaultEstimation = (): EstimationFields => ({
  strategy: "percentage",
  source: "",
  rounding: "none",
  minimumTaskPoints: "",
});

const defaultValidation = (): ValidationFields => ({
  mode: "",
  totalEstimationMustBe: "",
  minTasks: "",
  maxTasks: "",
});

const defaultMetadata = (): MetadataFields => ({
  category: "",
  difficulty: "",
  estimationGuidelines: "",
});

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function nonEmptyArray<T>(value: T[]): T[] | undefined {
  return value.length > 0 ? value : undefined;
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : Number(trimmed);
}

function isNonNegativeNumber(value: string): boolean {
  const numeric = optionalNumber(value);
  return numeric === undefined || (!Number.isNaN(numeric) && numeric >= 0);
}

function isPercentage(value: string): boolean {
  const numeric = optionalNumber(value);
  return numeric === undefined || (!Number.isNaN(numeric) && numeric >= 0 && numeric <= 100);
}

function isNonNegativeInteger(value: string): boolean {
  const numeric = optionalNumber(value);
  return numeric === undefined || (Number.isInteger(numeric) && numeric >= 0);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clearErrors(errors: Errors, setErrors: (value: Errors) => void) {
  if (Object.keys(errors).length > 0) setErrors({});
}

function makeBasicInfo() {
  const [fields, set] = createStore(defaultBasicInfo());
  const [advanced, setAdvanced] = createStore<BasicInfoAdvanced>({});
  const [errors, setErrors] = createStore<Errors>({});
  const replace = (next: BasicInfoFields, nextAdvanced: BasicInfoAdvanced = {}) => {
    set(reconcile(next));
    setAdvanced(reconcile(nextAdvanced));
    clearErrors(errors, (value) => setErrors(reconcile(value)));
  };
  const validate = () => setErrors("name", fields.name.trim() === "" ? "Name is required" : undefined);
  const isValid = () => !errors.name && fields.name.trim() !== "";
  return { fields, set, advanced, setAdvanced, replace, errors, validate, isValid };
}

function makeFilter() {
  const [fields, set] = createStore(defaultFilter());
  const [advanced, setAdvanced] = createStore<FilterAdvanced>({});
  const [errors, setErrors] = createStore<Errors>({});
  const replace = (next: FilterFields, nextAdvanced: FilterAdvanced = {}) => {
    set(reconcile(next));
    setAdvanced(reconcile(nextAdvanced));
    clearErrors(errors, (value) => setErrors(reconcile(value)));
  };
  const validate = () => {
    setErrors(
      "savedQueryIds",
      fields.filterMode === "query" && fields.savedQueryIds.length !== 1 ? "Select exactly one saved query" : undefined,
    );
  };
  const isValid = () => fields.filterMode === "build" || fields.savedQueryIds.length === 1;
  return { fields, set, advanced, setAdvanced, replace, errors, validate, isValid };
}

function makeTasks() {
  const [fields, set] = createStore(defaultTasks());
  const [errors, setErrors] = createStore<Errors>({});
  const replace = (next: TasksFields) => {
    set(reconcile(next));
    clearErrors(errors, (value) => setErrors(reconcile(value)));
  };
  const addTask = () => set("items", fields.items.length, defaultTask());
  const removeTask = (index: number) => {
    set("items", (items) => (items.length <= 1 ? items : items.filter((_, i) => i !== index)));
  };
  const validate = () => {
    const nextErrors: Errors = {};
    fields.items.forEach((task, index) => {
      if (task.fields.title.trim() === "") nextErrors[`tasks.${index}.title`] = "Title is required";
      if (!isPercentage(task.fields.estimationPercent)) {
        nextErrors[`tasks.${index}.estimationPercent`] = "Must be 0-100";
      }
    });
    setErrors(reconcile(nextErrors));
  };
  const isValid = () =>
    fields.items.length > 0 &&
    fields.items.every(
      (task) => task.fields.title.trim() !== "" && isPercentage(task.fields.estimationPercent),
    );
  return { fields, set, replace, errors, addTask, removeTask, validate, isValid };
}

function makeEstimation() {
  const [fields, set] = createStore(defaultEstimation());
  const [advanced, setAdvanced] = createStore<EstimationAdvanced>({});
  const [errors, setErrors] = createStore<Errors>({});
  const replace = (next: EstimationFields, nextAdvanced: EstimationAdvanced = {}) => {
    set(reconcile(next));
    setAdvanced(reconcile(nextAdvanced));
    clearErrors(errors, (value) => setErrors(reconcile(value)));
  };
  const validate = () => {
    setErrors(
      "minimumTaskPoints",
      !isNonNegativeNumber(fields.minimumTaskPoints) ? "Must be 0 or greater" : undefined,
    );
  };
  const isValid = () => isNonNegativeNumber(fields.minimumTaskPoints);
  return { fields, set, advanced, setAdvanced, replace, errors, validate, isValid };
}

function makeValidation() {
  const [fields, set] = createStore(defaultValidation());
  const [advanced, setAdvanced] = createStore<ValidationAdvanced>({});
  const [errors, setErrors] = createStore<Errors>({});
  const replace = (next: ValidationFields, nextAdvanced: ValidationAdvanced = {}) => {
    set(reconcile(next));
    setAdvanced(reconcile(nextAdvanced));
    clearErrors(errors, (value) => setErrors(reconcile(value)));
  };
  const validate = () => {
    const nextErrors: Errors = {};
    if (!isPercentage(fields.totalEstimationMustBe)) {
      nextErrors.totalEstimationMustBe = "Must be 0-100";
    }
    if (!isNonNegativeInteger(fields.minTasks)) {
      nextErrors.minTasks = "Must be a whole number 0 or greater";
    }
    if (!isNonNegativeInteger(fields.maxTasks)) {
      nextErrors.maxTasks = "Must be a whole number 0 or greater";
    }
    const minTasks = optionalNumber(fields.minTasks);
    const maxTasks = optionalNumber(fields.maxTasks);
    if (
      minTasks !== undefined &&
      maxTasks !== undefined &&
      Number.isInteger(minTasks) &&
      Number.isInteger(maxTasks) &&
      minTasks > maxTasks
    ) {
      nextErrors.maxTasks = "Must be greater than or equal to min tasks";
    }
    setErrors(reconcile(nextErrors));
  };
  const isValid = () => {
    const minTasks = optionalNumber(fields.minTasks);
    const maxTasks = optionalNumber(fields.maxTasks);
    return (
      isPercentage(fields.totalEstimationMustBe) &&
      isNonNegativeInteger(fields.minTasks) &&
      isNonNegativeInteger(fields.maxTasks) &&
      (minTasks === undefined || maxTasks === undefined || minTasks <= maxTasks)
    );
  };
  return { fields, set, advanced, setAdvanced, replace, errors, validate, isValid };
}

function makeMetadata() {
  const [fields, set] = createStore(defaultMetadata());
  const [advanced, setAdvanced] = createStore<MetadataAdvanced>({});
  const [errors, setErrors] = createStore<Errors>({});
  const replace = (next: MetadataFields, nextAdvanced: MetadataAdvanced = {}) => {
    set(reconcile(next));
    setAdvanced(reconcile(nextAdvanced));
    clearErrors(errors, (value) => setErrors(reconcile(value)));
  };
  const validate = () => {};
  const isValid = () =>
    fields.difficulty === "" || ["beginner", "intermediate", "advanced"].includes(fields.difficulty);
  return { fields, set, advanced, setAdvanced, replace, errors, validate, isValid };
}

export type BasicInfoStore = ReturnType<typeof makeBasicInfo>;
export type FilterStore = ReturnType<typeof makeFilter>;
export type TasksStore = ReturnType<typeof makeTasks>;
export type EstimationStore = ReturnType<typeof makeEstimation>;
export type ValidationStore = ReturnType<typeof makeValidation>;
export type MetadataStore = ReturnType<typeof makeMetadata>;

export type AuthoringSectionStores = {
  "basic-info": BasicInfoStore;
  filter: FilterStore;
  tasks: TasksStore;
  estimation: EstimationStore;
  validation: ValidationStore;
  metadata: MetadataStore;
};

export type AuthoringStore = AuthoringSectionStores & {
  reset: () => void;
  loadTemplate: (template: TaskTemplate) => void;
  toTemplate: () => TaskTemplate;
  serialise: () => string;
};

export function isAuthoringStoreReadyForReview(store: AuthoringSectionStores): boolean {
  return [
    store["basic-info"],
    store.filter,
    store.tasks,
    store.estimation,
    store.validation,
    store.metadata,
  ].every((section) => section.isValid());
}

function buildFilter(store: FilterStore): FilterCriteria {
  if (store.fields.filterMode === "query") {
    const savedQueryRef = store.fields.savedQueryIds[0] ?? "";

    return {
      ...store.advanced,
      savedQuery: isUuid(savedQueryRef) ? { id: savedQueryRef } : { path: savedQueryRef },
      excludeIfHasTasks: store.fields.excludeIfHasTasks,
    };
  }

  const tags =
    store.fields.tagsInclude.length > 0 || store.fields.tagsExclude.length > 0
      ? {
          include: nonEmptyArray(store.fields.tagsInclude),
          exclude: nonEmptyArray(store.fields.tagsExclude),
        }
      : undefined;

  return {
    ...store.advanced,
    workItemTypes: nonEmptyArray(store.fields.workItemTypes),
    states: nonEmptyArray(store.fields.states),
    statesExclude: nonEmptyArray(store.fields.statesExclude),
    areaPaths: nonEmptyArray(store.fields.areaPaths),
    iterations: nonEmptyArray(store.fields.iterations),
    tags,
    excludeIfHasTasks: store.fields.excludeIfHasTasks,
    assignedTo: nonEmptyArray(store.fields.assignedTo),
  };
}

function buildTasks(store: TasksStore): TaskDefinition[] {
  return store.fields.items.map((task) => ({
    ...task.advanced,
    id: nonEmpty(task.fields.id),
    title: task.fields.title.trim(),
    description: nonEmpty(task.fields.description),
    estimationPercent: optionalNumber(task.fields.estimationPercent),
    tags: nonEmptyArray(task.fields.tags),
  }));
}

function buildEstimation(store: EstimationStore): EstimationConfig | undefined {
  const estimation: EstimationConfig = {
    ...store.advanced,
    strategy: "percentage",
    source: nonEmpty(store.fields.source),
    rounding: store.fields.rounding,
    minimumTaskPoints: optionalNumber(store.fields.minimumTaskPoints),
  };

  const hasMeaningfulValue =
    estimation.source !== undefined ||
    estimation.minimumTaskPoints !== undefined ||
    store.fields.rounding !== "none" ||
    Object.keys(store.advanced).length > 0;

  return hasMeaningfulValue ? estimation : undefined;
}

function buildValidation(store: ValidationStore): ValidationConfig | undefined {
  const validation: ValidationConfig = {
    ...store.advanced,
    mode: store.fields.mode === "" ? undefined : store.fields.mode,
    totalEstimationMustBe: optionalNumber(store.fields.totalEstimationMustBe),
    minTasks: optionalNumber(store.fields.minTasks),
    maxTasks: optionalNumber(store.fields.maxTasks),
  };
  return Object.values(validation).some((value) => value !== undefined) ? validation : undefined;
}

function buildMetadata(store: MetadataStore): Metadata | undefined {
  const metadata: Metadata = {
    ...store.advanced,
    category: nonEmpty(store.fields.category),
    difficulty: store.fields.difficulty === "" ? undefined : store.fields.difficulty,
    estimationGuidelines: nonEmpty(store.fields.estimationGuidelines),
  };
  return Object.values(metadata).some((value) => value !== undefined) ? metadata : undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function toTaskFields(task: TaskDefinition): EditableTask {
  const { id, title, description, estimationPercent, tags, ...advanced } = task;
  return {
    fields: {
      id: id ?? "",
      title,
      description: description ?? "",
      estimationPercent: estimationPercent === undefined ? "" : String(estimationPercent),
      tags: tags ?? [],
    },
    advanced,
  };
}

export function createAuthoringStore(): AuthoringStore {
  const basicInfo = makeBasicInfo();
  const filter = makeFilter();
  const tasks = makeTasks();
  const estimation = makeEstimation();
  const validation = makeValidation();
  const metadata = makeMetadata();

  const stores: AuthoringSectionStores = {
    "basic-info": basicInfo,
    filter,
    tasks,
    estimation,
    validation,
    metadata,
  };

  const reset = () => {
    basicInfo.replace(defaultBasicInfo());
    filter.replace(defaultFilter());
    tasks.replace(defaultTasks());
    estimation.replace(defaultEstimation());
    validation.replace(defaultValidation());
    metadata.replace(defaultMetadata());
  };

  const loadTemplate = (template: TaskTemplate) => {
    const { created, lastModified, extends: parent, mixins, origin } = template;
    basicInfo.replace(
      {
        version: template.version,
        name: template.name,
        description: template.description ?? "",
        author: template.author ?? "",
        tags: template.tags ?? [],
      },
      omitUndefined({ created, lastModified, extends: parent, mixins, origin }),
    );

    const {
      workItemTypes,
      states,
      statesExclude,
      areaPaths,
      iterations,
      tags: filterTags,
      excludeIfHasTasks,
      assignedTo,
      savedQuery,
      ...advancedFilter
    } = template.filter;
    filter.replace(
      {
        filterMode: savedQuery ? "query" : "build",
        workItemTypes: workItemTypes ?? [],
        states: states ?? [],
        statesExclude: statesExclude ?? [],
        areaPaths: areaPaths ?? [],
        iterations: iterations ?? [],
        tagsInclude: filterTags?.include ?? [],
        tagsExclude: filterTags?.exclude ?? [],
        excludeIfHasTasks: excludeIfHasTasks ?? true,
        assignedTo: assignedTo ?? [],
        savedQueryIds: savedQuery?.id || savedQuery?.path ? [savedQuery.id ?? savedQuery.path ?? ""] : [],
      },
      advancedFilter,
    );

    tasks.replace({ items: template.tasks.map(toTaskFields) });

    const {
      strategy,
      source,
      rounding,
      minimumTaskPoints,
      ...advancedEstimation
    } = template.estimation ?? {};
    estimation.replace(
      {
        strategy: strategy ?? "percentage",
        source: source ?? "",
        rounding: rounding ?? "none",
        minimumTaskPoints: minimumTaskPoints === undefined ? "" : String(minimumTaskPoints),
      },
      advancedEstimation,
    );

    const {
      mode,
      totalEstimationMustBe,
      minTasks,
      maxTasks,
      ...advancedValidation
    } = template.validation ?? {};
    validation.replace(
      {
        mode: mode ?? "",
        totalEstimationMustBe: totalEstimationMustBe === undefined ? "" : String(totalEstimationMustBe),
        minTasks: minTasks === undefined ? "" : String(minTasks),
        maxTasks: maxTasks === undefined ? "" : String(maxTasks),
      },
      advancedValidation,
    );

    const {
      category,
      difficulty,
      estimationGuidelines,
      ...advancedMetadata
    } = template.metadata ?? {};
    metadata.replace(
      {
        category: category ?? "",
        difficulty: difficulty ?? "",
        estimationGuidelines: estimationGuidelines ?? "",
      },
      advancedMetadata,
    );
  };

  const toTemplate = () => {
    for (const store of Object.values(stores)) store.validate();
    if (!isAuthoringStoreReadyForReview(stores)) {
      throw new Error("Template contains invalid section data");
    }

    const template = {
      version: nonEmpty(basicInfo.fields.version) ?? "1.0",
      name: basicInfo.fields.name.trim(),
      description: nonEmpty(basicInfo.fields.description),
      author: nonEmpty(basicInfo.fields.author),
      tags: nonEmptyArray(basicInfo.fields.tags),
      created: basicInfo.advanced.created,
      lastModified: basicInfo.advanced.lastModified,
      filter: buildFilter(filter),
      tasks: buildTasks(tasks),
      estimation: buildEstimation(estimation),
      validation: buildValidation(validation),
      metadata: buildMetadata(metadata),
      extends: basicInfo.advanced.extends,
      mixins: basicInfo.advanced.mixins,
      origin: basicInfo.advanced.origin,
    };

    return TaskTemplateSchema.parse(omitUndefined(template));
  };

  const serialise = () =>
    stringify(toTemplate(), {
      lineWidth: 0,
    });

  return {
    ...stores,
    reset,
    loadTemplate,
    toTemplate,
    serialise,
  };
}

export const useSectionStores = createAuthoringStore;
export type SectionStores = AuthoringStore;
