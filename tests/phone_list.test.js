// BF-D-053: the "phone" layout through the host API, in jsdom (no real layout, so sizes and taps are the browser check's:
// tools/phone_check.mjs). The editor has no Blockly page: its workspace is a plain one, the rows are HTML, and the API is the other layouts'.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createBlocksEditor, toPython } from "../editor/index.js";
import { typeOf } from "../editor/blocks/register.js";
import { stmt as s, text as t, program } from "./dsl.js";
import timeBased from "./phone_fixtures/time_based.js";

const later = () => new Promise((resolve) => setTimeout(resolve, 20));

/** An editor in the phone layout on a page of jsdom, for the length of fn; the page globals go away after. */
async function withEditor(fn, options = {}) {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const element = document.createElement("div");
  document.body.append(element);
  const changes = [];
  const editor = createBlocksEditor({ element, layout: "phone", onChange: (code) => changes.push(code), ...options });
  try {
    return await fn(editor, element, changes);
  } finally {
    editor.workspace.dispose();
    delete globalThis.document;
  }
}

const rows = (element) => [...element.querySelectorAll(".bfl-row")];

test("the editor draws the program as rows, one for each line, and the Python is the generator's", async () => {
  await withEditor(async (editor, element) => {
    assert.equal(editor.layout(), "phone");
    editor.load(timeBased);
    await later();
    assert.equal(rows(element).length, 10);
    assert.equal(editor.toPython(), toPython(editor.save()));
    assert.match(editor.toPython(), /f\.circle\(x, f\.height \/ 2, 80\)/);
    assert.equal(element.querySelectorAll(".bfl-chip").length > 20, true);
    assert.equal(editor.workspace.rendered, false, "Blockly draws nothing: the workspace has no page");
  });
});

test("two looks of the same rows: switching changes the words, not the program", async () => {
  await withEditor(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const before = editor.toPython();
    const blocks = rows(element).map((r) => r.getAttribute("aria-label"));
    assert.equal(editor.look(), "blocks");
    assert.equal(editor.look("code"), "code");
    const code = rows(element).map((r) => r.getAttribute("aria-label"));
    assert.equal(code.length, blocks.length);
    assert.notDeepEqual(code, blocks);
    assert.ok(code.includes("f.circle(x, f.height / 2, 80)"), code.join("|"));
    assert.ok(element.querySelector(".bfl-list").classList.contains("bfl-code"));
    assert.equal(editor.toPython(), before);
    assert.throws(() => editor.look("pictures"), /look must be/);
    editor.look("blocks");
    assert.deepEqual(rows(element).map((r) => r.getAttribute("aria-label")), blocks);
  });
});

test("a change to the blocks draws the rows again; undo and redo work on the model", async () => {
  await withEditor(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const number = editor.workspace.getBlocksByType(typeOf("number"), false).find((b) => b.getFieldValue("NUM") === "80");
    number.setFieldValue("120", "NUM");
    await later();
    assert.match(editor.toPython(), /f\.circle\(x, f\.height \/ 2, 120\)/);
    assert.ok([...element.querySelectorAll(".bfl-pill")].some((p) => p.textContent === "120"));
    assert.equal(editor.canUndo(), true);
    editor.undo();
    await later();
    assert.match(editor.toPython(), /, 80\)/);
    assert.ok([...element.querySelectorAll(".bfl-pill")].some((p) => p.textContent === "80"));
    assert.equal(editor.canRedo(), true);
    editor.redo();
    await later();
    assert.match(editor.toPython(), /, 120\)/);
  });
});

test("onChange hears every change with the new Python", async () => {
  await withEditor(async (editor, element, changes) => {
    editor.load(program([s.say(t("a"))]));
    await later();
    const before = changes.length;
    editor.workspace.getBlocksByType(typeOf("text"), false)[0].setFieldValue("b", "TEXT");
    await later();
    assert.ok(changes.length > before);
    assert.equal(changes.at(-1), 'print("b")\n');
  });
});

test("the error line marks the row of the block that wrote it, and clears", async () => {
  await withEditor(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const line = editor.toPython().split("\n").findIndex((l) => l.includes("f.circle(")) + 1;
    const id = editor.markError(line, "Line 13: speed is not defined");
    assert.equal(editor.workspace.getBlockById(id).type, typeOf("circle"));
    assert.ok(element.querySelector(`.bfl-row[data-block="${id}"]`).classList.contains("bfl-error"));
    editor.clearErrors();
    assert.equal(element.querySelectorAll(".bfl-error").length, 0);
  });
});

test("Python becomes rows: fromPython loads what the converter gives, in the Python's order", async () => {
  const convert = async () => ({ ok: true, raw: "x", workspace: program([s.say(t("a"))], [s.say(t("b"))]) });
  await withEditor(async (editor, element) => {
    const result = await editor.fromPython("print('a')\nprint('b')\n");
    assert.equal(result.ok, true);
    await later();
    assert.equal(editor.toPython(), 'print("a")\nprint("b")\n');
    assert.equal(rows(element).length, 2);
  }, { convert });
});

test("the render statistics count the drawings of the rows, for the checks", async () => {
  await withEditor(async (editor) => {
    assert.ok(editor.renderStats().renders >= 1);
    assert.ok(editor.renderStats().rows >= 0);
  });
});
