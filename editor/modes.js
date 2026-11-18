// The four modes of the phone layout (BF-D-051): what a touch on the blocks does. A finger is not a mouse, so a touch must
// not change the program by accident; the learner says what a touch is for, at the foot of the blocks (foot.js).
//
//   Read    look around: a drag moves the view, two fingers zoom, a tap on a Python code block's arrow opens or folds it.
//           Nothing can change. The kinds of blocks are hidden, so the blocks have the room. The start.
//   Values  a tap on a value (a number, a colour, a word, a choice) opens its editor. Blocks stay where they are.
//   Add     the kinds of blocks and the search show. A tap on a block marks where to add; a tap on a block in the list adds it.
//   Move    pick, then move (pick.js): a tap picks, a drag moves what is picked, and Delete takes it away.
//
// A drag on empty space moves the view in every mode, and so does a drag on a block that may not move; two fingers zoom in
// every mode (Blockly's pinch).
//
// Values are edited only in Values mode (`edit`); Move is for moving, reordering and deleting. What each mode asks of Blockly is in RULES. `readOnly` is Blockly's own read-only workspace: its blocks cannot be edited,
// moved or deleted, it has no context menu, and a tap still reaches them (a click). The other rules are blockly-fun's: what
// the Picker may do (pick.js) and whether the toolbox shows.

import * as Blockly from "blockly";

export const MODES = [
  { id: "read", icon: "👁", name: "Read", about: "Look around, zoom, open and fold. Nothing changes.", hint: "Drag to look around" },
  { id: "values", icon: "✎", name: "Values", about: "Change numbers, colours and words. Blocks stay put.", hint: "Tap a value to change it" },
  { id: "add", icon: "＋", name: "Add", about: "Tap a block, then add new ones under it.", hint: "Tap a block, then one in the list" },
  { id: "move", icon: "✥", name: "Move", about: "Pick blocks, drag them to a new place, or delete them.", hint: "Tap to pick, drag to move" },
];

export const FIRST_MODE = "read";

export const RULES = {
  read: { readOnly: true, pick: "none", move: false, edit: false, toolbox: false },
  values: { readOnly: false, pick: "none", move: false, edit: true, toolbox: false },
  add: { readOnly: true, pick: "mark", move: false, edit: false, toolbox: true },
  move: { readOnly: false, pick: "stack", move: true, edit: false, toolbox: false },
};

export const modeOf = (id) => {
  const mode = MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`mode must be one of ${MODES.map((m) => m.id).join(", ")}, not ${id}`);
  return mode;
};

export class Modes {
  /**
   * `picker` is the Picker (pick.js), `toolbox` what to do with the kinds of blocks: `{show(bool)}`. `changed(mode)` is called
   * after the mode changes (and once for the first).
   */
  constructor(workspace, { picker, toolbox, changed = () => {} }) {
    this.workspace = workspace;
    this.picker = picker;
    this.toolbox = toolbox;
    this.changed = changed;
    this.id = null;
  }

  get rules() {
    return RULES[this.id];
  }

  /** Makes `id` the mode: what is picked is put down, and the workspace and the toolbox are set as the mode asks. */
  set(id) {
    modeOf(id);
    const rules = RULES[id];
    this.picker.clear();
    this.id = id;
    this.workspace.setIsReadOnly(rules.readOnly);
    this.workspace.bfEditLocked = !rules.edit;       // the blocks say so in isEditable (register.js): only Values edits values
    this.picker.allow({ move: rules.move });
    this.toolbox.show(rules.toolbox);
    this.changed(modeOf(id));
  }

  /** What a tap on a block does in this mode: a Picker's rotation (a stack, then the one block), a mark, or nothing. */
  tapBlock(block) {
    const how = this.rules.pick;
    if (how === "stack") this.picker.tap(block);
    else if (how === "mark") this.picker.pick(block, true);
  }
}

/**
 * Finds the block a tap was on, in a workspace that is read-only. Blockly starts no gesture on a block of a read-only workspace,
 * so a tap on one reaches it as a tap on empty space, with nothing to say which block. The block is found from the touch that
 * began the tap: Blockly gives every block's drawing a data-id. `take()` gives the block (or null) and forgets it.
 */
export function watchPresses(workspace) {
  let pressed = null;
  workspace.getInjectionDiv().addEventListener("pointerdown", (event) => {
    const id = event.target.closest?.("[data-id]")?.getAttribute("data-id");
    pressed = (id && workspace.getBlockById(id)) || null;
  }, true);
  return {
    take() {
      const block = pressed;
      pressed = null;
      return block;
    },
  };
}

/**
 * Reset, the foot bar's third button: the blocks' starting size, the first block at the top left of the view (`pad` px from the
 * edges), nothing picked, and no list of blocks open.
 */
export function resetView(workspace, picker, pad = 12) {
  picker.clear();
  workspace.getToolbox()?.clearSelection();
  workspace.setScale(workspace.options.zoomOptions.startScale);
  const box = workspace.getBlocksBoundingBox();
  workspace.scroll(pad - box.left * workspace.scale, pad - box.top * workspace.scale);
}

/** Shows or hides the toolbox (the kinds of blocks) of a workspace, and gives the room back to the blocks. */
export function toolboxVisibility(workspace) {
  return {
    show(visible) {
      const toolbox = workspace.getToolbox();
      if (!toolbox) return;
      if (!visible) toolbox.clearSelection();          // a flyout that is open goes with it
      toolbox.setVisible(visible);
      Blockly.svgResize(workspace);
    },
  };
}
