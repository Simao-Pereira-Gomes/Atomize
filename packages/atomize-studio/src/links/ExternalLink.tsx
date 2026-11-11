import type { JSX } from "solid-js";
import { openInBrowser } from "./open-in-browser";

/** A link that opens in the system browser rather than inside Studio's window. */
export function ExternalLink(props: { href: string; class?: string; title?: string; children: JSX.Element }) {
  return (
    <a
      href={props.href}
      class={props.class}
      title={props.title}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void openInBrowser(props.href);
      }}
    >
      {props.children}
    </a>
  );
}
