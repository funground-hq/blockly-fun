// Python code blocks fold (BF-D-051). A long "Python code" block (an example's notes, a few lines of Python) fills the
// screen and lies over other blocks, so it starts as one line: a ▸, the words "Python code:" and the first line of the text.
// A tap on the ▸ opens it (▾) and a tap again folds it. It works in every mode and in both layouts.
//
// How: the block holds its text field and, next to it, a small read-only field with the first line. Folding shows one and
// hides the other (Blockly's Field.setVisible). It is not Blockly's own collapse: a collapsed block is drawn by Blockly as
// one label with no place for a control, and collapsing is an undoable change that is saved with the program. Folding here is
// only how the block is drawn: nothing is saved, nothing enters the undo history (the label changes are made with events
// off), and the text field keeps the text, so the Python the blocks make is the same folded or open.
//
// The state lives on the block (block.bfFold), not in the program: a block that is made again (a load, an undo that brings a
// deleted block back) starts folded again. Every block that can fold starts folded, a one-line one too; a one-line value block
// (code_value) has nothing to fold, so it never has a control and is always shown.

import * as Blockly from "blockly";

export const OPEN = "▾";        // ▾
export const FOLDED = "▸";      // ▸

/** The first line shows at most this many characters before an ellipsis. */
export const PREVIEW_LENGTH = 26;

/** The first line of a text, cut to what fits in a block's one line, with "…" when there is more. */
export function previewOf(text) {
  const [first, ...more] = String(text).split("\n");
  const line = first.trim();
  if (line.length > PREVIEW_LENGTH) return line.slice(0, PREVIEW_LENGTH - 1).trimEnd() + "…";
  return more.some((l) => l.trim() !== "") ? line + "…" : line;
}

/**
 * The words "Python code:" that are also the control: a tap opens or folds the block. A label field made clickable (a field
 * is clickable when it says how it is edited: Field.isClickable). A block that cannot fold (a one-line value) shows the words
 * with no arrow, and the tap does nothing.
 */
export class FoldField extends Blockly.FieldLabel {
  constructor(words) {
    super(words, "bf-fold");
  }

  // Blockly asks the block whether it may be edited. Folding is no edit: it works in Read mode, where nothing can change.
  isClickable() {
    const block = this.getSourceBlock();
    return !!block && this.isEnabled() && canFold(block);
  }

  // In the toolbox a tap on the block adds it: the control is not a button there.
  isClickableInFlyout() {
    return false;
  }

  showEditor_() {
    toggleFold(this.getSourceBlock());
  }
}

/**
 * The first line of the text, shown while the block is folded. It cannot be edited or tapped: the tap is the block's. It has
 * no name, so it is not saved (Blockly saves a named field, editable or not, unless it says it is not serializable).
 */
class PreviewField extends Blockly.FieldTextInput {
  isClickable() {
    return false;
  }

  showEditor_() {}
}

/**
 * The fields a block that folds needs, to put in its row: the control (named FOLD), then the text field, then the preview.
 * `always` is true when the block can always fold (a statement); a value folds only when it has several lines.
 */
export function foldFields(block, label, always) {
  const preview = new PreviewField("");
  block.bfFold = { label, always, preview, folded: undefined, field: null, shown: "" };
  return { control: new FoldField(label), preview };
}

/** Whether the block can fold now. */
export function canFold(block) {
  const fold = block.bfFold;
  if (!fold) return false;
  return fold.always || String(block.getFieldValue("TEXT") ?? "").includes("\n");
}

export const isFolded = (block) => !!block.bfFold?.folded;

/**
 * Brings what is drawn up to date: the arrow, the first line, which of the two is shown. A block's fold starts when its text
 * is first seen: folded, if it can fold. Cheap when nothing changed, so it can be called after every change.
 */
export function refreshFold(block) {
  const fold = block.bfFold;
  const field = block.getField("TEXT");
  if (!fold || !field) return false;
  const text = String(field.getValue() ?? "");
  const can = canFold(block);
  if (fold.folded === undefined) fold.folded = can;
  if (!can) fold.folded = false;
  const preview = previewOf(text);
  const control = (can ? (fold.folded ? FOLDED : OPEN) + " " : "") + fold.label;
  const shown = `${fold.folded}|${control}|${preview}`;
  if (shown === fold.shown && field === fold.field) return false;
  fold.shown = shown;
  fold.field = field;
  // not an edit: no event, so nothing is recorded to undo and nothing is saved
  Blockly.Events.disable();
  try {
    block.getField("FOLD").setValue(control);
    fold.preview.setValue(preview);
  } finally {
    Blockly.Events.enable();
  }
  field.setVisible(!fold.folded);
  fold.preview.setVisible(fold.folded);
  if (block.rendered) block.queueRender();
  return true;
}

/** Every block of a workspace that folds gets its first fold, or is brought up to date. True if anything changed. */
export function refreshFolds(workspace) {
  let changed = false;
  for (const block of workspace.getAllBlocks(false)) if (block.bfFold && refreshFold(block)) changed = true;
  return changed;
}

/** Opens a folded block, or folds an open one. The column is put in order again, as the block's size changed. */
export function toggleFold(block) {
  if (!canFold(block)) return;
  block.bfFold.folded = !block.bfFold.folded;
  refreshFold(block);
  block.workspace.bfColumn?.schedule();
}
