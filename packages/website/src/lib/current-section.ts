export interface SectionPosition { id: string; top: number }

/** Native anchor navigation may hit the page bottom before its heading reaches the reading line. */
export function currentSection(headings: SectionPosition[], readingLine: number, atBottom: boolean, destination?: string) {
  if (destination && headings.some(heading => heading.id === destination)) return destination;
  if (atBottom) return headings.at(-1)?.id;
  return headings.findLast(heading => heading.top <= readingLine)?.id ?? headings[0]?.id;
}
