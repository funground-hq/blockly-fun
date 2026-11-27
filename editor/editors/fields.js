// The editor fields a slot can take (Funground_Calls_Note.md, section 6). Each one edits the same value as the plain
// field it replaces: a number is still the text of a number, a colour still the text of a colour name.

import * as Blockly from "blockly";
import { FieldAngle, FieldColour, FieldGridDropdown, FieldMultilineInput, FieldSlider } from "./plugins.js";
import { writesOnFinish } from "../blocks/finish.js";

// ---------------------------------------------------------------------------------------------------------------
// Numbers: a dial and a slider that keep the number as text

/**
 * The number block keeps its value as the text that was typed ("45", "2.50"): the Python is that text, and the saved
 * JSON holds it. FieldNumber keeps a number. This subclass keeps the text when the number is the same, so the value
 * a block has is the same whichever editor is in it.
 */
const keepsText = (Base) => class extends Base {
  doClassValidation_(newValue) {
    const checked = super.doClassValidation_(newValue);
    if (checked === null || checked === undefined) return checked;
    const text = String(newValue).trim();
    return Number(text) === checked ? text : String(checked);
  }

  /** The dial adds to the value with `+` when an arrow key is pressed: that needs a number, so it gets one then. */
  onHtmlInputKeyDown_(event) {
    this.bfArithmetic = true;
    try {
      super.onHtmlInputKeyDown_(event);
    } finally {
      this.bfArithmetic = false;
    }
  }

  getValue() {
    return this.bfArithmetic ? Number(this.value_) : this.value_;
  }
};

class DialField extends keepsText(writesOnFinish(FieldAngle)) {}
class SliderField extends keepsText(writesOnFinish(FieldSlider)) {}
class LinesField extends writesOnFinish(FieldMultilineInput) {}

/**
 * funground's angles are in degrees, from the right (3 o'clock), turning clockwise on the screen (y points down):
 * `clockwise: true` with no offset. The dial moves in whole degrees, so a value with a fraction is not taken (see
 * swap in index.js). A dial shows one turn: 0 to 360, or -180 to 180 for a negative angle (`rotate(-30)` stays -30),
 * so every whole angle from -180 to 359 has a dial.
 */
export const dial = (text) => {
  const [low, high] = Number(text) < 0 ? [-180, 180] : [0, 360];
  // the plugin clamps the number to 0..360 unless min and max are given: they are the turn too
  return new DialField(text, undefined, {
    clockwise: true, offset: 0, displayMin: low, displayMax: high, min: low, max: high, precision: 1,
  });
};

/** A slider from `low` to `high` in steps of `step` (the catalogue's parameter kind). */
export const slide = (text, { low, high, step }) => new SliderField(text, low, high, step);

/** Several lines of Python. */
export const multiline = (text) => new LinesField(text);

// ---------------------------------------------------------------------------------------------------------------
// Words from a fixed list

/**
 * A text in a slot whose choices the catalogue lists (a text style is "normal", "bold", "italic" or "bold_italic"): a
 * dropdown of those words. The text is the word, so the saved JSON and the Python are what they were with a plain box. A
 * text that is not one of the words is refused (the dropdown would show another word), and the block keeps its plain box.
 */
export const choice = (text, words) => {
  const field = new Blockly.FieldDropdown(words.map((word) => [word, word]));
  field.setValue(text);
  return field;
};

// ---------------------------------------------------------------------------------------------------------------
// Colours: a grid of funground's names, and "More colours"

const MORE = "\u0000more-colours";
const BACK = "\u0000named-colours";

Blockly.Css.register(`
.bfColourGrid { max-height: 16rem; overflow: auto; }
.bfColourGrid .blocklyColourSwatch { text-align: center; line-height: 20px; font-size: 14px; }
`);

/** A square of colour for the grid; with no page (Node, tests) just the name. */
function swatch(name, css) {
  if (typeof document === "undefined") return name;
  const element = document.createElement("div");
  element.className = "blocklyColourSwatch";
  element.style.backgroundColor = css;
  element.title = name;
  return element;
}

/** A button as small as a swatch, with a mark in it. */
function button(mark, title, value) {
  if (typeof document === "undefined") return [title, value];
  const element = document.createElement("div");
  element.className = "blocklyColourSwatch";
  element.style.background = "#fff";
  element.style.color = "#333";
  element.textContent = mark;
  element.title = title;
  return [element, value, title];
}

/**
 * funground's colours without the numbered shades (antiquewhite1 to 4 and the grays), so the grid is a few rows and
 * not a wall: a name that is not in it still works and shows as typed. Each is {name, hex}.
 */
