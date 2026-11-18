// BF-15 round 4 (BF-D-051): the stacks stand in one column, never overlapping. The plan is a pure function; the pass is tried on
// blocks with no page, with a measure that gives each block's height (a page gives it from the drawing).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { Column, planColumn, GAP, LEFT, TOP, REASON } from "../editor/column.js";

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

/** A workspace of "code" blocks (a statement with one field to change), with a height for each, and a column over it. */
async function withColumn(fn) {
  registerBlocks({ words: "scratch", pythonLine: true });
  const workspace = new Blockly.Workspace();
  const heights = new Map();
  const measure = (block) => {
    const at = block.getRelativeToSurfaceXY();
    return { left: at.x, top: at.y, height: heights.get(block.id) };
  };
  const column = new Column(workspace, { measure, rendered: async () => {} });
  const make = (name, y, height, x = 0) => {
    const block = Blockly.serialization.blocks.append({ type: typeOf("code"), fields: { TEXT: name }, x, y }, workspace);
    heights.set(block.id, height);
    return block;
  };
  try {
    return await fn({ workspace, column, make, heights });
  } finally {
    column.dispose();
    workspace.dispose();
  }
}

/** [y of each top block, top to bottom], by text. */
const column = (workspace) => workspace.getTopBlocks(true).map((b) => [b.getFieldValue("TEXT"), Math.round(b.getRelativeToSurfaceXY().x), Math.round(b.getRelativeToSurfaceXY().y)]);

// ---------------------------------------------------------------------------------------------------------------
// The plan

test("the plan puts the stacks one under another at one left edge with a fixed gap, in the order given", () => {
  const moves = planColumn([
    { id: "a", left: 300, top: 5, height: 40 },
    { id: "b", left: 10, top: 90, height: 60 },
    { id: "c", left: 0, top: 400, height: 10 },
  ]);
  assert.deepEqual(moves, [
    { id: "a", dx: LEFT - 300, dy: TOP - 5 },
    { id: "b", dx: LEFT - 10, dy: TOP + 40 + GAP - 90 },
    { id: "c", dx: LEFT - 0, dy: TOP + 40 + GAP + 60 + GAP - 400 },
  ]);
});

test("a column that is already in place needs no move, so a second pass moves nothing", () => {
  const stacks = [{ id: "a", left: LEFT, top: TOP, height: 40 }, { id: "b", left: LEFT, top: TOP + 40 + GAP, height: 25 }];
  assert.deepEqual(planColumn(stacks), []);
  assert.deepEqual(planColumn(stacks, { left: 5, top: 5, gap: 1 }).map((m) => m.id), ["a", "b"], "another place needs moves");
});

