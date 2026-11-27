// The two layouts (BF-D-049, BF-D-053). These are the parts that need no page; the page itself (a list of rows, a tap, no sideways
// scroll) is checked by tools/phone_check.mjs, and the wide layout's by tools/browser_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createBlocksEditor, isPhoneScreen, LAYOUTS } from "../editor/index.js";

test("a phone is a screen whose narrow side is under 600 CSS px, whichever way it is held", () => {
  assert.equal(isPhoneScreen(360, 720), true);
  assert.equal(isPhoneScreen(720, 360), true);       // turned on its side: the narrow side is the same
  assert.equal(isPhoneScreen(347, 760), true);       // the maintainer's Nokia
  assert.equal(isPhoneScreen(599, 900), true);
  assert.equal(isPhoneScreen(600, 900), false);
  assert.equal(isPhoneScreen(744, 1133), false);     // an iPad mini starts as a tablet
  assert.equal(isPhoneScreen(1920, 1080), false);
});

test("there are two layouts, wide and phone", () => {
  assert.deepEqual(LAYOUTS, ["wide", "phone"]);
});

test("a name that is not a layout is refused, before anything is drawn", () => {
  assert.throws(() => createBlocksEditor({ element: null, layout: "tablet" }), /layout must be "wide" or "phone", not tablet/);
  assert.throws(() => createBlocksEditor({ element: null, layout: "phone-b" }), /layout must be/);
});

test("the toolbox's column is Blockly's page only: the style has no rule for a row of kinds", () => {
  const css = readFileSync(new URL("../editor/blocks/toolbox_icons.js", import.meta.url), "utf8");
  assert.match(css, /\.injectionDiv \.blocklyToolbox \{ width: 46px; \}/);
  assert.doesNotMatch(css, /bf-phone/);
});

test("the bundle's entry gives the host the layout names and the screen rule", () => {
  const entry = readFileSync(new URL("../editor/bundle.js", import.meta.url), "utf8");
  assert.match(entry, /isPhoneScreen/);
  assert.match(entry, /LAYOUTS/);
});
