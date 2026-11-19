// Adding a block by a tap (BF-D-050), for the phone layout: a tap on a block in the flyout puts a copy in the program, so
// nothing has to be dragged across the screen.
//
//   - A block that goes in a stack (a statement) goes under the picked block, straight after it; what was under the picked
//     block follows the new one. A hat or a C-shaped block with nothing after it (no next connection) takes it as the first
//     block of its C. With nothing picked, it goes at the end of the "every frame" block's C, else at the end of the first
//     hat's, else on the workspace in view.
//   - A value (a number, a colour, a name) goes into the first slot of the picked block that is empty (a slot with only its
//     default value counts as empty) and accepts it. If there is none, nothing is added and the answer says so. With nothing
//     picked a value is put on the workspace in view.
//   - The new block is picked alone, so the next tap adds under it. (A value leaves the block it went into picked, so
//     several slots can be filled one after another.)
//   - One tap is one step to undo.

import * as Blockly from "blockly";
import { BLOCKS } from "./blocks/table.js";
import { typeOf } from "./blocks/register.js";

export const NO_SLOT = "No empty slot in this block takes that.";
export const NO_ROOM = "Nothing can go under this block.";

const HATS = new Set(BLOCKS.filter((b) => b.hat).map((b) => typeOf(b.type)));
const FRAME = typeOf("sketch_frame");

/** Runs `fn` with a block made from `state`, and takes the block away again, leaving no event for undo. */
function withProbe(workspace, state, fn) {
  Blockly.Events.disable();
  try {
    const block = Blockly.serialization.blocks.append(state, workspace);
    try {
      return fn(block);
    } finally {
      block.dispose(false);
    }
  } finally {
    Blockly.Events.enable();
  }
}

const checker = (workspace) => workspace.connectionChecker;

/** The first value slot of a block that is empty (or holds only its default value) and takes `value` (a block). */
function emptySlot(workspace, owner, value) {
  for (const input of owner.inputList) {
    if (input.type !== Blockly.inputs.inputTypes.VALUE || !input.connection) continue;
    const held = input.connection.targetBlock();
    if (held && !held.isShadow()) continue;
    if (checker(workspace).canConnect(value.outputConnection, input.connection, false, Infinity)) return input.name;
  }
  return null;
}

/** Where a block goes just under `owner`: its next connection or, with none (a hat), the start of its first C. */
export function belowOf(owner) {
  if (owner.nextConnection) return owner.nextConnection;
  const input = owner.inputList.find((i) => i.type === Blockly.inputs.inputTypes.STATEMENT && i.connection);
  return input?.connection ?? null;
}

/** The connection at the end of a C's blocks (or the C itself when it is empty); null if the last block cannot take more. */
export function endOf(connection) {
  let c = connection;
  for (let b = c.targetBlock(); b && !b.isShadow(); b = c.targetBlock()) {
    if (!b.nextConnection) return null;
    c = b.nextConnection;
  }
  return c;
}

/** The end of the "every frame" block's C, else of the first hat's. */
export function endOfSketch(workspace) {
  const tops = workspace.getTopBlocks(true);
  const hats = [tops.find((b) => b.type === FRAME), tops.find((b) => HATS.has(b.type))];
  for (const hat of hats) {
    const body = hat?.getInput("DO")?.connection;
    const end = body && endOf(body);
    if (end) return end;
  }
  return null;
}

/** Puts a block at the top left of what the learner sees. */
function placeInView(workspace, block) {
  const view = workspace.getMetricsManager?.().getViewMetrics?.(true);
  const at = block.getRelativeToSurfaceXY();
  const to = view ? { x: view.left + 24, y: view.top + 24 } : { x: 0, y: 0 };
  block.moveBy(to.x - at.x, to.y - at.y);
  block.bumpNeighbours?.();
}

/**
 * Adds a block made from `state` (Blockly JSON, as the toolbox holds it) by the rules above.
 * Returns `{ ok: true, block }` or `{ ok: false, message }`; with `ok: false` nothing was changed.
 */
export function addBlock(workspace, picker, state) {
  const owner = picker.active ? picker.anchor : null;
  // what the block is, and where it will go, found with a block that is thrown away again
  const plan = withProbe(workspace, state, (probe) => {
    if (probe.outputConnection) {
      if (!owner) return { where: "view" };
      const slot = emptySlot(workspace, owner, probe);
      return slot ? { where: "slot", slot } : { fail: NO_SLOT };
    }
    if (!probe.previousConnection) return { where: "view" };           // a hat, or a block of its own
    if (owner) {
      const under = belowOf(owner);
      return under && checker(workspace).canConnect(probe.previousConnection, under, false, Infinity)
        ? { where: "under" } : { fail: NO_ROOM };
    }
    return endOfSketch(workspace) ? { where: "sketch" } : { where: "view" };
  });
  if (plan.fail) return { ok: false, message: plan.fail };

  const outer = Blockly.Events.getGroup();
  if (!outer) Blockly.Events.setGroup(true);
  try {
    const block = Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
    if (plan.where === "slot") owner.getInput(plan.slot).connection.connect(block.outputConnection);
    else if (plan.where === "under") belowOf(owner).connect(block.previousConnection);
    else if (plan.where === "sketch") endOfSketch(workspace).connect(block.previousConnection);
    else placeInView(workspace, block);
    if (plan.where !== "slot") picker.pick(block, true);
    return { ok: true, block };                    // the page brings it into view (attach.js: it knows what lies over the workspace)
  } finally {
    if (!outer) Blockly.Events.setGroup(false);
  }
}
