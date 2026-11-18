// BF-15 (BF-D-049): the phone layout. These are the parts that need no page; the page itself (a row at the bottom, a tap,
// a touch drag, no sideways scroll) is checked by tools/phone_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createBlocksEditor, isPhoneScreen, layoutOptions, LAYOUTS } from "../editor/index.js";

test("a phone is a screen whose narrow side is under 600 CSS px, whichever way it is held", () => {
  assert.equal(isPhoneScreen(360, 720), true);
  assert.equal(isPhoneScreen(720, 360), true);       // turned on its side: the narrow side is the same
  assert.equal(isPhoneScreen(347, 760), true);       // the maintainer's Nokia
  assert.equal(isPhoneScreen(599, 900), true);
  assert.equal(isPhoneScreen(600, 900), false);
  assert.equal(isPhoneScreen(744, 1133), false);     // an iPad mini starts as a tablet
  assert.equal(isPhoneScreen(1920, 1080), false);
});

test("the wide layout adds nothing to Blockly's options; the phone layout is the bottom toolbox, horizontal", () => {
  assert.deepEqual(LAYOUTS, ["wide", "phone"]);
  assert.deepEqual(layoutOptions("wide"), {});
  const phone = layoutOptions("phone");
  assert.equal(phone.toolboxPosition, "end");
  assert.equal(phone.horizontalLayout, true);
  assert.equal(phone.zoom.pinch, true);
  assert.equal(phone.zoom.controls, true);
});

test("a name that is not a layout is refused, before anything is drawn", () => {
  assert.throws(() => layoutOptions("tablet"), /layout must be "wide" or "phone", not tablet/);
  assert.throws(() => createBlocksEditor({ element: null, layout: "tablet" }), /layout must be/);
});

test("the phone's style is scoped to the phone layout, and the column's width is not", () => {
  const css = readFileSync(new URL("../editor/blocks/toolbox_icons.js", import.meta.url), "utf8");
  assert.match(css, /\.injectionDiv:not\(\.bf-phone\) \.blocklyToolbox \{ width: 46px; \}/);
  assert.match(css, /\.injectionDiv\.bf-phone \.blocklyToolboxCategory \{ width: 44px; height: 44px; \}/);
  assert.match(css, /\.injectionDiv\.bf-phone \.blocklyToolboxCategoryGroup \{ flex-wrap: nowrap; \}/);
});

test("the bundle's entry gives the host the layout names and the screen rule", () => {
  const entry = readFileSync(new URL("../editor/bundle.js", import.meta.url), "utf8");
  assert.match(entry, /isPhoneScreen/);
  assert.match(entry, /LAYOUTS/);
});
