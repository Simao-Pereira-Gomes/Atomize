import { type Accessor, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { type CatalogItem, parseCatalogItems } from "../catalog/catalog-item";
import { listCatalogItems, removeCatalogItem } from "../sidecar/sidecar-client";

type CatalogState =
  | { kind: "loading" }
  | { kind: "ready"; items: CatalogItem[] }
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "unavailable" };

const SCOPE_GROUPS: { scope: CatalogItem["scope"]; label: string }[] = [
  { scope: "builtin", label: "Built-in" },
  { scope: "user", label: "User" },
  { scope: "project", label: "Project" },
];

const KIND_LABEL: Record<CatalogItem["kind"], string> = { template: "Template", mixin: "Mixin" };

export function CatalogArea(props: { sidecarAvailable: Accessor<boolean>; onClone: (item: Extract<CatalogItem, { kind: "template" }>) => void }) {
  const [state, setState] = createSignal<CatalogState>({ kind: "loading" });
  const [confirming, setConfirming] = createSignal<CatalogItem>();
  const [confirmText, setConfirmText] = createSignal("");
  const [removing, setRemoving] = createSignal(false);
  const [removeError, setRemoveError] = createSignal("");

  const load = async () => {
    if (!props.sidecarAvailable()) { setState({ kind: "unavailable" }); return; }
    setState({ kind: "loading" });
    try {
      const items = parseCatalogItems(await listCatalogItems());
      setState(items.length === 0 ? { kind: "empty" } : { kind: "ready", items });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Unable to load the Catalog." });
    }
  };

  onMount(() => { void load(); });

  const openConfirm = (item: CatalogItem) => { setConfirming(item); setConfirmText(""); setRemoveError(""); };
  const closeConfirm = () => { setConfirming(undefined); setConfirmText(""); setRemoveError(""); };

  const confirmRemove = async () => {
    const item = confirming();
    if (!item) return;
    setRemoving(true);
    setRemoveError("");
    try {
      await removeCatalogItem(item.kind, item.name);
      closeConfirm();
      await load();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "We could not remove that Catalog item.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div class="p-6 lg:p-8">
      <section class="mx-auto max-w-4xl">
        <h1 class="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Catalog</h1>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">Browse Templates and Mixins across Built-in, User, and Project scopes, clone a Template to start authoring, or remove a User-installed item.</p>

        <Switch>
          <Match when={state().kind === "unavailable"}>
            <p class="mt-6 text-sm text-slate-500 dark:text-slate-400">The Catalog is unavailable while the companion process recovers.</p>
          </Match>
          <Match when={state().kind === "loading"}>
            <p class="mt-6 text-slate-600 dark:text-slate-300">Loading Catalog…</p>
          </Match>
          <Match when={state().kind === "empty"}>
            <p class="mt-6 text-slate-600 dark:text-slate-300">No Templates or Mixins are available yet.</p>
          </Match>
          <Match when={state().kind === "error"}>
            <div class="mt-6">
              <p class="text-slate-600 dark:text-slate-300">{(state() as Extract<CatalogState, { kind: "error" }>).message}</p>
              <button class="mt-3 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400" type="button" onClick={() => void load()}>Retry</button>
            </div>
          </Match>
          <Match when={state().kind === "ready"}>
            <div class="mt-6 space-y-8">
              <For each={SCOPE_GROUPS}>
                {(group) => {
                  const items = () => (state() as Extract<CatalogState, { kind: "ready" }>).items.filter((item) => item.scope === group.scope);
                  return (
                    <Show when={items().length > 0}>
                      <div>
                        <h2 class="text-sm font-bold tracking-widest text-slate-400 uppercase">{group.label}</h2>
                        <div class="mt-3 space-y-3">
                          <For each={items()}>
                            {(item) => (
                              <div class="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                                <div class="min-w-0">
                                  <div class="flex items-center gap-2">
                                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{KIND_LABEL[item.kind]}</span>
                                    <p class="truncate font-semibold text-slate-950 dark:text-white">{item.displayName}</p>
                                  </div>
                                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
                                  <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.ref}</p>
                                </div>
                                <div class="flex shrink-0 items-center gap-2">
                                  <Show when={item.kind === "template"}>
                                    <button class="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40" type="button" onClick={() => props.onClone(item as Extract<CatalogItem, { kind: "template" }>)}>
                                      Clone
                                    </button>
                                  </Show>
                                  <Show when={item.scope === "user"}>
                                    <button class="rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40" type="button" onClick={() => openConfirm(item)}>
                                      Remove
                                    </button>
                                  </Show>
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  );
                }}
              </For>
            </div>
          </Match>
        </Switch>
      </section>

      <Show when={confirming()}>
        {(item) => (
          <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" role="presentation">
            <section
              class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
              role="dialog"
              aria-modal="true"
              aria-labelledby="catalog-remove-title"
            >
              <h2 id="catalog-remove-title" class="text-lg font-bold text-slate-950 dark:text-white">
                Remove {KIND_LABEL[item().kind]} from your Catalog?
              </h2>
              <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                This deletes <span class="font-semibold">{item().name}</span> from disk. This cannot be undone.
              </p>
              <label class="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                Type <span class="font-mono">{item().name}</span> to confirm
                <input
                  class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950"
                  value={confirmText()}
                  onInput={(event) => setConfirmText(event.currentTarget.value)}
                  autofocus
                />
              </label>
              <Show when={removeError()}>
                <p class="mt-3 text-sm text-rose-600">{removeError()}</p>
              </Show>
              <div class="mt-5 flex justify-end gap-2">
                <button
                  class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  type="button"
                  disabled={removing()}
                  onClick={closeConfirm}
                >
                  Cancel
                </button>
                <button
                  class="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  type="button"
                  disabled={confirmText() !== item().name || removing()}
                  onClick={() => void confirmRemove()}
                >
                  {removing() ? "Removing…" : "Remove"}
                </button>
              </div>
            </section>
          </div>
        )}
      </Show>
    </div>
  );
}
