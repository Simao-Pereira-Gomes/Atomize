// Throwaway UI prototype controls. Only mounted by the development route.
import { onCleanup, onMount } from "solid-js";

export const prototypeVariants = [
  { key: "A", name: "Documentation" },
  { key: "B", name: "Inspector" },
  { key: "C", name: "Field guide" },
];

export function PrototypeSwitcher(props: { current: string; change: (key: string) => void }) {
  function cycle(direction: number) {
    const index = prototypeVariants.findIndex((variant) => variant.key === props.current);
    props.change(prototypeVariants[(index + direction + prototypeVariants.length) % prototypeVariants.length].key);
  }
  onMount(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable], [role=tree]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        cycle(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", handler);
    onCleanup(() => window.removeEventListener("keydown", handler));
  });
  return <aside class="prototype-switcher" aria-label="Prototype variants">
    <span class="prototype-switcher-tag">PROTOTYPE</span>
    <button type="button" onClick={() => cycle(-1)} aria-label="Previous layout">←</button>
    <span><strong>{props.current}</strong> — {prototypeVariants.find((variant) => variant.key === props.current)?.name}</span>
    <button type="button" onClick={() => cycle(1)} aria-label="Next layout">→</button>
    <span class="prototype-switcher-hint">← → to compare</span>
  </aside>;
}
