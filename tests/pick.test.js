// BF-15 round 3 (BF-D-050): pick then move, adding a block by a tap, find a block, undo. These are the rules, on blocks with
// no page; what a finger does on a phone (a drag scrolls, a tap picks, the bar) is checked by tools/phone_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, toolboxBlock, typeOf } from "../editor/blocks/register.js";
import { Picker } from "../editor/pick.js";
import { addBlock, NO_SLOT, NO_ROOM } from "../editor/add.js";
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
// Comparing two blocks with assert.equal prints both when they differ, and a block is a huge object: compare their ids.
const same = (one, other, message) => assert.equal(one?.id, other?.id, message);
const sameBlocks = (blocks, expected, message) => assert.deepEqual(blocks.map((b) => b.id), expected.map((b) => b.id), message);

/** The statements of the workspace (not the values in them), by type. */
const types = (workspace) => workspace.getAllBlocks(true).filter((b) => !b.outputConnection).map((b) => b.type.replace("bf_", ""));

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
// Pick

test("a tap picks the block and the ones under it; a tap again, only it; again, the stack; and so on", async () => {
  await withWorkspace((workspace) => {
    const { a, b, c } = three(workspace);
    const picker = new Picker(workspace);
    assert.equal(picker.info(), null);
    picker.tap(a);
    sameBlocks(picker.blocks(), [a, b, c]);
    assert.equal(picker.info().count, 3);
    assert.equal(picker.info().single, false);
    picker.tap(a);
    sameBlocks(picker.blocks(), [a]);
    assert.equal(picker.info().single, true);
    assert.equal(picker.info().count, 1);
    picker.tap(a);
    sameBlocks(picker.blocks(), [a, b, c], "a further tap goes back to the stack");
    picker.tap(a);
    sameBlocks(picker.blocks(), [a], "and so on, in turn");
  });
});

test("a tap on another block picks that block's stack; on the last block, only it, and a tap again changes nothing", async () => {
  await withWorkspace((workspace) => {
    const { a, b, c } = three(workspace);
    const picker = new Picker(workspace);
    picker.tap(a);
    picker.tap(b);
    sameBlocks(picker.blocks(), [b, c]);
    assert.equal(picker.info().single, false);
    picker.tap(c);
    sameBlocks(picker.blocks(), [c]);
    assert.equal(picker.info().single, true);
    assert.equal(picker.info().canTurn, false, "nothing under it: no hint to tap again");
    picker.tap(c);
    sameBlocks(picker.blocks(), [c]);
    picker.clear();
    assert.equal(picker.info(), null, "a tap on empty space puts down");
    assert.deepEqual(picker.blocks(), []);
  });
});

test("only what is picked moves: the picked blocks and what is inside them, not the blocks under a single one", async () => {
  await withWorkspace((workspace) => {
    const { a, b, c } = three(workspace);
    const inside = put(workspace, s.set("v", n(1)).json);                       // a statement with a value inside
    const picker = new Picker(workspace);
    picker.tap(a);
    assert.deepEqual([a, b, c].map((blk) => picker.owns(blk)), [true, true, true]);
    picker.tap(a);                                                               // only a
    assert.deepEqual([a, b, c].map((blk) => picker.owns(blk)), [true, false, false]);
    picker.tap(inside);
    const slot = inside.getInputTargetBlock("VALUE");
    assert.equal(picker.owns(slot), true, "the value in a picked block goes with it");
    assert.equal(picker.owns(a), false);
  });
});

test("the count is the blocks a learner sees: statements, with the ones inside a C, not the values", async () => {
  await withWorkspace((workspace) => {
    const loop = put(workspace, s.repeat(n(3), [s.say(t("a")), s.say(t("b"))]).json);
    const picker = new Picker(workspace);
    picker.tap(loop);
    assert.equal(picker.info().count, 3, "the repeat and the two in it");
  });
});

test("a block that goes away is not picked any more", async () => {
  await withWorkspace((workspace) => {
    const { a } = three(workspace);
    const picker = new Picker(workspace);
    picker.tap(a);
    a.dispose(false);
    picker.update();
    assert.equal(picker.info(), null);
  });
});

