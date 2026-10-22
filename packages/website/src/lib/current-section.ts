export interface SectionPosition { id: string; top: number }

/** Native anchor navigation may hit the page bottom before its heading reaches the reading line. */
export function currentSection(headings: SectionPosition[], readingLine: number, atBottom: boolean, destination?: string) {
  if (destination && headings.some(heading => heading.id === destination)) return destination;
  if (atBottom) return headings.at(-1)?.id;
  return headings.findLast(heading => heading.top <= readingLine)?.id ?? headings[0]?.id;
}

/**
 * Over the last screen of scrolling, the reading line moves from below the header to the bottom of the viewport,
 * so short final sections, which can never reach the usual line, are each reached in turn instead of skipped.
 */
export function readingLineFor(readingLine: number, viewportHeight: number, distanceToBottom: number, scrollRange = Number.POSITIVE_INFINITY) {
  // A page that scrolls less than a screen spreads the movement over its whole range.
  const span = Math.min(viewportHeight, scrollRange);
  if (span <= 0 || distanceToBottom >= span) return readingLine;
  const progress = 1 - Math.max(0, distanceToBottom) / span;
  return readingLine + (viewportHeight - readingLine) * progress;
}
