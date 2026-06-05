import { createSignal, createUniqueId, For, Show } from "solid-js";

export function TagChipInput(props: {
  label: string;
  value: string[];
  placeholder?: string;
  onChange: (v: string[]) => void;
}) {
  const inputId = createUniqueId();
  const [draft, setDraft] = createSignal("");
  let inputRef: HTMLInputElement | undefined;

  const commit = () => {
    const val = draft().trim().replace(/,$/, "");
    if (val && !props.value.includes(val)) props.onChange([...props.value, val]);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
    if (e.key === "Backspace" && draft() === "" && props.value.length > 0)
      props.onChange(props.value.slice(0, -1));
  };

  return (
    <div class="ui-field">
      <label class="ui-label" for={inputId}>{props.label}</label>
      <div class="sk-combobox-control tag-control">
        <div class="sk-combobox-value">
          <For each={props.value}>
            {(tag) => (
              <span class="ms-chip">
                {tag}
                <button
                  class="ms-chip-remove"
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); props.onChange(props.value.filter((t) => t !== tag)); }}
                >
                  ×
                </button>
              </span>
            )}
          </For>
          <input
            id={inputId}
            ref={inputRef}
            class="sk-combobox-input tag-input-field"
            type="text"
            value={draft()}
            placeholder={props.value.length === 0 ? (props.placeholder ?? "Type and press Enter...") : ""}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={onKey}
            onBlur={commit}
          />
        </div>
        <Show when={props.value.length > 0}>
          <button
            class="sk-combobox-clear"
            type="button"
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); props.onChange([]); setDraft(""); inputRef?.focus(); }}
          >
            Clear
          </button>
        </Show>
      </div>
      <p class="tag-helper">Press Enter or comma to add a tag.</p>
    </div>
  );
}
