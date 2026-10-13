import { buildSchemaTrees, normalizeDocumentPath, type SchemaTab } from "@sppg2001/atomize-schema-reference";
import schema from "@sppg2001/atomize-schema-reference/schema.json";
import { SchemaReference } from "@sppg2001/atomize-schema-reference/viewer";
import "@sppg2001/atomize-schema-reference/styles.css";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { createSignal, onMount, Show } from "solid-js";
import { version as bundledVersion } from "../../package.json";

const trees = buildSchemaTrees(schema);
const guideUrl = (anchor?: string) => `https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Template-Reference.md${anchor ? `#${anchor}` : ""}`;

async function openInBrowser(url: string) {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else window.open(url, "_blank", "noopener,noreferrer");
}

export const openTemplateReference = () => openInBrowser(guideUrl());

export const studioFieldPermalink = (path: string, tab: SchemaTab = "template") => normalizeDocumentPath(trees, path, tab);

export function StudioSchemaReference(props: { permalink?: string }) {
  const [version, setVersion] = createSignal(bundledVersion);
  const [linkError, setLinkError] = createSignal("");
  onMount(() => {
    if (isTauri()) void getVersion().then(setVersion).catch(() => {});
  });
  const openExternalLink = async (url: string) => {
    setLinkError("");
    try {
      await openInBrowser(url);
    } catch {
      setLinkError("We could not open the Template Reference in your browser. Try the link again.");
    }
  };
  return (
    <>
      <Show when={linkError()}>
        <p role="alert" class="m-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">{linkError()}</p>
      </Show>
      <SchemaReference
        trees={trees}
        permalink={props.permalink}
        syncUrl={false}
        showPermalinks={false}
        versionLabel={`Atomize Studio ${version()}`}
        guideUrl={guideUrl}
        openExternalLink={openExternalLink}
      />
    </>
  );
}
