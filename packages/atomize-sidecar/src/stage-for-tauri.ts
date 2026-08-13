import { copyFile, mkdir, rm } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { $ } from "bun";

const target = targetTriple(platform(), arch());
const executable = platform() === "win32" ? "atomize-sidecar.exe" : "atomize-sidecar";
const copilotExecutable = platform() === "win32" ? "copilot.exe" : "copilot";
const source = resolve(import.meta.dir, "..", executable);
const destination = resolve(import.meta.dir, "..", "..", "atomize-studio", "src-tauri", "binaries", `atomize-sidecar-${target}${platform() === "win32" ? ".exe" : ""}`);
const copilotName = `atomize-copilot-${target}${platform() === "win32" ? ".exe" : ""}`;
const copilotSource = resolve(import.meta.dir, "..", "..", "atomize-ai", "node_modules", "@github", `copilot-${platform()}-${arch()}`, copilotExecutable);
const copilotDestination = resolve(dirname(destination), copilotName);

// The sidecar consumes atomize-ai through its package export, so build it before
// compiling the standalone binary instead of accidentally embedding stale dist output.
await $`bun run --cwd ${resolve(import.meta.dir, "..", "..", "atomize-ai")} build`;
await $`bun build ${resolve(import.meta.dir, "index.ts")} --compile --outfile ${source}`;
await mkdir(dirname(destination), { recursive: true });
await rm(destination, { force: true });
await copyFile(source, destination);
await copyFile(copilotSource, copilotDestination);
await $`chmod 755 ${copilotDestination}`;
await rm(source, { force: true });

function targetTriple(os: NodeJS.Platform, cpu: string): string {
  if (os === "darwin" && cpu === "arm64") return "aarch64-apple-darwin";
  if (os === "darwin" && cpu === "x64") return "x86_64-apple-darwin";
  if (os === "linux" && cpu === "x64") return "x86_64-unknown-linux-gnu";
  if (os === "win32" && cpu === "x64") return "x86_64-pc-windows-msvc";
  throw new Error(`No Tauri sidecar target mapping for ${os}/${cpu}.`);
}
