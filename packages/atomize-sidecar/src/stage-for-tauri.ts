import { copyFile, mkdir, rm } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { $ } from "bun";

const target = targetTriple(platform(), arch());
const executable = platform() === "win32" ? "atomize-sidecar.exe" : "atomize-sidecar";
const source = resolve(import.meta.dir, "..", executable);
const destination = resolve(import.meta.dir, "..", "..", "atomize-studio", "src-tauri", "binaries", `atomize-sidecar-${target}${platform() === "win32" ? ".exe" : ""}`);

await $`bun build ${resolve(import.meta.dir, "index.ts")} --compile --outfile ${source}`;
await mkdir(dirname(destination), { recursive: true });
await rm(destination, { force: true });
await copyFile(source, destination);
await rm(source, { force: true });

function targetTriple(os: NodeJS.Platform, cpu: string): string {
  if (os === "darwin" && cpu === "arm64") return "aarch64-apple-darwin";
  if (os === "darwin" && cpu === "x64") return "x86_64-apple-darwin";
  if (os === "linux" && cpu === "x64") return "x86_64-unknown-linux-gnu";
  if (os === "win32" && cpu === "x64") return "x86_64-pc-windows-msvc";
  throw new Error(`No Tauri sidecar target mapping for ${os}/${cpu}.`);
}
