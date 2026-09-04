import { createSignal } from "solid-js";
import type { StudioAreaId } from "./studio-areas";

export type StudioLocation = { activeArea: StudioAreaId; surface: "starting-paths" | "builder" };

export function createNavigationHistory() {
  const [entries, setEntries] = createSignal<StudioLocation[]>([]);

  const canGoBack = () => entries().length > 0;

  const record = (previous: StudioLocation) => {
    setEntries((stack) => [...stack, previous]);
  };

  const goBack = (): StudioLocation | undefined => {
    const stack = entries();
    if (stack.length === 0) return undefined;
    setEntries(stack.slice(0, -1));
    return stack[stack.length - 1];
  };

  const clear = () => setEntries([]);

  return { canGoBack, record, goBack, clear };
}
