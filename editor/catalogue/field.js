// FieldCatalogueName (Funground_Calls_Note.md, section 5): a text field with its own popup in Blockly's DropDownDiv.
//
// The text is the truth. A learner may type any name, and the field takes it as typed (as FieldTextInput does, key by
// key). The list below only helps to find a name; choosing a row puts its name in and builds its slots (section 7).
//   Down / Up   move through the rows        Enter    chooses the highlighted row, else keeps what is typed
//   Escape      closes, keeping the text as typed (not Blockly's undo-the-typing)

import * as Blockly from "blockly";
import { NamePanel } from "./panel.js";
import { importsOf, isAttributeBlock, isBareCall, isMethodBlock, lookupEntry } from "./call_block.js";
import { kitFor } from "./kit.js";
import { staticType } from "./types.js";
import { writesOnFinish } from "../blocks/finish.js";

export class FieldCatalogueName extends writesOnFinish(Blockly.FieldTextInput) {
  /**
   * @param defaultName  the name to start with
   * @param validator    the Python-name check of the other name fields
   * @param context      {catalogue, scratch, onChoose(block, entry)}: `scratch` is true when the block says
   *                     "text align" for text_align (Scratch words); onChoose builds the slots, or puts in a kit block
   */
  constructor(defaultName, validator, context) {
    super(defaultName, validator);
    this.context = context;
    this.panel = null;
    this.shown = null;
  }

  // -- how the name looks ------------------------------------------------------------------------------------------

  /** The name with spaces, when the catalogue knows it: the label "f . text align" (section 7). Else null. */
  spoken() {
    const block = this.getSourceBlock();
    const value = this.getValue();
    if (!this.context.scratch || !block || typeof value !== "string") return null;
    return lookupEntry(block, this.context.catalogue) ? value.replace(/_/g, " ") : null;
  }

  getText_() {
    return super.getText_() ?? this.spoken();   // while editing, the text box shows the real name
  }

  render_() {
    super.render_();
    this.shown = this.getText();
  }

  /** Draws the name again if its look changed (the catalogue, the name or the object's type changed). */
  refreshDisplay() {
    const block = this.getSourceBlock();
    if (block?.rendered && this.getText() !== this.shown) this.forceRerender();
  }

  // -- the popup ---------------------------------------------------------------------------------------------------

  /** Opens the text box and the list. The box is always the inline one, so a phone gets the list too. */
  showEditor_(event, quietInput, manageEphemeralFocus) {
    super.showEditor_(event, true, manageEphemeralFocus);
    const input = this.htmlInput_;
    if (!input) return;
    if (!quietInput) {
      input.focus({ preventScroll: true });
      input.select();
    }
    this.openList(input.ownerDocument);
  }

  openList(document) {
    const block = this.getSourceBlock();
    const bare = isBareCall(block);
    if (!bare && !isMethodBlock(block)) return;
    const { catalogue } = this.context;
    let scope;
    if (bare) {
      scope = catalogue.bareScope(importsOf(block, true));   // Python's built-ins and what the sketch imports
    } else {
      const tracker = block.workspace.bfTypes;
      const type = tracker ? tracker.objectType(block) : staticType(block, catalogue);
      scope = catalogue.scope(type, { properties: isAttributeBlock(block) });
    }
    // a bare name has no kit block (the kit blocks write `f.name`), so its rows do not say so
    this.panel = new NamePanel({
      document, catalogue, scope, name: this.getValue(), kitOf: bare ? () => null : kitFor, onChoose: (entry) => this.choose(entry),
    });
    // clearContent() first: since Blockly 13 it makes a new drop-down, so a content div taken before it is a dead one
    Blockly.DropDownDiv.clearContent();
    Blockly.DropDownDiv.getContentDiv().appendChild(this.panel.element);
    Blockly.DropDownDiv.setColour("#ffffff", "#c8c8c8");
    Blockly.DropDownDiv.showPositionedByField(this, () => { this.panel = null; }, 0, false);
  }

  bindInputEvents_(htmlInput) {
    super.bindInputEvents_(htmlInput);
    htmlInput.addEventListener("input", () => this.panel?.setQuery(htmlInput.value));
  }

  onHtmlInputKeyDown_(event) {
    const panel = this.panel;
    if (panel && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      panel.move(event.key === "ArrowDown" ? 1 : -1);
      event.preventDefault();
    } else if (panel && event.key === "Enter") {
      const entry = panel.highlighted ?? panel.exact(this.htmlInput_.value);
      if (!entry) return super.onHtmlInputKeyDown_(event);
      event.preventDefault();
      this.choose(entry);
    } else super.onHtmlInputKeyDown_(event);   // Escape is Blockly's: the name as it was, the list closed
  }

  /** Puts the entry's name in, closes the list, and lets the block build its slots. */
  choose(entry) {
    const block = this.getSourceBlock();
    const { onChoose } = this.context;
    this.setEditorValue_(entry.name);
    this.close();
    onChoose(block, entry);
  }

  close() {
    Blockly.WidgetDiv.hide();
    Blockly.DropDownDiv.hideIfOwner(this, true);
  }

  widgetDispose_() {
    Blockly.DropDownDiv.hideIfOwner(this, true);
    this.panel = null;
    super.widgetDispose_();
  }
}
