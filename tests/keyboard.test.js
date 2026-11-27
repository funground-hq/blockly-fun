// The keyboard rule (BF-D-051): the frame leaves room under the blocks while a phone's keyboard covers its foot. The page parts are
// plain elements, so it is tried in jsdom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { coveredHeight, keepAboveKeyboard } from "../editor/keyboard.js";

/** A page for the length of fn, with the globals the rule uses. */
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


test("the part of the frame the keyboard covers is what the visual viewport leaves out; a small difference is not a keyboard", () => {
  assert.equal(coveredHeight(720, { offsetTop: 0, height: 420 }), 300);
  assert.equal(coveredHeight(720, { offsetTop: 0, height: 720 }), 0);
  assert.equal(coveredHeight(720, { offsetTop: 0, height: 680 }), 0, "a toolbar sliding away");
  assert.equal(coveredHeight(720, { offsetTop: 100, height: 320 }), 300, "a viewport that has been scrolled down");
  assert.equal(coveredHeight(720, null), 0, "a browser with no visual viewport");
});

test("while the keyboard is up the frame leaves room under the blocks; both come back", () => {
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
