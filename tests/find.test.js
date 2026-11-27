// Find a block (BF-D-050), and the start of a program: the rules, on blocks with no page.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { findBlocks, wordsOf, HINT, NOTHING } from "../editor/find.js";
import { stmt as s, num as n, text as t } from "./dsl.js";

const SCRATCH = { words: "scratch", pythonLine: true };
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function withWorkspace(fn) {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  try {
    return await fn(workspace);
  } finally {
    workspace.dispose();
  }
}

/** Puts blocks (the dsl's JSON) on the workspace, and gives back the top block. */
const put = (workspace, json) => Blockly.serialization.blocks.append({ ...json, x: 0, y: 0 }, workspace);

/** Three say blocks in a stack: a, b, c. */
const three = (workspace) => {
  const a = put(workspace, {
    ...s.say(t("a")).json,
    next: { block: { ...s.say(t("b")).json, next: { block: s.say(t("c")).json } } },
  });
  const b = a.getNextBlock();
  return { a, b, c: b.getNextBlock() };
};

// ---------------------------------------------------------------------------------------------------------------
// Find a block

const found = (query) => findBlocks(query).map((b) => b.type.replace("bf_", ""));

test("find: words match by their start, in any case and in any order, by the block's words and by its Python name", async () => {
  registerBlocks(SCRATCH);
  assert.ok(found("sq").includes("sqrt"), "sq finds square root of");
  assert.ok(found("SQUARE").includes("sqrt"));
  assert.deepEqual(found("circle"), ["circle"]);
  assert.deepEqual(found("size circle"), ["circle"], "words in any order");
  assert.deepEqual(found("f.circle"), ["circle"], "the Python name of the call");
  assert.ok(found("randint").includes("randint"), "Python's name for pick random");
  assert.ok(found("random").includes("randint"));
  assert.ok(found("print").includes("say"), "say is print in Python");
  assert.deepEqual(found("zzzz"), []);
  assert.deepEqual(found("  "), [], "an empty field finds nothing: the flyout shows the hint");
  assert.ok(HINT && NOTHING);
  assert.deepEqual([...wordsOf("f.canvas_size {W} by [X]")].sort(), ["by", "canvas", "f", "f.canvas_size", "size"].sort());
});

test("find: a block whose first word matches comes before one that only has the word inside it", async () => {
  registerBlocks(SCRATCH);
  const list = found("round");
  assert.equal(list[0], "round");
});

test("find: the calls of the learner's own blocks are found by name", async () => {
  await withWorkspace((workspace) => {
    put(workspace, s.def("sparkle", "", [s.say(t("hi"))]).json);
    const own = findBlocks("sparkle", workspace);
    assert.equal(own.length, 1);
    assert.equal(own[0].type, typeOf("own_call"));
    assert.equal(own[0].fields.NAME, "sparkle");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Undo

test("a program put in is the start: after the events of a load settle, there is nothing to undo; the first edit is one step", async () => {
  await withWorkspace(async (workspace) => {
    const { a } = three(workspace);
    const json = Blockly.serialization.workspaces.save(workspace);
    workspace.clear();
    Blockly.serialization.workspaces.load(json, workspace);
    workspace.clearUndo();                                  // what the editor does after a load (startHere in index.js)
    await tick();
    assert.equal(workspace.getUndoStack().length, 0);
    assert.equal(workspace.getRedoStack().length, 0);
    Blockly.serialization.blocks.append(s.set("v", n(1)).json, workspace, { recordUndo: true });
    await tick();
    assert.equal(workspace.getUndoStack().length, 1, "the first edit is one step");
    assert.equal(a.workspace, workspace);
  });
});
