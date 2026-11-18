// Pick, then move (BF-D-050), for the phone layout. On a phone a touch must not move a block by accident, so a block
// moves only when it is picked:
//
//   - a drag on a block that is not picked moves the view, as a drag on empty space does;
//   - a tap picks the block and the blocks under it (a stack, as Scratch moves one); a tap on the same block again picks
//     only that block; a tap again, the stack; and so on. A tap on another block picks that block's stack;
//   - only what is picked moves. A picked stack moves together. A single block comes out alone and the blocks under it
//     close the gap (Blockly's "heal stack" drag, which a mouse gets with the Ctrl key);
//   - a value in a block (a number, a colour, a name in a list) is edited by a tap on it, picked or not: a tap on a field
//     is the field's, not the block's, and it does not change what is picked.
//
// How: each block gets a drag strategy (Blockly's IDragStrategy, the documented way to change how a block drags) made from
// Blockly's own BlockDragStrategy. When a block is not movable, Blockly's gesture drags the workspace instead; that is the
// scrolling. The Picker holds what is picked; the page (dock.js) shows it.

import * as Blockly from "blockly";

export const GOLD = "#ffd700";
export const MARK = "bf-picked";     // the class of a picked block's drawing (see the style in dock.js)

/** The block itself, or for a slot's default value the block that holds it. */
const real = (block) => {
  let b = block;
  while (b && b.isShadow()) b = b.getParent();
  return b;
};

/** How many blocks a block and the ones under it are, as a learner counts them: statements, not the values inside them. */
function weigh(block, withNext) {
  let total = 0;
  for (let b = block; b; b = withNext ? b.getNextBlock() : null) {
    if (!b.outputConnection && !b.isShadow()) total += 1;
    for (const input of b.inputList) {
      if (input.type === Blockly.inputs.inputTypes.STATEMENT) total += weigh(input.connection?.targetBlock(), true);
    }
  }
  return total;
}

export class Picker {
  /** `changed` is called after what is picked changes, with the Picker. */
  constructor(workspace, changed = () => {}) {
    this.workspace = workspace;
    this.changed = changed;
    this.anchor = null;       // the first picked block
    this.single = false;      // true: only the anchor; false: the anchor and the blocks under it
    this.size = 0;            // how many blocks of the stack are picked
    this.marked = new Set();
    this.starting = false;    // true while a drag is starting (see PickStrategy.startDrag)
  }

  get active() {
    return !!this.anchor && this.workspace.getBlockById(this.anchor.id) === this.anchor && this.size > 0;
  }

  /** The picked blocks, top first: the anchor and, unless it is picked alone, the blocks under it. */
  blocks() {
    if (!this.active) return [];
    const out = [];
    for (let b = this.anchor; b && out.length < this.size; b = b.getNextBlock()) out.push(b);
    return out;
  }

  /** True if the block is picked, or is inside a picked block (a value in it, a block in its C). Blocks under the picked ones are not. */
  owns(block) {
    const picked = new Set(this.blocks());
    for (let b = block; b; b = b.getParent()) {
      if (picked.has(b)) return true;
      const parent = b.getParent();
      if (parent && parent.nextConnection && parent.nextConnection.targetBlock() === b) return false;   // under the picked ones
    }
    return false;
  }

  /** What the page shows: how many blocks, whether it is the one, and whether a tap would change it. */
  info() {
    if (!this.active) return null;
    const blocks = this.blocks();
    return {
      count: Math.max(1, blocks.reduce((sum, b) => sum + weigh(b, false), 0)),
      single: this.single,
      canTurn: !!this.anchor.getNextBlock(),      // blocks under it: a tap again changes what is picked
      anchor: this.anchor,
    };
  }

  /** A tap on a block: the rotation (stack, only this one, stack, ...) when it is the picked one, else its stack. */
  tap(block) {
    const b = real(block);
    if (!b || b.workspace !== this.workspace) return;
    const next = !!b.getNextBlock();
    if (this.active && b === this.anchor) {
      if (!next) return;                       // nothing under it: the stack and the single block are the same
      this.single = !this.single;
    } else {
      this.anchor = b;
      this.single = !next;
    }
    this.size = this.single ? 1 : this.stackSize(b);
    this.update();
  }