test("Delete: a stack goes whole, one block goes alone and the gap closes; each is one step to undo", async () => {
  await withWorkspace(async (workspace) => {
    const { a, b, c } = three(workspace);
    await tick();
    workspace.clearUndo();
    const picker = new Picker(workspace);
    picker.tap(b);                          // b and c
    assert.equal(picker.deletePicked(), 2);
    await tick();
    assert.deepEqual(types(workspace), ["say"], "only a is left");
    workspace.undo(false);
    assert.equal(types(workspace).length, 3, "one undo brings both back");
    // undo makes the blocks again, so they are looked up by id
    const aNow = workspace.getBlockById(a.id);
    picker.pick(workspace.getBlockById(b.id), true);
    picker.deletePicked();
    await tick();
    same(aNow.getNextBlock(), workspace.getBlockById(c.id), "the gap closed");
    workspace.undo(false);
    same(workspace.getBlockById(a.id).getNextBlock(), { id: b.id }, "the block is back where it was");
    assert.equal(types(workspace).length, 3);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Adding by a tap

test("a statement goes right under the picked block; what was under follows it; the new block is picked alone", async () => {
  await withWorkspace((workspace) => {
    const { a, b, c } = three(workspace);
    const picker = new Picker(workspace);
    picker.tap(a);                                           // the stack is picked: under the first
    const result = addBlock(workspace, picker, toolboxBlock("set"));
    assert.equal(result.ok, true);
    const added = result.block;
    same(a.getNextBlock(), added);
    same(added.getNextBlock(), b, "the rest follows the new block");
    same(b.getNextBlock(), c);
    sameBlocks(picker.blocks(), [added]);
    assert.equal(picker.info().single, true);
    // the next tap adds under the new one: a sequence
    const again = addBlock(workspace, picker, toolboxBlock("change"));
    same(added.getNextBlock(), again.block);
    assert.deepEqual(types(workspace).sort(), ["change", "say", "say", "say", "set"]);
  });
});

test("one add is one step to undo", async () => {
  await withWorkspace(async (workspace) => {
    const { a } = three(workspace);
    await tick();
    workspace.clearUndo();
    const picker = new Picker(workspace);
    picker.tap(a);
    addBlock(workspace, picker, toolboxBlock("set"));
    await tick();
    assert.equal(types(workspace).length, 4);
    workspace.undo(false);
    assert.equal(types(workspace).length, 3, "the block and its place, in one undo");
    assert.equal(workspace.getBlockById(a.id).getNextBlock().type, typeOf("say"));
    assert.equal(workspace.getUndoStack().length, 0);
  });
});

test("a value goes into the first empty slot that takes it, and the picked block stays picked", async () => {
  await withWorkspace((workspace) => {
    const call = put(workspace, toolboxBlock("set"));                 // set v to 0: the 0 is the toolbox's default, so the slot counts as empty
    const picker = new Picker(workspace);
    picker.tap(call);
    const result = addBlock(workspace, picker, toolboxBlock("sqrt"));
    assert.equal(result.ok, true);
    same(call.getInputTargetBlock("VALUE"), result.block);
    sameBlocks(picker.blocks(), [call], "so a second slot can be filled next");
  });
});

test("a value with no slot to take it: nothing is added, and the answer says so", async () => {
  await withWorkspace(async (workspace) => {
    const plain = put(workspace, { type: typeOf("number"), fields: { NUM: "1" } });   // a number has no slot at all
    const full = put(workspace, s.set("v", n(1)).json);                               // its one slot holds a block of the learner's
    await tick();
    workspace.clearUndo();
    const picker = new Picker(workspace);
    const before = workspace.getAllBlocks(false).length;
    picker.tap(plain);
    assert.deepEqual(addBlock(workspace, picker, toolboxBlock("sqrt")), { ok: false, message: NO_SLOT });
    picker.tap(full);
    assert.deepEqual(addBlock(workspace, picker, toolboxBlock("sqrt")), { ok: false, message: NO_SLOT });
    assert.equal(workspace.getAllBlocks(false).length, before, "nothing was added");
    await tick();
    assert.equal(workspace.getUndoStack().length, 0, "a refusal leaves no step to undo");
  });
});

test("a statement cannot go under a value", async () => {
  await withWorkspace((workspace) => {
    const plain = put(workspace, { type: typeOf("number"), fields: { NUM: "1" } });
    const picker = new Picker(workspace);
    picker.tap(plain);
    assert.deepEqual(addBlock(workspace, picker, toolboxBlock("set")), { ok: false, message: NO_ROOM });
  });
});

test("with nothing picked: the end of the every-frame block, else the first hat's, else the workspace in view", async () => {
  await withWorkspace((workspace) => {
    // no hat: it is put on the workspace
    const loose = addBlock(workspace, new Picker(workspace), toolboxBlock("set"));
    assert.equal(loose.ok, true);
    assert.equal(loose.block.getParent(), null);
    loose.block.dispose(false);
    // a key hat, then the every-frame hat: the every-frame one wins, and the block goes at the end of its C
    const key = put(workspace, { type: typeOf("key_pressed"), inputs: { DO: { block: s.say(t("k")).json } } });
    const frame = put(workspace, { type: typeOf("sketch_frame"), inputs: { DO: { block: s.say(t("f")).json } } });
    const picker = new Picker(workspace);
    const second = addBlock(workspace, picker, toolboxBlock("set"));
    same(second.block.getParent().getParent(), frame, "after the say in the every-frame block");
    const third = addBlock(workspace, picker, toolboxBlock("change"));
    same(third.block.getParent(), second.block, "the new block is picked, so the next goes under it");
    // without the every-frame hat, the first hat
    frame.dispose(false);
    picker.clear();
    const fourth = addBlock(workspace, picker, toolboxBlock("subtract"));
    same(fourth.block.getParent().getParent(), key);
  });
});

test("a hat that is picked takes the new block as the first block of its C", async () => {
  await withWorkspace((workspace) => {
    const frame = put(workspace, { type: typeOf("sketch_frame"), inputs: { DO: { block: s.say(t("f")).json } } });
    const picker = new Picker(workspace);
    picker.tap(frame);
    const result = addBlock(workspace, picker, toolboxBlock("set"));
    same(result.block.getParent(), frame);
    assert.equal(result.block.getNextBlock().type, typeOf("say"));
  });
});

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
