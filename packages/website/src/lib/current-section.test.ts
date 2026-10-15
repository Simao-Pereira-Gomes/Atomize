import { expect, test } from "bun:test";
import { currentSection } from "./current-section";

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
