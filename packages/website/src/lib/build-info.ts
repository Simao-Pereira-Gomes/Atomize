import { execFileSync } from "node:child_process";

export const buildInfo = {
  commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(),
  date: new Date().toISOString().slice(0, 10),
};
export const versionLabel = `main @ ${buildInfo.commit} · ${buildInfo.date}`;
