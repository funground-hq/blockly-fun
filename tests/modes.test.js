// BF-15 round 4 (BF-D-051): the four modes of the phone layout, and Reset. These are the rules, on blocks with no page; what a
// finger does (a tap changes nothing in Read, a number is edited in Values, ...) is checked by tools/phone_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks } from "../editor/blocks/register.js";
import { Picker, PickStrategy } from "../editor/pick.js";
import { MODES, RULES, FIRST_MODE, Modes, modeOf, resetView, watchPresses } from "../editor/modes.js";
import { stmt as s, text as t } from "./dsl.js";

function withWorkspace(fn) {
  registerBlocks({ words: "scratch", pythonLine: true });
  const workspace = new Blockly.Workspace();
  try {
    return fn(workspace);
  } finally {
    workspace.dispose();
  }
}

const put = (workspace, json) => Blockly.serialization.blocks.append({ ...json, x: 0, y: 0 }, workspace);

/** A stack of three "say" blocks: a, b, c. */
const three = (workspace) => {
  const a = put(workspace, {
    ...s.say(t("a")).json,
    next: { block: { ...s.say(t("b")).json, next: { block: s.say(t("c")).json } } },
  });
  return { a, b: a.getNextBlock(), c: a.getNextBlock().getNextBlock() };
};

/** The modes on a workspace, with a toolbox that only says whether it was asked to show. */
function modesFor(workspace) {
  const picker = new Picker(workspace);
  const shown = [];
  const heard = [];
  const modes = new Modes(workspace, { picker, toolbox: { show: (v) => shown.push(v) }, changed: (m) => heard.push(m.id) });
  return { modes, picker, shown, heard };
}

test("there are four modes, in the order and the words of the mock-up, and Read is the start", () => {
  assert.deepEqual(MODES.map((m) => m.name), ["Read", "Values", "Add", "Move"]);
  assert.deepEqual(MODES.map((m) => m.id), ["read", "values", "add", "move"]);
  assert.equal(FIRST_MODE, "read");
  assert.equal(modeOf("read").about, "Look around, zoom, open and fold. Nothing changes.");
  assert.equal(modeOf("values").about, "Change numbers, colours and words. Blocks stay put.");
  assert.equal(modeOf("add").about, "Tap a block, then add new ones under it.");
  assert.equal(modeOf("move").about, "Pick blocks, drag them to a new place, or delete them.");
  assert.equal(modeOf("move").hint, "Tap to pick, drag to move");
  assert.throws(() => modeOf("draw"), /mode must be one of read, values, add, move, not draw/);
});

test("what each mode allows: only Move moves blocks; only Read and Add are read-only; only Add shows the kinds of blocks", () => {
  assert.deepEqual(RULES.read, { readOnly: true, pick: "none", move: false, edit: false, toolbox: false });
  assert.deepEqual(RULES.values, { readOnly: false, pick: "none", move: false, edit: true, toolbox: false });
  assert.deepEqual(RULES.add, { readOnly: true, pick: "mark", move: false, edit: false, toolbox: true });
  assert.deepEqual(RULES.move, { readOnly: false, pick: "stack", move: true, edit: false, toolbox: false });
  assert.deepEqual(Object.keys(RULES), MODES.map((m) => m.id), "every mode has its rules");
});

test("a mode sets Blockly's read-only, the picker's rule and the toolbox, and tells the page", () => {
  withWorkspace((workspace) => {
    const { modes, picker, shown, heard } = modesFor(workspace);
    for (const mode of MODES) {
      modes.set(mode.id);
      assert.equal(modes.id, mode.id);
      assert.equal(workspace.isReadOnly(), RULES[mode.id].readOnly, mode.id);
      assert.equal(picker.allowed.move, RULES[mode.id].move, mode.id);
      assert.equal(shown.at(-1), RULES[mode.id].toolbox, mode.id);
    }
    assert.deepEqual(heard, ["read", "values", "add", "move"]);
    assert.throws(() => modes.set("draw"), /mode must be/);
  });
});

test("values are edited only in Values mode: a field is clickable there and in no other, and nothing is saved for it", () => {
  withWorkspace((workspace) => {
    const { modes } = modesFor(workspace);
    const { a } = three(workspace);
    const before = JSON.stringify(Blockly.serialization.workspaces.save(workspace));
    const field = a.inputList.flatMap((i) => i.fieldRow).find((f) => f.isClickable?.() !== undefined && f.EDITABLE);
    for (const mode of MODES) {
      modes.set(mode.id);
      assert.equal(a.isEditable(), mode.id === "values", mode.id);
      if (field) assert.equal(field.isClickable(), mode.id === "values", mode.id);
    }
    assert.equal(JSON.stringify(Blockly.serialization.workspaces.save(workspace)), before, "the lock leaves no trace in the saved blocks");
  });
});

