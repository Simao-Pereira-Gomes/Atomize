import { describe, expect, test } from "bun:test";
import { validateCustomFieldsAgainstSchemas } from "@/cli/commands/validate.command";
import type { ADoFieldSchema } from "@/platforms/interfaces/field-schema.interface";
import type { TaskTemplate } from "@/templates/schema";

describe("validateCustomFieldsAgainstSchemas", () => {
  test("flags invalid picklist values against task schema", async () => {
    const taskSchema: ADoFieldSchema = {
      referenceName: "Custom.ClientTier",
      name: "Client Tier",
      type: "string",
      isCustom: true,
      isReadOnly: false,
      isMultiline: false,
      isPicklist: true,
      allowedValues: ["Standard", "Premium", "Enterprise"],
    };

    const template = {
      filter: {},
      tasks: [
        {
          title: "Backend",
          customFields: {
            "Custom.ClientTier": "VIP",
          },
        },
      ],
    } as unknown as TaskTemplate;

    const result = await validateCustomFieldsAgainstSchemas(
      template,
      async (workItemType) => workItemType === "Task" ? [taskSchema] : [],
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("CUSTOM_FIELD_INVALID_PICKLIST_VALUE");
  });

  test("flags missing custom fields referenced by task conditions on story types", async () => {
    const template = {
      filter: { workItemTypes: ["User Story"] },
      tasks: [
        {
          title: "Backend",
          condition: {
            customField: "Custom.ClientTier",
            operator: "equals",
            value: "Enterprise",
          },
        },
      ],
    } as unknown as TaskTemplate;

    const result = await validateCustomFieldsAgainstSchemas(
      template,
      async (_workItemType) => [
        {
          referenceName: "Custom.OtherField",
          name: "Other Field",
          type: "string",
          isCustom: true,
          isReadOnly: false,
          isMultiline: false,
          isPicklist: false,
        },
      ],
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe("CONDITION_FIELD_NOT_FOUND");
  });
});
