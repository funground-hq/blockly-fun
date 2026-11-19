// Moving, copying, deleting, wrapping and adding statements by their connections (BF-D-053, both spikes). No page: a block, the
// workspace and Blockly's connections. Spike A's held list and spike B's rows both call these; each decides what is picked and
// what is drawn afterwards. Every function here changes the program and leaves the undo step to the caller (inOneStep).
//
// Blockly's KeyboardMover was looked at and left: it is a move session with arrows and a preview, and a button here is one step.

import * as Blockly from "blockly";
import { toolboxBlock } from "../blocks/register.js";
import { belowOf, endOf, endOfSketch } from "../add.js";

const STATEMENT = Blockly.inputs.inputTypes.STATEMENT;

export const MOVE_WORDS = {
  first: "This is the first line.",
  last: "This is the last line.",
  noRoom: "The block above has no room inside.",
  notInside: "It is not inside another block.",
  cannot: "That block cannot go there.",
};

/** Runs `fn` as one step to undo (a step that is already open is joined). */
export function inOneStep(fn) {
  const outer = Blockly.Events.getGroup();
  if (!outer) Blockly.Events.setGroup(true);
  try {
    return fn();
  } finally {
    if (!outer) Blockly.Events.setGroup(false);
  }
}

/** What stands above a statement: its sibling (the block it hangs under), its parent (the block whose C it is first in), or nothing. */
export function above(block) {
  const c = block.previousConnection?.targetConnection;
  if (!c) return { kind: "none" };
  const owner = c.getSourceBlock();
  return owner.nextConnection === c ? { kind: "sibling", block: owner } : { kind: "parent", block: owner };
}

export const firstBody = (block) => block.inputList.find((i) => i.type === STATEMENT && i.connection)?.connection ?? null;

/** What can be done with a picked statement now (the bar greys the rest). */
export function actionsFor(block) {
  const a = above(block);
  const next = block.getNextBlock();
  return {
    below: true,
    up: a.kind === "sibling" || (a.kind === "parent" && !!a.block.previousConnection),
    down: (!!next && !!next.nextConnection) || (!next && !!block.getSurroundParent()?.nextConnection),
    in: a.kind === "sibling" && !!firstBody(a.block),
    out: !!block.getSurroundParent()?.nextConnection,
    copy: !!block.nextConnection && !!block.previousConnection,
    delete: true,
    wrap: !!block.previousConnection,
  };
}

/**
 * Takes a statement out of its stack and closes the gap: the block under it goes to where it was. (Blockly 13's unplug(true) was tried:
 * with a block under it, it left that block hanging on, and the next connection made a loop.)
 */
export function takeOut(block) {
  const up = block.previousConnection?.targetConnection;      // a hat has no previous connection
  const next = block.getNextBlock();
  const at = block.getRelativeToSurfaceXY();
  if (next && !next.isShadow()) block.nextConnection.disconnect();
  if (up) block.previousConnection.disconnect();
  if (next && up) up.connect(next.previousConnection);
  else if (next) {                                            // the first block of a stack: what is under it takes its place
    const here = next.getRelativeToSurfaceXY();
    next.moveBy(at.x - here.x, at.y - here.y);
  }
}

/** Puts a block where `before` hangs: above it, in the same stack (or at its place when it starts a stack). */
function putAbove(block, before) {
  const q = before.previousConnection?.targetConnection;
  if (q) {
    q.connect(block.previousConnection);
    return;
  }
  const at = before.getRelativeToSurfaceXY();
  const here = block.getRelativeToSurfaceXY();
  block.moveBy(at.x - here.x, at.y - here.y);
  block.nextConnection.connect(before.previousConnection);
}

// Each move gives null when it was done, or a sentence saying why it cannot be.

export function moveUp(block) {
  const a = above(block);
  if (a.kind === "none") return MOVE_WORDS.first;
  if (a.kind === "parent" && !a.block.previousConnection) return MOVE_WORDS.first;
  takeOut(block);
  putAbove(block, a.block);          // above the sibling it passes, or above the parent it leaves
  return null;
}

