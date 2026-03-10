/**
 * Text similarity computation and clustering utilities.
 */
export class SimilarityCalculator {
  /**
   * Composite similarity combining bigram Dice coefficient and word Jaccard.
   * Bigram Dice captures partial word matches ("setup" vs "set-up"),
   * while word Jaccard preserves semantic chunking.
   */
  calculateSimilarity(a: string, b: string): number {
    return 0.6 * this.bigramDice(a, b) + 0.4 * this.wordJaccard(a, b);
  }

  /**
   * Bigram Dice coefficient for character-level similarity.
   * Uses overlapping character pairs (bigrams) for fuzzy matching.
   */
  bigramDice(a: string, b: string): number {
    const getBigrams = (s: string): Set<string> => {
      const normalized = s.toLowerCase().replace(/\s+/g, " ");
      const bigrams = new Set<string>();
      for (let i = 0; i < normalized.length - 1; i++) {
        bigrams.add(normalized.substring(i, i + 2));
      }
      return bigrams;
    };

    const bigramsA = getBigrams(a);
    const bigramsB = getBigrams(b);

    if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
    if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

    let intersection = 0;
    for (const bg of bigramsA) {
      if (bigramsB.has(bg)) intersection++;
    }

    return (2 * intersection) / (bigramsA.size + bigramsB.size);
  }

  /**
   * Jaccard similarity on word tokens.
   * Returns a value between 0 (no overlap) and 1 (identical token sets).
   */
  wordJaccard(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const tokensB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection++;
    }

    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Complete-linkage agglomerative clustering.
   * Groups items by similarity threshold using the minimum similarity between
   * any two items in different clusters.
   */
  clusterItems<T>(
    items: T[],
    similarityFn: (a: T, b: T) => number,
    threshold: number,
  ): T[][] {
    if (items.length === 0) return [];
    const firstItem = items[0];
    if (items.length === 1 && firstItem) return [[firstItem]];
    const n = items.length;
    const simMatrix: number[][] = Array(n)
      .fill(null)
      .map(() => Array<number>(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const rowI = simMatrix[i];
        const rowJ = simMatrix[j];
        const itemI = items[i];
        const itemJ = items[j];
        if (rowI && rowJ && itemI !== undefined && itemJ !== undefined) {
          if (i === j) {
            rowI[j] = 1;
          } else {
            const sim = similarityFn(itemI, itemJ);
            rowI[j] = sim;
            rowJ[i] = sim;
          }
        }
      }
    }

    const clusters: number[][] = items.map((_, idx) => [idx]);
    while (clusters.length > 1) {
      let bestPair: [number, number] | null = null;
      let bestSim = -1;

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const clusterI = clusters[i];
          const clusterJ = clusters[j];
          if (!clusterI || !clusterJ) continue;
          let minSim = 1;
          for (const idxA of clusterI) {
            for (const idxB of clusterJ) {
              minSim = Math.min(minSim, simMatrix[idxA]?.[idxB] ?? 0);
            }
          }
          if (minSim > bestSim) {
            bestSim = minSim;
            bestPair = [i, j];
          }
        }
      }

      if (bestSim < threshold || !bestPair) break;
      const [i, j] = bestPair;
      const clusterI = clusters[i];
      const clusterJ = clusters[j];
      if (clusterI && clusterJ) {
        clusters[i] = [...clusterI, ...clusterJ];
      }
      clusters.splice(j, 1);
    }

    return clusters.map((indices) =>
      indices
        .map((idx) => items[idx])
        .filter((item): item is T => item !== undefined),
    );
  }

  /**
   * Normalize a task title for comparison.
   * Strips template variables and common prefixes.
   */
  normalizeTitle(title: string): string {
    return title
      .replace(/\$\{story\.(title|id|description)\}/g, "")
      .replace(/^(task|implement|create|build|design|test|fix)\s*:?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
}
