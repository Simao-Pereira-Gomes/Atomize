import { createSignal, Match, onMount, Show, Switch } from "solid-js";
import atomizeIcon from "../../vscode-extension/icons/atomize-product.svg";
import {
  CliAbsentError,
  CliProbeError,
  type CliProbeResult,
  CliVersionError,
  probeCli,
} from "./cli/cli-bridge";
import {
  CLI_INSTALL_COMMAND,
  CliInstallError,
  installCli,
  NpmUnavailableError,
} from "./cli/cli-installer";
import { StartingPathPicker } from "./components/StartingPathPicker";
import { TemplateBuilder } from "./components/TemplateBuilder";
import { type CatalogTemplateItem, toCatalogClone } from "./starting-paths/catalog-clone";
import { createAuthoringStore } from "./stores/sections";
import "./App.css";

type GateState =
  | { kind: "checking" }
  | { kind: "ready"; result: CliProbeResult }
  | { kind: "absent" }
  | { kind: "outdated"; error: CliVersionError }
  | { kind: "probe-failure"; message: string }
  | { kind: "installing"; output: string }
  | { kind: "npm-unavailable"; message: string }
  | { kind: "install-failure"; message: string; output: string };

export function CliGate(props: { probe?: () => Promise<CliProbeResult> }) {
  const [state, setState] = createSignal<GateState>({ kind: "checking" });
  const [surface, setSurface] = createSignal<"starting-paths" | "builder">("starting-paths");
  const stores = createAuthoringStore();

  const startScratch = () => {
    stores.reset();
    setSurface("builder");
  };
  const startCatalogClone = (item: CatalogTemplateItem) => {
    stores.loadTemplate(toCatalogClone(item));
    setSurface("builder");
  };
  const changeStartingPath = () => {
    stores.reset();
    setSurface("starting-paths");
  };

  const checkCli = async () => {
    setState({ kind: "checking" });
    try {
      setState({ kind: "ready", result: await (props.probe ?? probeCli)() });
    } catch (error) {
      if (error instanceof CliAbsentError) setState({ kind: "absent" });
      else if (error instanceof CliVersionError) setState({ kind: "outdated", error });
      else if (error instanceof CliProbeError) setState({ kind: "probe-failure", message: error.message });
      else setState({ kind: "probe-failure", message: "Unable to check the Atomize CLI." });
    }
  };

  const install = async () => {
    let output = `$ ${CLI_INSTALL_COMMAND}\n`;
    setState({ kind: "installing", output });
    try {
      await installCli(chunk => {
        output += chunk;
        setState({ kind: "installing", output });
      });
      await checkCli();
    } catch (error) {
      if (error instanceof NpmUnavailableError) {
        setState({ kind: "npm-unavailable", message: error.message });
      } else {
        setState({
          kind: "install-failure",
          message: error instanceof CliInstallError ? error.message : "CLI installation failed.",
          output,
        });
      }
    }
  };

  onMount(checkCli);

  return (
    <Switch>
      <Match when={state().kind === "ready"}>
        <Show
          when={surface() === "builder"}
          fallback={<StartingPathPicker onScratch={startScratch} onCatalogClone={startCatalogClone} />}
        >
          <TemplateBuilder stores={stores} onChangeStartingPath={changeStartingPath} />
        </Show>
      </Match>
      <Match when={true}>
        <main class="cli-gate" aria-live="polite">
          <section class="cli-gate__intro">
            <div class="cli-gate__brand"><img src={atomizeIcon} alt="" /> <span>Atomize</span></div>
            <div class="cli-gate__intro-copy">
              <div class="cli-gate__eyebrow">Template Builder</div>
              <h1>Build task templates without editing YAML by hand.</h1>
              <p>The desktop app uses the Atomize CLI to validate, import, and save your work.</p>
            </div>
            <div class="cli-gate__steps"><span class="is-active">1</span><i /><span>2</span><i /><span>3</span></div>
          </section>
          <section class="cli-gate__action">
            <Show when={state().kind === "checking"}>
              <div class="cli-gate__state"><span class="cli-gate__status-dot" /> Checking setup</div>
              <h2>Checking Atomize CLI</h2>
              <p>The Template Builder needs a compatible Atomize CLI before it can open.</p>
            </Show>
            <Show when={state().kind === "absent"}>
              <div class="cli-gate__state"><span class="cli-gate__status-dot" /> Required setup</div>
              <h2>Install Atomize CLI</h2>
              <p>Atomize CLI was not found on your PATH.</p>
              <button class="cli-gate__primary" type="button" onClick={install}>Install and continue <span>→</span></button>
              <p class="cli-gate__hint">Uses npm. You can install with another package manager, then return here.</p>
              <p class="cli-gate__retry">Already installed it? <button type="button" onClick={checkCli}>Check again</button></p>
            </Show>
            <Show when={state().kind === "outdated"}>
              <div class="cli-gate__state"><span class="cli-gate__status-dot" /> Update required</div>
              <h2>Upgrade Atomize CLI</h2>
              <p>
                Version {(state() as Extract<GateState, { kind: "outdated" }>).error.version} is installed;
                version {(state() as Extract<GateState, { kind: "outdated" }>).error.minimum} or newer is required.
              </p>
              <button class="cli-gate__primary" type="button" onClick={install}>Upgrade and continue <span>→</span></button>
              <p class="cli-gate__retry">Already upgraded it? <button type="button" onClick={checkCli}>Check again</button></p>
            </Show>
            <Show when={state().kind === "probe-failure"}>
              <div class="cli-gate__state"><span class="cli-gate__status-dot" /> Setup needs attention</div>
              <h2>Atomize CLI needs repair</h2>
              <p>{(state() as Extract<GateState, { kind: "probe-failure" }>).message}</p>
              <button class="cli-gate__primary" type="button" onClick={install}>Reinstall and continue <span>→</span></button>
              <p class="cli-gate__retry">Already repaired it? <button type="button" onClick={checkCli}>Check again</button></p>
            </Show>
            <Show when={state().kind === "installing"}>
              <div class="cli-gate__state"><span class="cli-gate__status-dot" /> Installing</div>
              <h2>Installing Atomize CLI</h2>
              <p>Please keep this window open while installation completes.</p>
              <pre class="cli-gate__console">{(state() as Extract<GateState, { kind: "installing" }>).output}</pre>
            </Show>
            <Show when={state().kind === "npm-unavailable"}>
              <div class="cli-gate__state"><span class="cli-gate__status-dot" /> Setup needs attention</div>
              <h2>npm is unavailable</h2>
              <p>{(state() as Extract<GateState, { kind: "npm-unavailable" }>).message}</p>
              <p>Install Node.js/npm, or install Atomize manually with another package manager, then retry.</p>
              <p class="cli-gate__retry"><button type="button" onClick={checkCli}>Check again</button></p>
            </Show>
            <Show when={state().kind === "install-failure"}>
              <div class="cli-gate__state"><span class="cli-gate__status-dot" /> Setup needs attention</div>
              <h2>Atomize CLI installation failed</h2>
              <p>{(state() as Extract<GateState, { kind: "install-failure" }>).message}</p>
              <pre class="cli-gate__console">{(state() as Extract<GateState, { kind: "install-failure" }>).output}</pre>
              <button class="cli-gate__primary" type="button" onClick={install}>Try again <span>→</span></button>
              <p class="cli-gate__retry">Installed it another way? <button type="button" onClick={checkCli}>Check again</button></p>
            </Show>
          </section>
        </main>
      </Match>
    </Switch>
  );
}

function App() {
  return <CliGate />;
}

export default App;
