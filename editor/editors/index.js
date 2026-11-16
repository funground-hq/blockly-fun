// Editors for slots (Funground_Calls_Note.md, section 6; BF-D-002, BF-D-029).
//
// A number block in a degrees slot takes a dial, in a range slot a slider, in a pixels slot a slider from 0 to the canvas size (the first f.size, else 1000; BF-D-043); a text block in a colour slot takes a grid
// of colour names; the Python code block takes several lines. These are the same blocks with another field in the same
// place: no new block types, no new Python, the same saved JSON and the same value. Only a host that gave a catalogue
// gets them (the catalogue says what a slot is), so without one nothing here runs.
//
// How a field is swapped on a live block. Blockly has no "replace field", and a block's definition says which field it
// is made with. Two ways were weighed:
//   - one block type per editor (or a type that chooses its field when it is made): a slot is plugged into after the
//     block exists, so the block would have to be made again, which loses its place, its undo history and its
//     children, and changes the saved type;
//   - taking the field out of its input and putting another in under the same name and in the same place. The
//     name is the key in the saved JSON, so the JSON does not know; the input keeps its row.
// This does the second. It is quiet (no change events, so nothing enters the undo stack: a swap is not an edit), and
// it is a pure function of where the block is, so undoing a move brings the other editor back by itself: after any
// change event the editors are worked out again, at most once per frame, as the type rule is (types.js).
//
// A swap never changes the value. The new field is given the old text; if it keeps anything other than that exact
// text (the dial wraps 450 to 90 and rounds to whole degrees, a slider clamps to its range), the block keeps the
// plain field. A negative angle gets a dial of -180 to 180 (fields.js), so `rotate(-30)` keeps -30; `rotate(22.5)` keeps its
// plain number field.

import * as Blockly from "blockly";
import { typeOf } from "../blocks/register.js";
import { dial, slide, multiline, ColourNameField } from "./fields.js";
import { numberEditor, isColourSlot } from "./slots.js";

const FIELD = { number: "NUM", text: "TEXT", code: "TEXT" };

const nextFrame = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16));

const isEditing = (field) => field.isBeingEdited_ === true || Blockly.DropDownDiv.getOwner() === field;

/**
 * Puts the field `make(text)` makes in the place of the block's field `name`. Gives true when it was done. `make` may
 * give null (not possible), and the swap is refused when the new field would not hold exactly the old text.
 */
function swap(block, name, make) {
  const field = block.getField(name);
  if (!field || isEditing(field)) return false;
  const text = String(field.getValue());
  if (!block.bfPlain) block.bfPlain = { Plain: field.constructor, validator: field.getValidator() };   // the block's own
  const replacement = make(text);
  if (!replacement || String(replacement.getValue()) !== text) return false;
  const input = field.getParentInput();
  const at = input.fieldRow.indexOf(field);
  // Blockly's Field.dispose() leaves the field's pointerdown listener on its click target. When the field fills its
  // block (zelos: a number block in a slot), that target is the block itself, which stays: the old field would go on
  // taking the clicks and open a plain text box instead of the dial. So the listener goes with the field.
  const listener = field.mouseDownWrapper;
  Blockly.Events.disable();             // a count: undone by one enable
  try {
    input.removeField(name);
    if (listener) Blockly.browserEvents.unbind(listener);
    input.insertFieldAt(at, replacement, name);
  } finally {
    Blockly.Events.enable();
  }
  if (block.rendered) block.queueRender();
  return true;
}

export class EditorTracker {
  /**
   * @param workspace the workspace to keep true
   * @param catalogue the Catalogue (editor/catalogue/index.js); the editors are only for a host that gave one
   */
  constructor(workspace, catalogue) {
    this.workspace = workspace;
    this.catalogue = catalogue;
    this.pending = false;
    this.swaps = 0;
    this.listener = workspace.addChangeListener((event) => {
      if (event.isUiEvent || event.type === Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE) return;
      this.schedule();
    });
  }

  /** Works the editors out again in the next frame (once, however many events come). */
  schedule() {
    if (this.pending) return;
    this.pending = true;
    nextFrame(() => {
      this.pending = false;
      if (this.workspace.disposed || (this.workspace.isDisposed && this.workspace.isDisposed())) return;
      if (this.workspace.isDragging?.()) this.schedule();      // not under the hand
      else this.update();
    });
  }

  /** The editor a block should have now: a key (to compare) and how to make it, or null if it has none to choose. */
  wanted(block) {
    switch (block.type) {
      case typeOf("number"): {
        const editor = numberEditor(block, this.catalogue);
        if (editor.key === "angle") return { key: "angle", make: dial };
        if (editor.key.startsWith("range:")) return { key: editor.key, make: (value) => slide(value, editor) };
        return { key: "plain" };
      }
      case typeOf("text"):
        return isColourSlot(block, this.catalogue)
          ? { key: "colour", make: (value) => new ColourNameField(value, this.catalogue) }
          : { key: "plain" };
      case typeOf("code"):
        return { key: "lines", make: multiline };
      default:
        return null;
    }
  }

  /** Brings every number, text and code block to the editor its place asks for. */
  update() {
    for (const block of this.workspace.getAllBlocks(false)) {
      const want = this.wanted(block);
      if (!want) continue;
      const have = block.bfEditor ?? "plain";
      if (want.key === have) continue;
      const name = FIELD[block.type.slice(typeOf("").length)];
      const make = want.make ?? ((value) => new block.bfPlain.Plain(value, block.bfPlain.validator));
      if (swap(block, name, make)) {
        block.bfEditor = want.key;
        this.swaps++;
      }
    }
  }

  dispose() {
    this.workspace.removeChangeListener(this.listener);
  }
}
