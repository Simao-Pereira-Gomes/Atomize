import type { SchemaTab } from "@sppg2001/atomize-schema-reference";
import { createContext, Show, useContext } from "solid-js";

export const SchemaReferenceNavigation = createContext<{
  open: (documentPath: string, tab?: SchemaTab) => void;
}>();

/** Field paths are explicit at their controls; UI labels are never used as schema keys. */
export function SchemaInfo(props: { path?: string; label?: string }) {
  const navigation = useContext(SchemaReferenceNavigation);
  return (
    <Show when={props.path && navigation}>
      <button
        class="schema-info"
        type="button"
        aria-label={`Open Schema Reference for ${props.label ?? props.path}`}
        title="View field in Schema Reference"
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (props.path) navigation?.open(props.path);
        }}
      >ⓘ</button>
    </Show>
  );
}