test("whatever the sizes and places, after the plan no two stacks overlap", () => {
  let seed = 7;
  const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  for (let round = 0; round < 50; round += 1) {
    const stacks = Array.from({ length: 2 + Math.floor(random() * 6) }, (_, i) => ({
      id: String(i), left: random() * 400, top: random() * 300, height: 20 + random() * 200,
    }));
    const moved = new Map(planColumn(stacks).map((m) => [m.id, m]));
    const placed = stacks.map((s) => ({ top: s.top + (moved.get(s.id)?.dy ?? 0), height: s.height, left: s.left + (moved.get(s.id)?.dx ?? 0) }));
    placed.forEach((p, i) => {
      assert.equal(Math.round(p.left * 100), LEFT * 100, "one left edge");
      if (i > 0) assert.ok(Math.abs(p.top - (placed[i - 1].top + placed[i - 1].height + GAP)) < 1e-6, "the fixed gap");
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// The pass

test("a load: stacks scattered over the page go into one column, in the order of their top edges", async () => {
  await withColumn(async ({ workspace, column: pass, make }) => {
    make("two", 300, 50, 200);
    make("one", 10, 50, 90);
    make("three", 700, 50, 5);
    const moved = await pass.settle();
    assert.equal(moved, 3);
    assert.deepEqual(column(workspace), [["one", LEFT, TOP], ["two", LEFT, TOP + 50 + GAP], ["three", LEFT, TOP + 2 * (50 + GAP)]]);
    assert.equal(await pass.settle(), 0, "a second pass over the same blocks moves nothing");
    assert.equal(workspace.getUndoStack().length, 0, "a load is not a step to undo");
  });
});

test("a stack let go between two goes in between them; on another, in the place its top edge is at", async () => {
  await withColumn(async ({ workspace, column: pass, make }) => {
    const a = make("a", 0, 50);
    make("b", 100, 50);
    const c = make("c", 200, 50);
    await pass.settle();
    await tick();
    assert.deepEqual(column(workspace).map((r) => r[0]), ["a", "b", "c"]);
    // c is let go over the gap between a and b
    Blockly.Events.setGroup(true);
    c.moveBy(0, -(c.getRelativeToSurfaceXY().y - (a.getRelativeToSurfaceXY().y + 60)));
    Blockly.Events.setGroup(false);
    await tick();
    await pass.running;
    assert.deepEqual(column(workspace), [["a", LEFT, TOP], ["c", LEFT, TOP + 70], ["b", LEFT, TOP + 140]]);
    // a is let go on b (its top edge is lower than b's): it goes after b
    Blockly.Events.setGroup(true);
    a.moveBy(0, 200);
    Blockly.Events.setGroup(false);
    await tick();
    await pass.running;
    assert.deepEqual(column(workspace).map((r) => r[0]), ["c", "b", "a"]);
    const boxes = workspace.getTopBlocks(true).map((b) => ({ top: b.getRelativeToSurfaceXY().y, bottom: b.getRelativeToSurfaceXY().y + 50 }));
    boxes.forEach((box, i) => { if (i) assert.ok(box.top >= boxes[i - 1].bottom, "no overlap"); });
  });
});

test("the move into place is part of the same undo step as the change that caused it", async () => {
  await withColumn(async ({ workspace, column: pass, make }) => {
    const a = make("a", 0, 50);
    make("b", 100, 50);
    const c = make("c", 200, 50);
    await pass.settle();
    await tick();
    const before = column(workspace);
    assert.equal(workspace.getUndoStack().length, 0);
    Blockly.Events.setGroup(true);                       // what a drag does: its events share a group
    c.moveBy(0, -(c.getRelativeToSurfaceXY().y - (a.getRelativeToSurfaceXY().y + 60)));
    Blockly.Events.setGroup(false);
    await tick();
    await pass.running;
    await tick();
    const after = column(workspace);
    assert.notDeepEqual(after, before);
    const groups = new Set(workspace.getUndoStack().map((e) => e.group));
    assert.equal(groups.size, 1, "the drop and the moves into place share one group: " + [...groups]);
    assert.ok(workspace.getUndoStack().length >= 2, "the pass moved blocks as well");
    workspace.undo(false);                               // one Undo
    await tick();
    await pass.running;
    await tick();
    assert.deepEqual(column(workspace), before, "back to where everything was");
    assert.equal(workspace.getUndoStack().length, 0, "that was the whole step");
    assert.equal(new Set(workspace.getRedoStack().map((e) => e.group)).size, 1, "the pass after an undo does not clear what can be done again");
    assert.ok(workspace.getRedoStack().length >= 2, "the drop and the moves are all still to do again");
    workspace.undo(true);                                // and one Redo does it again
    await tick();
    await pass.running;
    assert.deepEqual(column(workspace), after);
  });
});

test("a change with no group (a number typed, a block's size changed by an edit) gets one, so the move into place joins it", async () => {
  await withColumn(async ({ workspace, column: pass, make, heights }) => {
    const a = make("a", 0, 50);
    const b = make("b", 100, 50);
    await pass.settle();
    await tick();
    const before = column(workspace);
    workspace.clearUndo();
    // the edit makes a taller; the field change is an event with no group
    heights.set(a.id, 120);
    a.setFieldValue("a\nlonger", "TEXT");
    await tick();
    await pass.running;
    await tick();
    assert.deepEqual(column(workspace), [["a\nlonger", LEFT, TOP], ["b", LEFT, TOP + 120 + GAP]]);
    assert.equal(new Set(workspace.getUndoStack().map((e) => e.group)).size, 1, "the edit and the move share a group");
    heights.set(a.id, 50);                               // the text is the short one again once undone
    workspace.undo(false);
    await tick();
    await pass.running;
    await tick();
    assert.deepEqual(column(workspace), before);
    assert.equal(b.getFieldValue("TEXT"), "b");
  });
});

test("the pass does not answer to its own moves, and not to an undo or a load with a step of its own", async () => {
  await withColumn(async ({ workspace, column: pass, make }) => {
    make("a", 90, 50);
    make("b", 0, 50);
    pass.schedule();
    await tick();
    await pass.running;
    await tick(80);
    assert.equal(pass.timer, null, "no pass is waiting");
    assert.equal(pass.request, null, "and none was asked for by the pass's own moves");
    assert.equal(workspace.getUndoStack().length, 0, "a load's arrangement is not written to the history");
    // the moves carry the reason
    const events = [];
    workspace.addChangeListener((event) => events.push(event));
    make("c", 5, 50);
    await tick(80);
    await pass.running;
    await tick(80);
    assert.ok(events.some((e) => e.type === Blockly.Events.BLOCK_MOVE && e.reason?.includes(REASON)), "the pass marks its moves");
  });
});

test("a drag in progress is left alone: the pass waits until it is over", async () => {
  await withColumn(async ({ workspace, column: pass, make }) => {
    make("a", 90, 50);
    make("b", 0, 50);
    let dragging = true;
    workspace.isDragging = () => dragging;
    pass.schedule();
    await tick(120);
    assert.deepEqual(column(workspace).map((r) => r[2]), [0, 90], "nothing moved under the hand");
    dragging = false;
    await tick(200);
    await pass.running;
    assert.deepEqual(column(workspace).map((r) => r[2]), [TOP, TOP + 50 + GAP]);
  });
});
