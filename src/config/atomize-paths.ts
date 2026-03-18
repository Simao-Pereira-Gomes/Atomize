import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export function getAtomizeDir(): string {
  const override = process.env.ATOMIZE_HOME?.trim();
  if (override && override.length > 0) {
    return override;
  }

  return join(homedir(), ".atomize");
}

export function getAtomizeTestDir(prefix: string): string {
  return join(tmpdir(), `${prefix}-${process.pid}`);
}