export function moveDown(block) {
  const next = block.getNextBlock();
  const parent = block.getSurroundParent();
  if (next) {
    if (!next.nextConnection) return MOVE_WORDS.last;
    takeOut(block);
    next.nextConnection.connect(block.previousConnection);
    return null;
  }
  if (parent?.nextConnection) {                     // the last line of a C: it leaves the C, below it
    takeOut(block);
    parent.nextConnection.connect(block.previousConnection);
    return null;
  }
  return MOVE_WORDS.last;
}

export function moveIn(block) {
  const a = above(block);
  const body = a.kind === "sibling" ? firstBody(a.block) : null;
  if (!body) return MOVE_WORDS.noRoom;
  const end = endOf(body);
  if (!end) return MOVE_WORDS.noRoom;
  takeOut(block);
  end.connect(block.previousConnection);
  return null;
}

export function moveOut(block) {
  const parent = block.getSurroundParent();
  if (!parent?.nextConnection) return MOVE_WORDS.notInside;
  takeOut(block);
  parent.nextConnection.connect(block.previousConnection);
  return null;
}

/** A copy of the statement (and what is in it), put right under it. Gives the copy. */
export function duplicate(workspace, block) {
  const state = Blockly.serialization.blocks.save(block, { addCoordinates: false, addNextBlocks: false, saveIds: false });
  const copy = Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
  block.nextConnection.connect(copy.previousConnection);
  return copy;
}

export function remove(block) {
  takeOut(block);
  block.dispose(false);
}

/** Puts a new C block (repeat, count, if) where the block is, with the block inside it. Gives the new block. */
export function wrapIn(workspace, block, type) {
  const outer = block.previousConnection.targetConnection;
  const next = block.getNextBlock();
  const at = block.getRelativeToSurfaceXY();
  const wrapper = Blockly.serialization.blocks.append(toolboxBlock(type), workspace, { recordUndo: true });
  if (next) block.nextConnection.disconnect();
  block.unplug(false);
  if (outer) outer.connect(wrapper.previousConnection);
  else {
    const here = wrapper.getRelativeToSurfaceXY();
    wrapper.moveBy(at.x - here.x, at.y - here.y);
  }
  firstBody(wrapper).connect(block.previousConnection);
  if (next) wrapper.nextConnection.connect(next.previousConnection);
  return wrapper;
}

/** The y just under everything in the workspace: a block of its own goes there, so the stacks keep their order. */
function belowEverything(workspace) {
  if (typeof workspace.getBlocksBoundingBox === "function") return workspace.getBlocksBoundingBox().bottom + 40;
  return Math.max(-40, ...workspace.getTopBlocks(false).map((b) => b.getRelativeToSurfaceXY().y)) + 40;
}

function putAtFoot(workspace, block) {
  const left = workspace.getTopBlocks(false).filter((b) => b !== block).map((b) => b.getRelativeToSurfaceXY().x);
  const at = block.getRelativeToSurfaceXY();
  block.moveBy((left.length ? Math.min(...left) : 0) - at.x, belowEverything(workspace) - at.y);
}

/**
 * Adds a block of `type` (a toolbox block) where `where` says: {kind: "below", block}, {kind: "inside", conn} or {kind: "end"} (the end of
 * the sketch). Gives `{block}`, or `{problem}` (a sentence) with nothing added.
 */
export function addAt(workspace, type, where) {
  const block = Blockly.serialization.blocks.append(toolboxBlock(type), workspace, { recordUndo: true });
  const checker = workspace.connectionChecker;
  const into = where.kind === "below" ? belowOf(where.block) : where.kind === "inside" ? where.conn : null;
  let problem = null;
  if (block.previousConnection && into) {
    if (checker.canConnect(block.previousConnection, into, false, Infinity)) into.connect(block.previousConnection);
    else problem = MOVE_WORDS.cannot;
  } else if (block.previousConnection) {
    const end = endOfSketch(workspace);
    if (end && checker.canConnect(block.previousConnection, end, false, Infinity)) end.connect(block.previousConnection);
    else putAtFoot(workspace, block);
  } else if (into) problem = MOVE_WORDS.cannot;
  else putAtFoot(workspace, block);
  if (problem) {
    block.dispose(false);
    return { problem };
  }
  return { block };
}
