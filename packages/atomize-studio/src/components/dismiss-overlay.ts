import { type Accessor, createEffect, onCleanup } from "solid-js";

// Escape closes the innermost open overlay first: each active overlay pushes its
// dismiss onto this stack, and the single keydown listener only ever pops the top.
const escapeStack: Array<() => void> = [];
let escapeBound = false;

function onEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || escapeStack.length === 0) return;
  event.stopPropagation();
  escapeStack[escapeStack.length - 1]?.();
}

/**
 * While `isOpen` is true, dismiss the overlay on Escape or on a pointer press
 * outside every element returned by `contains`. `contains` is read on each event,
 * so refs that mount after the overlay opens (portalled listboxes, nested popovers)
 * still count as "inside".
 */
export function dismissOverlay(
  isOpen: Accessor<boolean>,
  dismiss: () => void,
  contains: Accessor<Array<HTMLElement | undefined>>,
) {
  createEffect(() => {
    if (!isOpen()) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!contains().some((node) => node?.contains(target))) dismiss();
    };
    document.addEventListener("mousedown", onPointerDown, true);

    escapeStack.push(dismiss);
    if (!escapeBound) {
      document.addEventListener("keydown", onEscape, true);
      escapeBound = true;
    }

    onCleanup(() => {
      document.removeEventListener("mousedown", onPointerDown, true);
      const index = escapeStack.lastIndexOf(dismiss);
      if (index !== -1) escapeStack.splice(index, 1);
    });
  });
}
