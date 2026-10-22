import { expect, test } from "bun:test";
import { currentSection, readingLineFor } from "./current-section";

// Positions captured from the browser reproducing #look-up-composition-fields.
const headings = [
  { id: "_top", top: -1600 },
  { id: "inheritance-extends", top: -1247 },
  { id: "mixins-mixins", top: -764 },
  { id: "resolution-order", top: 44 },
  { id: "compatibility", top: 348 },
  { id: "look-up-composition-fields", top: 551 },
];

test("the final visible section is current when the page cannot scroll further", () => {
  expect(currentSection(headings, 104, true)).toBe("look-up-composition-fields");
});

test("explicit navigation to a visible section takes priority at the page bottom", () => {
  expect(currentSection(headings, 104, true, "compatibility")).toBe("compatibility");
});

test("ordinary scrolling follows the heading that has reached the reading offset", () => {
  expect(currentSection(headings, 104, false)).toBe("resolution-order");
});

test("the page starts at Overview even when several short sections fit in the viewport", () => {
  expect(currentSection([{id:"_top",top:140},{id:"last",top:350}],104,false)).toBe("_top");
});

test("the reading line moves down through the last screen so short final sections are reached in turn", () => {
  expect(readingLineFor(104, 800, 2000)).toBe(104);
  expect(readingLineFor(104, 800, 800)).toBe(104);
  expect(readingLineFor(104, 800, 400)).toBe(452);
  expect(readingLineFor(104, 800, 0)).toBe(800);
});

test("scrolling through the end of the CLI reference highlights every final section in order", () => {
  // Short final sections, modelled on /cli/reference/, while scrolling its last screen 100px at a time.
  const seen = new Set<string>();
  for (let distance = 800; distance >= 0; distance -= 100) {
    const offset = 800 - distance;
    const positions = [
      { id: "no-matching-stories-found", top: 140 - offset },
      { id: "ai-template-generation-fails", top: 420 - offset },
      { id: "enable-debug-logging", top: 760 - offset },
    ];
    const id = currentSection(positions, readingLineFor(96, 800, distance), distance === 0);
    if (id) seen.add(id);
  }
  expect([...seen]).toEqual(["no-matching-stories-found", "ai-template-generation-fails", "enable-debug-logging"]);
});

test("a page that scrolls less than a screen moves the reading line over its whole scroll range", () => {
  expect(readingLineFor(104, 800, 299, 300)).toBeCloseTo(104 + 696 / 300);
  expect(readingLineFor(104, 800, 150, 300)).toBe(452);
  expect(readingLineFor(104, 800, 0, 300)).toBe(800);
});
