import { describe, expect, test } from "bun:test";

import { validateCustomFieldsPreFlight } from "@/cli/commands/generate.command";
import { ExitError } from "@/cli/utilities/exit-codes";
import type { ADoFieldSchema } from "@/platforms/interfaces/field-schema.interface";
import type { IPlatformAdapter } from "@/platforms/interfaces/platform.interface";
import type { TaskTemplate } from "@/templates/schema";

describe("validateCustomFieldsPreFlight", () => {
  test("fails fast for invalid boolean custom field values", async () => {
    const platform = {
      getFieldSchemas: async (_workItemType?: string): Promise<ADoFieldSchema[]> => [
        {
          referenceName: "Custom.IsBillable",
          name: "Is Billable",
          type: "boolean",
          isCustom: true,
          isReadOnly: false,
          isMultiline: false,
          isPicklist: false,
        },
      ],
    } as IPlatformAdapter;

    const template = {
      filter: {},
      tasks: [
        {
          title: "Backend",
          customFields: {
            "Custom.IsBillable": "yes",
          },
        },
      ],
    } as unknown as TaskTemplate;

    await expect(validateCustomFieldsPreFlight(template, platform)).rejects.toBeInstanceOf(ExitError);
  });

  test("fails fast for invalid datetime custom field values", async () => {
    const platform = {
      getFieldSchemas: async (_workItemType?: string): Promise<ADoFieldSchema[]> => [
        {
          referenceName: "Custom.ReleaseDate",
          name: "Release Date",
          type: "datetime",
          isCustom: true,
          isReadOnly: false,
          isMultiline: false,
          isPicklist: false,
        },
      ],
    } as IPlatformAdapter;

    const template = {
      filter: {},
      tasks: [
        {
          title: "Backend",
          customFields: {
            "Custom.ReleaseDate": "next friday",
          },
        },
      ],
    } as unknown as TaskTemplate;

    await expect(validateCustomFieldsPreFlight(template, platform)).rejects.toBeInstanceOf(ExitError);
  });
});