export const gridColours = (catalogue) => (catalogue.raw.colors || [])
  .filter((c) => !/\d$/.test(c.name))
  .filter((c, i, all) => all.findIndex((d) => d.hex === c.hex) === i)   // one square for each colour (gray and grey, aqua and cyan)
  .map((c) => ({ c, place: gridPlace(c.hex) }))
  .sort((a, b) => a.place.group - b.place.group || a.place.band - b.place.band || b.place.light - a.place.light)
  .map(({ c }) => c);

/**
 * Where a colour sits in the grid (the maintainer, 16 Nov: the names had "no theme, reason or rhyme"; E-49). The greys come
 * first, white to black; then the colours by hue in twelve bands of 30 degrees (red, orange and brown, yellow, green ...,
 * pink), light to dark in each band. Hue and lightness are HSL's.
 */
function gridPlace(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const chroma = max - min;
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * light - 1));
  if (saturation < 0.12 || chroma < 0.06) return { group: 0, band: 0, light };            // a grey
  const hue = max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return { group: 1, band: Math.floor(((hue * 60 + 15) % 360) / 30), light };
}

/**
 * A text in a colour slot: a grid of colour names. Its last square, "More colours", shows the squares of field-colour
 * (hex strings such as "#ff6347"). Any text is allowed: one that is not in the grid shows as typed (with its own
 * square if it is a colour), so a name from a program is not lost and a picked hex is kept.
 */
export class ColourNameField extends FieldGridDropdown {
  constructor(text, catalogue) {
    const state = {
      page: "names",
      listed: gridColours(catalogue),
      hexOf: new Map((catalogue.raw.colors || []).map((c) => [c.name, c.hex])),
      extras: [],
    };
    super(() => (state.page === "names" ? namedOptions(state) : pickerOptions()), undefined, { columns: 12 });
    this.bfState = state;
    this.setValue(text);
  }

  /** Squares are made fresh when shown (useCache false). Checking a value only needs the names. */
  getOptions(useCache) {
    if (useCache === false || !this.bfState) return super.getOptions(false);
    const { listed, extras } = this.bfState;
    return [...extras, ...listed.map((c) => c.name)].map((name) => [name, name]);
  }

  /** The default trims the words the options share, which is not wanted for colour names (FieldColour skips it too). */
  trimOptions(options) {
    return { options };
  }

  doClassValidation_(newValue) {
    if (!this.bfState) return super.doClassValidation_(newValue);
    if (newValue === MORE || newValue === BACK) {
      this.show(newValue === MORE ? "picker" : "names");
      return null;                       // the choice is a way to another page, not a value
    }
    if (typeof newValue !== "string") return null;
    const { listed, extras } = this.bfState;
    if (!extras.includes(newValue) && !listed.some((c) => c.name === newValue)) extras.push(newValue);
    return super.doClassValidation_(newValue);
  }

  /** Opens the other page in the same place, once the grid that was chosen from has closed. */
  show(page) {
    this.bfState.page = page;
    setTimeout(() => {
      const block = this.getSourceBlock();
      if (!block || !block.rendered || block.disposed) return;
      // The grid chosen from is still fading out; its delayed hide would close the new page too (and its dispose sets
      // the page back to the names). Closed at once here, before the page is chosen.
      Blockly.DropDownDiv.hideWithoutAnimation();
      this.bfState.page = page;
      this.showEditor_();
    }, 0);
  }

  showEditor_(event) {
    super.showEditor_(event);
    const content = Blockly.DropDownDiv.getContentDiv();
    content.classList.add("blocklyFieldColour", "bfColourGrid");   // field-colour's tight squares
    Blockly.DropDownDiv.repositionForWindowResize();
  }

  dropdownDispose_() {
    this.bfState.page = "names";         // closing without a choice goes back to the names
    super.dropdownDispose_();
  }
}

function namedOptions({ listed, hexOf, extras }) {
  const mark = (name) => {
    const css = hexOf.get(name) ?? Blockly.utils.colour.parse(name);
    return css ? [swatch(name, css), name, name] : [name, name];
  };
  const more = button("…", "More colours", MORE);
  return [...extras.map(mark), ...listed.map((c) => [swatch(c.name, c.hex), c.name, c.name]), more];
}

/** field-colour's own squares, as options for this field. */
function pickerOptions() {
  return [...new FieldColour("#ffffff").getOptions(false), button("←", "Named colours", BACK)];
}
