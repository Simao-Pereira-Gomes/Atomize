import type { WorkItem } from "@platforms/interfaces/work-item.interface";

/**
 * Interpolates template strings against a parent story WorkItem.
 *
 * Supported syntax:
 *   ${story.title}          — story title (legacy)
 *   ${story.id}             — story ID (legacy)
 *   ${story.description}    — story description (legacy)
 *   {{ story.customFields['Custom.FieldName'] }}  — custom field value
 *
 * Missing customFields values resolve to an empty string.
 */
export function interpolateValue(
  template: string,
  story: WorkItem,
  onMissing?: (referenceName: string) => void,
): string {
  return template
    .replace(/\${story\.title}/g, story.title)
    .replace(/\${story\.id}/g, story.id)
    .replace(/\${story\.description}/g, story.description ?? "")
    .replace(
      /\{\{\s*story\.customFields\['([^']+)'\]\s*\}\}/g,
      (_match, referenceName: string) => {
        if (!story.customFields || !(referenceName in story.customFields)) {
          onMissing?.(referenceName);
          return "";
        }
        const value = story.customFields[referenceName];
        if (value === undefined || value === null) return "";
        return String(value);
      },
    );
}
