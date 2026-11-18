// BF-15 round 4 (BF-D-051): Python code blocks fold to one line. The fold is how a block is drawn: it is not saved, it is not a
// step to undo, and the Python the blocks make is the same folded or open.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { generator } from "../editor/generator/python.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { EditorTracker } from "../editor/editors/index.js";
import { FieldMultilineInput } from "../editor/editors/plugins.js";
import { FOLDED, OPEN, PREVIEW_LENGTH, canFold, isFolded, previewOf, refreshFold, refreshFolds, toggleFold } from "../editor/fold.js";
import { completions } from "./catalogue_support.js";

const NOTES = "\"\"\"Fonts and styles\n\nThe first four lines use the four built-in styles.\n\"\"\"";
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const noIds = (json) => JSON.parse(JSON.stringify(json, (key, value) => (key === "id" ? undefined : value)));

/** A workspace for the length of fn (which may wait: then the workspace stays until it is done). */
function withWorkspace(fn) {
  registerBlocks({ words: "scratch", pythonLine: true });
  const workspace = new Blockly.Workspace();
  const done = () => workspace.dispose();
  let result;
  try {
    result = fn(workspace);
  } catch (error) {
    done();
    throw error;
  }
  if (result && typeof result.then === "function") return result.finally(done);
  done();
  return result;
}

const code = (workspace, text, type = "code") => Blockly.serialization.blocks.append({ type: typeOf(type), fields: { TEXT: text }, x: 0, y: 0 }, workspace);

test("the first line shows as the preview: trimmed, cut when long, and a … when more follows", () => {
  assert.equal(previewOf("x = 1"), "x = 1");
  assert.equal(previewOf("  x = 1  "), "x = 1");
  assert.equal(previewOf(NOTES), "\"\"\"Fonts and styles…");
  assert.equal(previewOf("a = 1\nb = 2"), "a = 1…");
  assert.equal(previewOf("a = 1\n\n  \n"), "a = 1", "blank lines after it are nothing more");
  const long = "print('a very long first line that does not fit')";
  assert.ok(previewOf(long).length <= PREVIEW_LENGTH, "it fits the one line");
  assert.ok(previewOf(long).endsWith("…"));
});

test("every Python code block starts folded, with a ▸ and its first line, a short one too", () => {
  withWorkspace((workspace) => {
    const notes = code(workspace, NOTES);
    const short = code(workspace, "pass");
    assert.equal(isFolded(notes), false, "not decided until the text is seen");
    refreshFolds(workspace);
    assert.equal(isFolded(notes), true);
    assert.equal(notes.getFieldValue("FOLD"), `${FOLDED} Python code:`);
    assert.equal(notes.bfFold.preview.getValue(), "\"\"\"Fonts and styles…");
    assert.equal(notes.getField("TEXT").isVisible(), false);
    assert.equal(notes.bfFold.preview.isVisible(), true);
    assert.equal(isFolded(short), true, "a one-line block starts folded too");
    assert.equal(short.getFieldValue("FOLD"), `${FOLDED} Python code:`);
    assert.equal(short.bfFold.preview.getValue(), "pass");
    assert.equal(short.getField("TEXT").isVisible(), false);
    assert.equal(short.bfFold.preview.isVisible(), true);
    toggleFold(short);
    assert.equal(short.getFieldValue("FOLD"), `${OPEN} Python code:`, "and a tap opens it");
  });
});

test("a tap opens a folded block and folds an open one, in both directions, with a ▸ and a ▾", () => {
  withWorkspace((workspace) => {
    const notes = code(workspace, NOTES);
    refreshFolds(workspace);
    toggleFold(notes);
    assert.equal(isFolded(notes), false);
    assert.equal(notes.getFieldValue("FOLD"), `${OPEN} Python code:`);
    assert.equal(notes.getField("TEXT").isVisible(), true);
    assert.equal(notes.bfFold.preview.isVisible(), false);
    toggleFold(notes);
    assert.equal(isFolded(notes), true);
    assert.equal(notes.getFieldValue("FOLD"), `${FOLDED} Python code:`);
  });
});

test("the control is the words 'Python code:': a tap on it folds, in Read mode too (a read-only workspace) and not in the list of blocks", () => {
  withWorkspace((workspace) => {
    const notes = code(workspace, NOTES);
    refreshFolds(workspace);
    const control = notes.getField("FOLD");
    workspace.setIsReadOnly(true);
    assert.equal(control.isClickable(), true, "folding is no edit");
    assert.equal(notes.getField("TEXT").isClickable(), false, "the text cannot be edited in a read-only workspace");
    control.showEditor();
    assert.equal(isFolded(notes), false, "the tap opened it");
    assert.equal(control.isClickableInFlyout(false), false, "in the toolbox a tap on the block adds it");
    assert.equal(control.isClickableInFlyout(true), false);
  });
});

