/**
 * Build-time publication flags. A hidden feature's pages are left out of the build, its
 * navigation and search entries with them, and content marked for it is removed:
 *
 * - `<!-- atomize:feature studio -->` … `<!-- /atomize:feature -->` on their own lines wrap blocks.
 * - `<!-- atomize:feature !studio -->` … wraps the alternative shown while the feature is hidden.
 * - Inline, a start and end marker pair in the same sentence wraps just the words between them.
 * - A lone inline start marker in a list item, table row, or paragraph scopes to that item alone.
 *
 * Prefer marking text so that removing it leaves a correct sentence: GitHub shows every variant,
 * so a `!studio` alternative reads as a duplicate there.
 *
 * Set `ATOMIZE_PUBLISH_STUDIO=true` to publish Atomize Studio's documentation.
 */
export const features = {
  studio: process.env.ATOMIZE_PUBLISH_STUDIO === "true",
};

export type Feature = keyof typeof features;

/** Pages each feature owns, as content ids and route prefixes. */
const featurePages: Record<Feature, string[]> = {
  studio: ["studio/", "getting-started/studio"],
};

export function isPublished(feature: string): boolean {
  if (!(feature in features)) throw new Error(`Unknown documentation feature: ${feature}`);
  return features[feature as Feature];
}

/** Whether a content id (`studio/generate`) or route (`/studio/generate/#x`) belongs to a hidden feature. */
export function isHiddenPage(idOrRoute: string): boolean {
  const id = idOrRoute.replace(/^\//, "").replace(/#.*$/, "");
  return (Object.keys(featurePages) as Feature[]).some(feature => !features[feature] && featurePages[feature].some(prefix => id === prefix.replace(/\/$/, "") || id.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)));
}
