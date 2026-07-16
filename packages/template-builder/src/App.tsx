import { createSignal, Match, onMount, Show, Switch } from "solid-js";
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
import { TemplateBuilder } from "./components/TemplateBuilder";
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

function CliGate() {
  const [state, setState] = createSignal<GateState>({ kind: "checking" });

  const checkCli = async () => {
    setState({ kind: "checking" });
    try {
      setState({ kind: "ready", result: await probeCli() });
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
        <TemplateBuilder />
      </Match>
      <Match when={true}>
        <main class="cli-gate" aria-live="polite">
          <section class="cli-gate__card">
            <Show when={state().kind === "checking"}>
              <h1>Checking Atomize CLI</h1>
              <p>The Template Builder needs a compatible Atomize CLI before it can open.</p>
            </Show>
            <Show when={state().kind === "absent"}>
              <h1>Install Atomize CLI</h1>
              <p>Atomize CLI was not found on your PATH.</p>
              <button type="button" onClick={install}>Install Atomize CLI</button>
            </Show>
            <Show when={state().kind === "outdated"}>
              <h1>Upgrade Atomize CLI</h1>
              <p>
                Version {(state() as Extract<GateState, { kind: "outdated" }>).error.version} is installed;
                version {(state() as Extract<GateState, { kind: "outdated" }>).error.minimum} or newer is required.
              </p>
              <button type="button" onClick={install}>Upgrade Atomize CLI</button>
            </Show>
            <Show when={state().kind === "probe-failure"}>
              <h1>Atomize CLI needs repair</h1>
              <p>{(state() as Extract<GateState, { kind: "probe-failure" }>).message}</p>
              <button type="button" onClick={install}>Reinstall Atomize CLI</button>
              <button class="cli-gate__secondary" type="button" onClick={checkCli}>Retry check</button>
            </Show>
            <Show when={state().kind === "installing"}>
              <h1>Installing Atomize CLI</h1>
              <p>Please keep this window open while installation completes.</p>
              <pre class="cli-gate__console">{(state() as Extract<GateState, { kind: "installing" }>).output}</pre>
            </Show>
            <Show when={state().kind === "npm-unavailable"}>
              <h1>npm is unavailable</h1>
              <p>{(state() as Extract<GateState, { kind: "npm-unavailable" }>).message}</p>
              <p>Install Node.js/npm, or install Atomize manually with another package manager, then retry.</p>
              <button type="button" onClick={checkCli}>Retry check</button>
            </Show>
            <Show when={state().kind === "install-failure"}>
              <h1>Atomize CLI installation failed</h1>
              <p>{(state() as Extract<GateState, { kind: "install-failure" }>).message}</p>
              <pre class="cli-gate__console">{(state() as Extract<GateState, { kind: "install-failure" }>).output}</pre>
              <button type="button" onClick={install}>Try again</button>
              <button class="cli-gate__secondary" type="button" onClick={checkCli}>Retry check</button>
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