test("the Python is the same folded or open, and nothing about the fold is saved", () => {
  withWorkspace((workspace) => {
    const notes = code(workspace, NOTES);
    const python = generator.workspaceToCode(workspace);
    const json = noIds(Blockly.serialization.workspaces.save(workspace));
    refreshFolds(workspace);
    assert.equal(generator.workspaceToCode(workspace), python, "folded");
    assert.deepEqual(noIds(Blockly.serialization.workspaces.save(workspace)), json, "folded: the same JSON");
    toggleFold(notes);
    assert.equal(generator.workspaceToCode(workspace), python, "open");
    assert.deepEqual(noIds(Blockly.serialization.workspaces.save(workspace)), json, "open: the same JSON");
    const text = JSON.stringify(json);
    assert.ok(!/collapsed|FOLD|PREVIEW|Python code/.test(text), "nothing of the fold is in the JSON: " + text);
    assert.equal(json.blocks.blocks[0].fields.TEXT, NOTES);
  });
});

test("folding is not a step to undo: no event, so nothing in the history and the redo list is left alone", async () => {
  await withWorkspace(async (workspace) => {
    const notes = code(workspace, NOTES);
    const edit = code(workspace, "a = 1");
    workspace.clearUndo();
    await tick();
    refreshFolds(workspace);
    toggleFold(notes);
    toggleFold(notes);
    toggleFold(edit);
    await tick();
    assert.equal(workspace.getUndoStack().length, 0, "folding and opening are not steps");
    // an edit is, and undo takes the edit back without touching the fold
    edit.setFieldValue("a = 2", "TEXT");
    await tick();
    assert.equal(workspace.getUndoStack().length, 1);
    workspace.undo(false);
    await tick();
    assert.equal(edit.getFieldValue("TEXT"), "a = 1");
    assert.equal(workspace.getRedoStack().length, 1);
    toggleFold(notes);
    assert.equal(workspace.getRedoStack().length, 1, "opening a block does not clear what can be done again");
  });
});

test("the preview follows the text when it changes (an undo, a load), and a block that cannot fold any more is open", () => {
  withWorkspace((workspace) => {
    const notes = code(workspace, NOTES);
    refreshFolds(workspace);
    notes.setFieldValue("x = 1\ny = 2", "TEXT");
    assert.equal(refreshFold(notes), true);
    assert.equal(notes.bfFold.preview.getValue(), "x = 1…");
    assert.equal(isFolded(notes), true, "still folded");
    assert.equal(refreshFold(notes), false, "nothing changed: nothing is drawn again");
  });
});

test("a value block folds only when its text has several lines; a one-line one shows the words with no arrow", () => {
  withWorkspace((workspace) => {
    const one = code(workspace, "a + b", "code_value");
    const many = code(workspace, "(a +\n b)", "code_value");
    refreshFolds(workspace);
    assert.equal(canFold(one), false);
    assert.equal(one.getFieldValue("FOLD"), "Python code:");
    assert.equal(one.getField("FOLD").isClickable(), false, "nothing to fold");
    assert.equal(one.getField("TEXT").isVisible(), true);
    assert.equal(canFold(many), true);
    assert.equal(isFolded(many), true);
    assert.equal(many.getFieldValue("FOLD"), `${FOLDED} Python code:`);
    assert.equal(many.getField("TEXT").isVisible(), false);
  });
});

test("with the editors on, the text field the swap puts in is hidden too while the block is folded", () => {
  registerBlocks({ catalogue: completions });
  const workspace = new Blockly.Workspace();
  const editors = new EditorTracker(workspace, createCatalogue(completions));
  try {
    const notes = code(workspace, NOTES);
    refreshFolds(workspace);
    editors.update();
    assert.ok(notes.getField("TEXT") instanceof FieldMultilineInput, "several lines");
    assert.equal(notes.getField("TEXT").isVisible(), false, "folded: the new field is not shown");
    assert.equal(notes.bfFold.preview.isVisible(), true);
    toggleFold(notes);
    assert.equal(notes.getField("TEXT").isVisible(), true);
    assert.equal(notes.getFieldValue("TEXT"), NOTES);
  } finally {
    editors.dispose();
    workspace.dispose();
    registerBlocks({});
  }
});

test("the column is asked to put the stacks in order again when a block folds", () => {
  withWorkspace((workspace) => {
    const notes = code(workspace, NOTES);
    refreshFolds(workspace);
    let asked = 0;
    workspace.bfColumn = { schedule: () => { asked += 1; } };
    toggleFold(notes);
    toggleFold(notes);
    assert.equal(asked, 2);
  });
});
