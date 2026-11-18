// BF-15 round 4 (BF-D-051): the foot bar (the mode button and its list, zoom out, zoom in, Reset), and the keyboard rule. The
// bar is plain page elements, so it is tried in jsdom; Reset's effect on a workspace is in modes.test.js, and the look of both
// on a phone is checked by tools/phone_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { FootBar } from "../editor/foot.js";
import { MODES, modeOf } from "../editor/modes.js";
import { coveredHeight, keepAboveKeyboard } from "../editor/keyboard.js";

/** A page for the length of fn, with the globals the bar uses. */
function withPage(fn) {
  const dom = new JSDOM("<!doctype html><body><div id=frame><div id=stage></div></div></body>");
  const had = { document: globalThis.document };
  globalThis.document = dom.window.document;
  try {
    return fn(dom.window.document, dom.window);
  } finally {
    if (had.document === undefined) delete globalThis.document;
    else globalThis.document = had.document;
  }
}

function makeBar(document) {
  const calls = [];
  const actions = { mode: (id) => calls.push(`mode ${id}`), zoom: (d) => calls.push(`zoom ${d}`), reset: () => calls.push("reset") };
  const bar = new FootBar(document.getElementById("frame"), document.getElementById("stage"), actions);
  bar.show(modeOf("read"));
  return { bar, calls };
}

const press = (window, element, key) => element.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

test("the foot bar is one row: the mode button, then zoom out, zoom in and Reset; each does its one thing", () => {
  withPage((document) => {
    const { bar, calls } = makeBar(document);
    assert.deepEqual([...bar.root.children].filter((c) => c.tagName === "BUTTON").map((b) => b.getAttribute("aria-label") ?? b.textContent.trim()),
      ["👁 Read▾", "Zoom out", "Zoom in", "Reset"]);
    assert.equal(bar.root.parentElement.id, "frame", "under the stage, last in the frame");
    bar.out.click();
    bar.in.click();
    bar.reset.click();
    assert.deepEqual(calls, ["zoom -1", "zoom 1", "reset"]);
  });
});

test("the mode button names the mode, with its icon, and says it has a menu; the hint says what a touch does", () => {
  withPage((document) => {
    const { bar } = makeBar(document);
    assert.equal(bar.label.textContent, "👁 Read");
    assert.equal(bar.button.getAttribute("aria-haspopup"), "menu");
    assert.equal(bar.button.getAttribute("aria-expanded"), "false");
    assert.equal(bar.hint.textContent, "Drag to look around");
    bar.show(modeOf("move"));
    assert.equal(bar.label.textContent, "✥ Move");
    assert.equal(bar.hint.textContent, "Tap to pick, drag to move");
  });
});

test("the list has the four modes as radios, each with its one line; the current one is checked", () => {
  withPage((document) => {
    const { bar } = makeBar(document);
    assert.equal(bar.menu.getAttribute("role"), "menu");
    assert.equal(bar.menu.hidden, true);
    assert.deepEqual(bar.items.map((i) => i.getAttribute("role")), Array(4).fill("menuitemradio"));
    assert.deepEqual(bar.items.map((i) => i.querySelector("b").textContent), MODES.map((m) => m.name));
    assert.deepEqual(bar.items.map((i) => i.querySelector("small").textContent), MODES.map((m) => m.about));
    assert.deepEqual(bar.items.map((i) => i.getAttribute("aria-checked")), ["true", "false", "false", "false"]);
    bar.show(modeOf("add"));
    assert.deepEqual(bar.items.map((i) => i.getAttribute("aria-checked")), ["false", "false", "true", "false"]);
  });
});

test("the button opens the list and the focus goes to the checked mode; Escape closes it and the focus goes back to the button", () => {
  withPage((document, window) => {
    const { bar } = makeBar(document);
    document.body.append(bar.root);
    bar.button.click();
    assert.equal(bar.menu.hidden, false);
    assert.equal(bar.button.getAttribute("aria-expanded"), "true");
    assert.equal(document.activeElement, bar.items[0], "the checked one");
    assert.equal(press(window, bar.items[0], "Escape"), false, "Escape is handled");
    assert.equal(bar.menu.hidden, true);
    assert.equal(bar.button.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, bar.button);
  });
});

