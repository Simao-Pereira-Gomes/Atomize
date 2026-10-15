// THROWAWAY: UI comparison controls for #263. Remove when the design is selected.
import { For, onCleanup, onMount } from "solid-js";

export const prototypeVariants = [
  { key: "A", name: "Documentation", description: "Navigation tree · guide · contents" },
  { key: "B", name: "Reading room", description: "Topic navigation · spacious article · field drawer" },
  { key: "C", name: "Workbench", description: "Compact navigation · guide and live schema side by side" },
];

export function PrototypeSwitcher(props: { current: string; change: (key: string) => void; state: string }) {
  const cycle = (direction: number) => {
    const index = prototypeVariants.findIndex(v => v.key === props.current);
    props.change(prototypeVariants[(index + direction + prototypeVariants.length) % prototypeVariants.length].key);
  };
  onMount(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable], [role="tablist"], .schema-reference')) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); cycle(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handle);
    onCleanup(() => window.removeEventListener("keydown", handle));
  });
  return <aside class="prototype-switcher" aria-label="Prototype variants">
    <div class="prototype-controls">
      <span class="prototype-label">UI STUDY / 263</span>
      <button aria-label="Previous variant" onClick={() => cycle(-1)}>←</button>
      <For each={prototypeVariants}>{v => <button aria-pressed={props.current === v.key} onClick={() => props.change(v.key)}>{v.key}<span> {v.name}</span></button>}</For>
      <button aria-label="Next variant" onClick={() => cycle(1)}>→</button>
    </div>
    <output aria-live="polite">{props.state}</output>
  </aside>;
}
