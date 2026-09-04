export const SEARCHABLE_OPTIONS_THRESHOLD = 6;

/**
 * Lets an Enter key choose Kobalte's highlighted matching option. Only a query
 * with no available match becomes a manually-entered value.
 */
export function shouldAddCustomValue(value: string, options: string[]): boolean {
  const query = value.trim().toLocaleLowerCase();
  return query !== "" && !options.some((option) => option.toLocaleLowerCase().includes(query));
}