  stackSize(block) {
    let n = 0;
    for (let b = block; b; b = b.getNextBlock()) n += 1;
    return n;
  }

  /** Picks a block and the ones under it (or, with `single`, only it). */
  pick(block, single = false) {
    const b = real(block);
    if (!b) return;
    this.anchor = b;
    this.single = single || !b.getNextBlock();
    this.size = this.single ? 1 : this.stackSize(b);
    this.update();
  }

  /** Puts down: nothing is picked. */
  clear() {
    if (!this.anchor) return;
    this.anchor = null;
    this.size = 0;
    this.update();
  }

  /** Draws the marks again and tells the page. Called when the blocks change too. */
  update() {
    if (this.anchor && !this.active) { this.anchor = null; this.size = 0; }
    const now = this.blocks();
    if (now.length < this.size) this.size = now.length;
    for (const b of this.marked) if (!now.includes(b)) b.getSvgRoot?.()?.classList.remove(MARK);
    for (const b of now) b.getSvgRoot?.()?.classList.add(MARK);
    this.marked = new Set(now);
    this.changed(this);
  }

  /** Deletes what is picked, as one step to undo. A single block's gap closes; a stack goes whole. */
  deletePicked() {
    if (!this.active) return 0;
    const blocks = this.blocks();
    const count = this.info().count;
    const heal = this.single;
    const outer = Blockly.Events.getGroup();
    if (!outer) Blockly.Events.setGroup(true);
    try {
      this.anchor = null;
      this.size = 0;
      blocks[0].dispose(heal);
    } finally {
      if (!outer) Blockly.Events.setGroup(false);
    }
    this.update();
    return count;
  }
}

/** Blockly's drag of a block, changed so that only what is picked moves (the class's comment above). */
export class PickStrategy extends Blockly.dragging.BlockDragStrategy {
  constructor(block, picker) {
    super(block);
    this.picker = picker;
  }

  isMovable() {
    return super.isMovable() && (this.picker.starting || this.picker.owns(this.block));
  }

  startDrag(e) {
    // a touch on any part of what is picked takes all of what is picked: the drag goes to the first picked block
    const anchor = this.picker.anchor;
    if (anchor && anchor !== this.block && this.picker.active) return anchor.getDragStrategy().startDrag(e);
    // Blockly closes the gap of a single block by moving the blocks under it, and it skips blocks that cannot move: those
    // under a picked block cannot (they are not picked), so for the moment the drag starts they count as movable
    this.picker.starting = true;
    try {
      return super.startDrag(e);
    } finally {
      this.picker.starting = false;
    }
  }

  shouldHealStack(e) {
    return e instanceof PointerEvent ? this.picker.single : super.shouldHealStack(e);
  }
}

/** Gives every block that has not got it the picking drag (not one that is being dragged now: its drag has state). */
export function installStrategies(workspace, picker) {
  for (const block of workspace.getAllBlocks(false)) {
    if (block.isShadow() || block.isInsertionMarker() || block.isDragging()) continue;
    if (!(block.getDragStrategy() instanceof PickStrategy)) block.setDragStrategy(new PickStrategy(block, picker));
  }
}

/**
 * Makes a workspace pick-then-move. Taps come as Blockly's click events: a block's click picks, a click on empty space
 * puts down. Returns the Picker.
 */
export function attachPick(workspace, changed) {
  const picker = new Picker(workspace, changed);
  installStrategies(workspace, picker);
  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.CLICK) {
      installStrategies(workspace, picker);
      if (event.targetType === "block" && event.blockId) picker.tap(workspace.getBlockById(event.blockId));
      else if (event.targetType === "workspace") picker.clear();
      return;
    }
    if (event.isUiEvent && event.type !== Blockly.Events.BLOCK_DRAG) return;
    // a block made, a drag over, a load done: new blocks get the strategy; what moved, was deleted or came back is drawn again
    if (event.type === Blockly.Events.BLOCK_DRAG && event.isStart) return;
    installStrategies(workspace, picker);
    picker.update();
  });
  return picker;
}
