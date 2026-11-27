// A text field whose editor has closed tells the workspace once more what it holds.
//
// While a learner types in a block's text box, Blockly fires an intermediate change for each key, and the editor writes the
// Python at once (and the line on the block follows). Escape then puts the old value back without any event (Blockly's
// FieldInput: setValue(old, false)), and closing the editor fires a change only if the value differs from the one it opened
// with. So after a pause and Escape the blocks said `rotate` and the Python still said `f.circ(-30)` (found by Play's check
// 86, 16 Nov 2026). Blockly calls onFinishEditing_ whenever the editor closes; here it fires one intermediate change with
// the value the field now has, so the Python, the Python line and the type rule follow, and nothing enters the undo stack.

import * as Blockly from "blockly";

/** `Base` (a FieldInput class) with an editor that, as it closes, says the field's value again. */
export const writesOnFinish = (Base) => class extends Base {
  onFinishEditing_(value) {
    super.onFinishEditing_(value);
    const block = this.getSourceBlock();
    if (!block || block.disposed || !Blockly.Events.isEnabled()) return;
    // The old value is not known (the last typed text is Blockly's own). It must differ from the new one, or Blockly drops
    // the event as a no-op; null says "not known", and no listener of blockly-fun reads it.
    const Change = Blockly.Events.get(Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE);
    Blockly.Events.fire(new Change(block, this.name, null, value));
  }
};

/** The plain text box of the blocks (names, numbers, text, code, parameters, keywords). */
export const FieldText = writesOnFinish(Blockly.FieldTextInput);
