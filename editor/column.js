// One column, never overlapping (BF-D-051): the top-level stacks of blocks stand in one column, top to bottom, at one left edge,
// with a fixed gap, in both layouts. Blocks lie on one another only while a drag is going on.
//
// When: after a load and after every change that has settled: a drag that ended, a block made, added or deleted, an undo or
// redo, a fold or unfold, a block's size changed by an edit. A drag in progress is left alone (the pass waits for it).
//
// Order: the stacks' own top-to-bottom order, so a stack let go between two goes in between them, and one let go on another
// takes the place its top edge was at.
//
// Undo: the move into place is part of the same undo step as the change that caused it. The pass puts its moves in the cause's
// event group (a drag, an add and a delete have one; a change without one is given one, below), so one Undo takes back the
// change and the move together. What an undo or a redo causes, and what a load or a fold causes, is done with undo recording
// off: the layout is a result of the blocks, and writing it into the history would clear the redo list.
//
// Loops: the pass marks its own moves (the reason REASON) and does not answer to them; a block already in place is not moved,
// so a second pass over the same blocks moves nothing and fires nothing.

import * as Blockly from "blockly";
import { refreshFolds } from "./fold.js";

export const LEFT = 24;
export const TOP = 24;
export const GAP = 20;            // between two stacks, in workspace units
export const REASON = "bf-column";
const DRAG_WAIT = 50;             // ms between looks at whether a drag has ended
const EPSILON = 0.01;

/**
 * Where each stack goes. `stacks` are `{id, left, top, height}` in the order they are to stand in; the answer lists the ones
 * that must move, `{id, dx, dy}`.
 */
export function planColumn(stacks, { left = LEFT, top = TOP, gap = GAP } = {}) {
  const moves = [];
  let y = top;
  for (const stack of stacks) {
    const dx = left - stack.left;
    const dy = y - stack.top;
    if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON) moves.push({ id: stack.id, dx, dy });
    y += stack.height + gap;
  }
  return moves;
}

/** Where a stack is and how tall it is, with its blocks inside and below it, once it is drawn. */
function measureStack(block) {
  const box = block.getBoundingRectangle();
  return { left: box.left, top: box.top, height: box.bottom - box.top };
}

const CAUSES = new Set([
  Blockly.Events.BLOCK_MOVE, Blockly.Events.BLOCK_CREATE, Blockly.Events.BLOCK_DELETE, Blockly.Events.BLOCK_CHANGE,
  Blockly.Events.FINISHED_LOADING,
]);

export class Column {
  /**
   * `measure(block)` gives `{left, top, height}` of a top block's stack (tests with no page give their own). `rendered()` waits
   * until Blockly has drawn what it has been asked to.
   */
  constructor(workspace, { measure = measureStack, rendered = () => Blockly.renderManagement.finishQueuedRenders(), ...place } = {}) {
    this.workspace = workspace;
    this.measure = measure;
    this.rendered = rendered;
    this.place = place;
    this.request = null;          // what the next pass is for: {recorded, group}
    this.timer = null;
    this.running = Promise.resolve();
    this.disposed = false;
    this.listener = workspace.addChangeListener((event) => this.onEvent(event));
  }

  onEvent(event) {
    if (event.isUiEvent || !CAUSES.has(event.type)) return;
    if (event.type === Blockly.Events.BLOCK_MOVE && event.reason?.includes(REASON)) return;      // the pass's own move
    if (!event.recordUndo) {
      this.schedule({ recorded: false });
      return;
    }
    // A change made with no group (a number typed in a block) has none to share. It is given one here, on the event itself,
    // which the undo history already holds: the pass's moves then join it, and one Undo takes back both.
    if (!event.group) event.group = Blockly.utils.idGenerator.genUid();
    this.schedule({ recorded: true, group: event.group });
  }

  /**
   * Asks for a pass once what is happening has settled (`wait` ms from now). A request that will be written into the history
   * wins over one that will not.
   */
  schedule(request = { recorded: false }, wait = 0) {
    if (this.disposed) return;
    if (!this.request || request.recorded) this.request = request;
    if (this.timer === null) this.timer = setTimeout(() => { this.timer = null; this.running = this.run(); }, wait);
  }

  /** Does a pass now, after the folds are up to date and Blockly has drawn; gives the number of stacks that moved. */
  async settle() {
    this.request ??= { recorded: false };
    return this.run();
  }

  async run() {
    if (this.disposed) return 0;
    if (this.workspace.isDragging?.()) return this.later();
    refreshFolds(this.workspace);
    await this.rendered();
    if (this.disposed) return 0;
    if (this.workspace.isDragging?.()) return this.later();
    const request = this.request ?? { recorded: false };
    this.request = null;
    return this.arrange(request);
  }

  /** Not under the hand: asks again in a moment, when the drag may be over. */
  later() {
    this.schedule(this.request ?? { recorded: false }, DRAG_WAIT);
    return 0;
  }

  /** Puts the stacks in the column. Gives how many were moved. */
  arrange({ recorded, group }) {
    const tops = this.workspace.getTopBlocks(true).filter((block) => !block.isInsertionMarker());
    const stacks = tops.map((block) => ({ id: block.id, ...this.measure(block) }));
    const moves = planColumn(stacks, this.place);
    if (!moves.length) return 0;
    const outerGroup = Blockly.Events.getGroup();
    const outerRecord = Blockly.Events.getRecordUndo();
    Blockly.Events.setGroup(recorded && group ? group : false);
    Blockly.Events.setRecordUndo(recorded);
    try {
      for (const { id, dx, dy } of moves) this.workspace.getBlockById(id)?.moveBy(dx, dy, [REASON]);
    } finally {
      Blockly.Events.setRecordUndo(outerRecord);
      Blockly.Events.setGroup(outerGroup || false);
    }
    return moves.length;
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.workspace.removeChangeListener(this.listener);
  }
}