test("the arrow keys, Home and End move between the modes, and wrap", () => {
  withPage((document, window) => {
    const { bar } = makeBar(document);
    document.body.append(bar.root);
    bar.open();
    press(window, document.activeElement, "ArrowDown");
    assert.equal(document.activeElement, bar.items[1]);
    press(window, document.activeElement, "End");
    assert.equal(document.activeElement, bar.items[3]);
    press(window, document.activeElement, "ArrowDown");
    assert.equal(document.activeElement, bar.items[0], "wraps round");
    press(window, document.activeElement, "ArrowUp");
    assert.equal(document.activeElement, bar.items[3]);
    press(window, document.activeElement, "Home");
    assert.equal(document.activeElement, bar.items[0]);
  });
});

test("choosing a mode changes it, closes the list and gives the focus back to the button; a touch outside closes it too", () => {
  withPage((document, window) => {
    const { bar, calls } = makeBar(document);
    document.body.append(bar.root);
    bar.open();
    bar.items[1].click();
    assert.deepEqual(calls, ["mode values"]);
    assert.equal(bar.menu.hidden, true);
    assert.equal(document.activeElement, bar.button);
    bar.open();
    document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.equal(bar.menu.hidden, true, "a touch somewhere else");
    bar.open();
    bar.reset.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.equal(bar.menu.hidden, true, "a touch on another button of the bar too");
    bar.open();
    bar.menu.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.equal(bar.menu.hidden, false, "but not on the list itself");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The keyboard

test("the part of the frame the keyboard covers is what the visual viewport leaves out; a small difference is not a keyboard", () => {
  assert.equal(coveredHeight(720, { offsetTop: 0, height: 420 }), 300);
  assert.equal(coveredHeight(720, { offsetTop: 0, height: 720 }), 0);
  assert.equal(coveredHeight(720, { offsetTop: 0, height: 680 }), 0, "a toolbar sliding away");
  assert.equal(coveredHeight(720, { offsetTop: 100, height: 320 }), 300, "a viewport that has been scrolled down");
  assert.equal(coveredHeight(720, null), 0, "a browser with no visual viewport");
});

test("while the keyboard is up the frame leaves room under the blocks, and the foot bar steps aside; both come back", () => {
  withPage((document, window) => {
    const frame = document.getElementById("frame");
    frame.getBoundingClientRect = () => ({ bottom: 720 });
    const viewport = new window.EventTarget();
    Object.assign(viewport, { offsetTop: 0, height: 720 });
    const heard = [];
    const stop = keepAboveKeyboard(frame, (height) => heard.push(height), viewport);
    assert.equal(frame.style.paddingBottom, "", "no keyboard: nothing");
    viewport.height = 420;
    viewport.dispatchEvent(new window.Event("resize"));
    assert.equal(frame.style.paddingBottom, "300px");
    assert.ok(frame.classList.contains("bf-keyboard"));
    viewport.dispatchEvent(new window.Event("scroll"));
    assert.deepEqual(heard, [300], "the page is told once, not for every event");
    viewport.height = 720;
    viewport.dispatchEvent(new window.Event("resize"));
    assert.equal(frame.style.paddingBottom, "");
    assert.ok(!frame.classList.contains("bf-keyboard"));
    assert.deepEqual(heard, [300, 0]);
    stop();
    viewport.height = 420;
    viewport.dispatchEvent(new window.Event("resize"));
    assert.equal(frame.style.paddingBottom, "", "stopped");
  });
});

test("with no visual viewport there is nothing to watch", () => {
  assert.equal(typeof keepAboveKeyboard({}, () => {}, null), "function");
});
