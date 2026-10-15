import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { canonicalSourceDigest } from "./lib/canonical-sections";

const loader = docsLoader();

export const collections = {
  docs: defineCollection({
    loader: {
      ...loader,
      async load(context) {
        const sources = await canonicalSourceDigest();
        await loader.load({ ...context, generateDigest: value => context.generateDigest({ value, sources }) });
      },
    },
    schema: docsSchema(),
  }),
};
