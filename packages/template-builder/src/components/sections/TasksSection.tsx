import { For, Show } from "solid-js";
import type { TasksStore } from "../../stores/sections";
import { TagChipInput, TextareaField, TextField } from "../fields";

export function TasksSection(props: { store: TasksStore }) {
  const s = props.store;

  return (
    <div class="tasks-section">
      <For each={s.fields.items}>
        {(task, index) => (
          <section class="task-editor">
            <div class="task-editor-header">
              <h3>Task {index() + 1}</h3>
              <Show when={s.fields.items.length > 1}>
                <button class="btn btn--secondary" type="button" onClick={() => s.removeTask(index())}>
                  Remove
                </button>
              </Show>
            </div>
            <TextField
              label="Title"
              value={task.fields.title}
              error={s.errors[`tasks.${index()}.title`]}
              required
              onInput={(v) => s.set("items", index(), "fields", "title", v)}
              onBlur={s.validate}
              placeholder="Task title"
            />
            <TextField
              label="ID"
              value={task.fields.id}
              onInput={(v) => s.set("items", index(), "fields", "id", v)}
              placeholder="task-id"
            />
            <TextareaField
              label="Description"
              value={task.fields.description}
              onInput={(v) => s.set("items", index(), "fields", "description", v)}
              placeholder="What this task involves..."
            />
            <TextField
              label="Estimation percent"
              value={task.fields.estimationPercent}
              error={s.errors[`tasks.${index()}.estimationPercent`]}
              onInput={(v) => s.set("items", index(), "fields", "estimationPercent", v)}
              onBlur={s.validate}
              placeholder="20"
            />
            <TagChipInput
              label="Tags"
              value={task.fields.tags}
              onChange={(v) => s.set("items", index(), "fields", "tags", v)}
              placeholder="dev, test..."
            />
          </section>
        )}
      </For>
      <button class="btn btn--secondary" type="button" onClick={s.addTask}>
        Add task
      </button>
    </div>
  );
}