test("a block on a phone has no context menu (no Delete, no Duplicate), and a block elsewhere keeps it", () => {
  withWorkspace((workspace) => {
    const { a } = three(workspace);
    assert.equal(a.contextMenu, true);
    workspace.bfNoContextMenu = true;
    const { a: phoneBlock } = three(workspace);
    assert.equal(phoneBlock.contextMenu, false);
    assert.equal(JSON.stringify(Blockly.serialization.blocks.save(phoneBlock)).includes("contextMenu"), false, "nothing is saved");
  });
});

test("a tap on a block: Read and Values do nothing; Add marks it alone; Move picks the stack, then only the block, as before", () => {
  withWorkspace((workspace) => {
    const { a, b, c } = three(workspace);
    const { modes, picker } = modesFor(workspace);
    modes.set("read");
    modes.tapBlock(a);
    assert.equal(picker.info(), null, "Read picks nothing");
    modes.set("values");
    modes.tapBlock(a);
    assert.equal(picker.info(), null, "Values picks nothing");
    modes.set("add");
    modes.tapBlock(b);
    assert.deepEqual(picker.blocks().map((x) => x.id), [b.id], "Add marks the one block, not the ones under it");
    modes.tapBlock(b);
    assert.deepEqual(picker.blocks().map((x) => x.id), [b.id], "a second tap does not turn it into the stack");
    modes.set("move");
    assert.equal(picker.info(), null, "a change of mode puts down what was marked");
    modes.tapBlock(a);
    assert.deepEqual(picker.blocks().map((x) => x.id), [a.id, b.id, c.id]);
    modes.tapBlock(a);
    assert.deepEqual(picker.blocks().map((x) => x.id), [a.id], "Move keeps round 3's rotation");
  });
});

test("only Move lets a block be dragged, and only the picked ones; in the other modes a drag moves the view", () => {
  withWorkspace((workspace) => {
    const { a, b } = three(workspace);
    const { modes, picker } = modesFor(workspace);
    const strategy = (block) => new PickStrategy(block, picker);
    modes.set("move");
    picker.tap(a);
    assert.equal(strategy(a).isMovable(), true, "picked, in Move");
    picker.tap(a);                                              // only a is picked
    assert.equal(strategy(b).isMovable(), false, "not picked, in Move");
    for (const id of ["read", "values", "add"]) {
      modes.set(id);
      picker.pick(a, true);                                     // even a block that is picked (a mark in Add)
      assert.equal(strategy(a).isMovable(), false, id);
    }
  });
});

test("a block that was picked is put down when the mode changes, so Reset and a change of mode never leave a pick behind", () => {
  withWorkspace((workspace) => {
    const { a } = three(workspace);
    const { modes, picker } = modesFor(workspace);
    modes.set("move");
    modes.tapBlock(a);
    assert.ok(picker.info());
    modes.set("read");
    assert.equal(picker.info(), null);
  });
});

test("Reset: the starting size, the first block at the top left (12 px in), nothing picked, no list of blocks open", () => {
  const calls = [];
  const workspace = {
    options: { zoomOptions: { startScale: 0.78 } },
    scale: 2,
    getToolbox: () => ({ clearSelection: () => calls.push("closed the list") }),
    setScale(value) { this.scale = value; calls.push(`scale ${value}`); },
    getBlocksBoundingBox: () => ({ left: 24, top: 40, right: 300, bottom: 500 }),
    scroll: (x, y) => calls.push(`scroll ${x.toFixed(2)} ${y.toFixed(2)}`),
  };
  const picker = { clear: () => calls.push("put down") };
  resetView(workspace, picker, 12);
  assert.deepEqual(calls, ["put down", "closed the list", "scale 0.78", "scroll -6.72 -19.20"]);
  // 12 - 24 * 0.78 = -6.72 and 12 - 40 * 0.78 = -19.2: the block's corner lands 12 px in, at the new size
});

test("a tap on a block of a read-only workspace is found from the touch that began it (Blockly sends it as a tap on empty space)", () => {
  const listeners = {};
  const block = { id: "b1" };
  const workspace = {
    getInjectionDiv: () => ({ addEventListener: (type, fn) => { listeners[type] = fn; } }),
    getBlockById: (id) => (id === "b1" ? block : null),
  };
  const presses = watchPresses(workspace);
  const on = (id) => ({ target: { closest: () => (id ? { getAttribute: () => id } : null) } });
  listeners.pointerdown(on("b1"));
  assert.equal(presses.take(), block);
  assert.equal(presses.take(), null, "a tap is taken once");
  listeners.pointerdown(on("elsewhere"));
  assert.equal(presses.take(), null, "a block of another workspace (the list of blocks) is not ours");
  listeners.pointerdown(on(null));
  assert.equal(presses.take(), null, "empty space");
});
