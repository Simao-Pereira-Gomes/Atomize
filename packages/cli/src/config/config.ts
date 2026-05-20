import { LOG_LEVEL_VALUES, type LogLevel } from "@config/logger";
import z from "zod";

const envSchema = z.object({
  ATOMIZE_PROFILE:          z.string().optional(),
  ATOMIZE_PAT:              z.string().optional(),
  ATOMIZE_UPDATE_NOTIFIER:  z.enum(["enabled", "disabled"]).optional(),
  LOG_LEVEL:                z.enum(LOG_LEVEL_VALUES).optional(),
});

export interface Config {
  profile:        string | undefined;
  pat:            string | undefined;
  updateNotifier: "enabled" | "disabled" | undefined;
  logLevel:       LogLevel | undefined;
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env);
  const data = parsed.success ? parsed.data : ({} as z.infer<typeof envSchema>);

  return {
    profile:        data.ATOMIZE_PROFILE,
    pat:            data.ATOMIZE_PAT,
    updateNotifier: data.ATOMIZE_UPDATE_NOTIFIER,
    logLevel:       data.LOG_LEVEL,
  };
}
