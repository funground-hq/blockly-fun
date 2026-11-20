// Registers the blocks of table.js with Blockly, for one pair of settings:
//   words: "scratch" | "python"   which label a block shows
//   pythonLine: true | false      whether the small grey line of Python shows under the label of a statement block
//                                 (only with Scratch words: with Python words the label is the Python)
// The settings change only what a block shows. Block types, fields and inputs stay the same, so a workspace saved
// as JSON loads under either setting and makes the same Python.
//
// A third setting, `catalogue` (funground's catalogue, Funground_Calls_Note.md), changes only how the two general call
// blocks and the attribute block are shown and edited: a searchable name list, labelled slots, a tooltip and Help. Their
// JSON and Python are exactly what they are without it. (Choosing a name that has a kit block puts that block in: BF-6.)

import * as Blockly from "blockly";
import { BLOCKS, CATEGORIES, DEFAULTS, NEW_SLOTS, PREFIX, categoryColour } from "./table.js";
import { registerIconToolbox } from "./toolbox_icons.js";
import { createCatalogue } from "../catalogue/index.js";
import { FieldCatalogueName } from "../catalogue/field.js";
import { isBareCall, lookupEntry, refreshCall, tooltipOf } from "../catalogue/call_block.js";
import { defaultFor } from "../catalogue/slots.js";
import { kitFits, kitFor, slotNames } from "../catalogue/kit.js";
import { FieldText } from "./finish.js";
import { foldFields } from "../fold.js";

export { PREFIX };
export const typeOf = (id) => PREFIX + id;

// ---------------------------------------------------------------------------------------------------------------
// Names

const KEYWORDS = new Set((
  "False None True and as assert async await break class continue def del elif else except finally for from " +
  "global if import in is lambda nonlocal not or pass raise return try while with yield"
).split(" "));

/** True for a name Python accepts for a variable or function: valid, and not a keyword. */
export function isName(text) {
  return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(text) && !KEYWORDS.has(text);
}

const nameValidator = (text) => (isName(text) ? text : null);
const numberValidator = (text) => (/^-?(\d+\.?\d*|\.\d+)$/.test(text) ? text : null);
const paramsValidator = (text) => {
  const parts = text.split(",").map((p) => p.trim()).filter((p) => p !== "");
  if (text.trim() !== "" && text.trim().endsWith(",")) return null;
  return parts.every(isName) ? parts.join(", ") : null;
};

// A name chosen from the names the program uses (BF-D-015): the dropdown lists the variable names and the
// parameters of "make a block" found in the workspace, sorted, and "new name\u2026". The value is plain text.
export const NEW_NAME_OPTION = "new name\u2026";
const NEW_NAME = "\u0000new-name";

export class FieldName extends Blockly.FieldDropdown {
  constructor(defaultName) {
    const own = { name: defaultName };
    super(function () { return FieldName.options(this, own.name); });
    this.setValue(defaultName);
  }

  /** The names of the workspace the field is in (the main workspace, for a block in the toolbox), and its own. */
  static namesIn(field) {
    const block = field.getSourceBlock();
    let workspace = block ? block.workspace : null;
    if (workspace && workspace.isFlyout) workspace = workspace.targetWorkspace;
    const names = new Set();
    for (const other of workspace ? workspace.getAllBlocks(false) : []) {
      for (const input of other.inputList) {
        for (const f of input.fieldRow) {
          if (f instanceof FieldName) names.add(f.getValue());
          else if (f.name === "PARAMS") f.getValue().split(",").map((p) => p.trim()).filter(Boolean).forEach((p) => names.add(p));
        }
      }
    }
    return names;
  }

  static options(field, fallback) {
    const names = FieldName.namesIn(field);
    const own = field.getValue ? field.getValue() : null;
    if (own) names.add(own);
    else if (fallback) names.add(fallback);
    return [...[...names].filter(isName).sort().map((n) => [n, n]), [NEW_NAME_OPTION, NEW_NAME]];
  }

  // Any Python name is a value, listed or not; anything else is refused and the old value stays.
  doClassValidation_(value) {
    return typeof value === "string" && isName(value) ? value : null;
  }

  doValueUpdate_(value) {
    super.doValueUpdate_(value);
    if (!this.selectedOption || this.selectedOption[1] !== value) this.selectedOption = [value, value];
  }

  onItemSelected_(menu, menuItem) {
    if (menuItem.getValue() === NEW_NAME) this.askForName();
    else super.onItemSelected_(menu, menuItem);
  }

  askForName() {
    Blockly.dialog.prompt("New name", "", (text) => {
      if (text !== null && text !== undefined) this.acceptName(text);
    });
  }

  /** Takes a typed name if Python can use it; says so, and keeps the old value, if not. */
  acceptName(text) {
    const name = text.trim();
    if (!isName(name)) {
      if (name !== "") Blockly.dialog.alert(`"${name}" is not a name Python can use. Use letters, digits and _, and do not start with a digit.`);
      return false;
    }
    this.setValue(name);
    return true;
  }
}

// The grey line of Python under a statement's label: the block's own first line, with its real values.
// Measured at its own small font, so its row is only as tall as its text.
const LINE_HEIGHT = 14;
const LINE_MAX = 40;
let lineProvider = null;

/** The generator gives the lines: (block, index) => text or null. Set by generator/python.js. */
export function setLineProvider(provider) {
  lineProvider = provider;
}

class FieldPythonLine extends Blockly.FieldLabel {
  constructor(index, template) {
    super(template, "bf-python-line");
    this.index = index;
    this.template = template;
  }

  /** The text shown: the real line, shortened with an ellipsis past LINE_MAX characters. */
  lineText() {
    const block = this.getSourceBlock();
    let text = null;
    if (block && lineProvider) {
      try { text = lineProvider(block, this.index); } catch (error) { text = null; }
    }
    if (text === null || text === undefined) text = block ? fillTemplate(this.template, block) : this.template;
    return text.length > LINE_MAX ? text.slice(0, LINE_MAX - 1) + "\u2026" : text;
  }

  getDisplayText_() {
    this.shown = this.lineText();
    return this.shown.replace(/\s/g, "\u00a0");
  }

  /** Draws the line again if the block's code is not what is on the screen. */
  refresh() {
    if (this.lineText() !== this.shown) this.forceRerender();
  }

  updateSize_() {
    super.updateSize_(0);
    this.size_.height = LINE_HEIGHT;
    this.positionTextElement_(0, this.size_.width);
  }
}

/**
 * A "Python code" value read from Python knows how tightly its text binds (extraState.order). Once the learner edits
 * the text that may no longer be true, so the block forgets it and the generator judges the new text by its look.
 */
export function forgetOrderOnEdit(workspace) {
  workspace.addChangeListener((event) => {
    if (event.type !== Blockly.Events.BLOCK_CHANGE || event.element !== "field" || event.name !== "TEXT") return;
    const block = workspace.getBlockById(event.blockId);
    if (block && block.type === typeOf("code_value")) block.bfOrder = undefined;
  });
}

/**
 * Keeps the Python lines of a workspace true: when a block, or something inside it, changes, the lines of that
 * block and of the blocks around it are drawn again if their text changed.
 */
export function watchLines(workspace) {
  workspace.addChangeListener((event) => {
    if (event.isUiEvent) return;
    const ids = [event.blockId, event.oldParentId, event.newParentId, ...(event.ids || [])].filter(Boolean);
    for (const id of ids) {
      for (let block = workspace.getBlockById(id); block; block = block.getParent()) {
        for (const input of block.inputList) {
          if (input.name.startsWith("PYLINE")) input.fieldRow[0].refresh();
        }
      }
    }
  });
}

function makeField(spec, rows) {
  const { words, settings } = rows;
  switch (spec.kind) {
    case "var": return new FieldName(spec.default);
    case "name":
      if (spec.catalogue && settings.catalogue) {
        return new FieldCatalogueName(spec.default, nameValidator, {
          catalogue: settings.catalogue,
          scratch: words === "scratch",
          onChoose: (block, entry) => chooseEntry(block, entry, rows.def, settings),
        });
      }
      return new FieldText(spec.default, nameValidator);
    case "number": return new FieldText(spec.default, numberValidator);
    case "label": return new Blockly.FieldLabelSerializable(spec.default);
    case "params": return new FieldText(spec.default, paramsValidator);
    case "dropdown":
      return new Blockly.FieldDropdown(spec.options.map((o) => [o[words], o.value]));
    default: return new FieldText(spec.default); // text, code
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Style

const CSS = ".injectionDiv .blocklyText.bf-python-line { fill: #fff; fill-opacity: .85; font-size: 10pt; font-weight: normal; font-family: monospace; }";

function injectStyle() {
  if (typeof document === "undefined" || document.getElementById("bf-style")) return;
  const style = document.createElement("style");
  style.id = "bf-style";
  style.textContent = CSS;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------------------------------------------
// Rows

/** Collects label text and fields until an input is added to put them in front of. */
class Rows {
  constructor(block, words) {
    this.block = block;
    this.words = words;
    this.def = null;
    this.pending = [];
  }

  /** Adds a label; gives the field (null for no text). */
  text(str) {
    if (!str) return null;
    const field = new Blockly.FieldLabel(str);
    this.pending.push([field, undefined]);
    return field;
  }

  field(name) {
    this.pending.push([makeField(this.def.fields[name], this), name]);
  }

  flush(input) {
    for (const [field, name] of this.pending) input.appendField(field, name);
    this.pending = [];
    return input;
  }

  value(name) {
    return this.flush(this.block.appendValueInput(name));
  }

  /** Ends the row; whatever label is still waiting goes at its end. */
  end() {
    return this.flush(this.block.appendEndRowInput("END"));
  }

  /** A label with {SLOT} and [FIELD] tokens; renameSlot maps a slot name to the input's name. */
  tokens(str, renameSlot = (n) => n) {
    for (const part of str.split(/(\{\w+\}|\[\w+\])/)) {
      if (part === "") continue;
      if (/^\{\w+\}$/.test(part)) this.value(renameSlot(part.slice(1, -1)));
      else if (/^\[\w+\]$/.test(part)) this.field(part.slice(1, -1));
      else this.text(part);
    }
  }
}

function fillTemplate(template, block) {
  return template.replace(/\[(\w+)\]/g, (whole, name) => {
    const value = block.getFieldValue(name);
    return value === null || value === undefined ? whole : value;
  });
}

function addLine(block, rows, template, index) {
  if (!rows.showLines || !template) return;
  block.appendDummyInput("PYLINE" + index).appendField(new FieldPythonLine(index, template));
}

/** Builds every input of the block for its current state. */
function layout(block, def, settings, state) {
  const rows = new Rows(block, settings.words);
  rows.settings = settings;
  rows.def = def;
  // value blocks have no line (the parent's line shows their code); Python words are the Python already
  rows.showLines = settings.pythonLine && settings.words === "scratch" && def.kind === "statement";
  // with the catalogue a call block may word its head differently ("f . text align")
  const words = (settings.catalogue && def.catalogue?.[settings.words]) || def[settings.words];

  if (def.mutator === "if") {
    for (let i = 0; i <= state.elifs; i++) {
      rows.tokens(i === 0 ? words.if : words.elseif, () => "IF" + i);
      rows.end();
      addLine(block, rows, i === 0 ? def.line.if : def.line.elseif, i);
      block.appendStatementInput("DO" + i);
    }
    if (state.else) {
      addLine(block, rows, def.line.else, state.elifs + 1);
      block.appendStatementInput("ELSE").appendField(new Blockly.FieldLabel(words.else));
    }
    return;
  }

  if (def.mutator === "items" || def.mutator === "args" || def.own) {
    const kinds = def.mutator === "args" ? state.args : Array(def.own ? state.args : state.items).fill("p");
    rows.tokens(words.head);
    // slot labels (section 7): the words before each positional slot become the parameter's name once it is known
    const labelled = settings.catalogue && settings.words === "scratch" && def.mutator === "args";
    block.bfSlotLabels = labelled ? [] : undefined;
    kinds.forEach((kind, i) => {
      const plain = i === 0 ? words.first : words.sep;
      const label = rows.text(plain);
      if (labelled && label) block.bfSlotLabels[i] = { field: label, plain, positional: kind === "p" };
      if (kind === "k") {
        rows.pending.push([new FieldText("key", nameValidator), "KW" + i]);
        rows.text("=");
      }
      rows.value("ARG" + i);
    });
    rows.text(words.tail);
    rows.end();
  } else if (def.fold) {
    // the words "Python code:" are the fold control; the text follows, and its first line while the block is folded
    const { control, preview } = foldFields(block, words.replace(/\s*\[TEXT\]\s*$/, ""), def.kind === "statement");
    rows.pending.push([control, "FOLD"]);
    rows.field("TEXT");
    rows.pending.push([preview, undefined]);
    rows.end();
  } else {
    rows.tokens(words);
    rows.end();
  }
  addLine(block, rows, def.line, 0);
  for (const name of def.body || []) block.appendStatementInput(name);
}

/**
 * Throws away the inputs and builds them again for a new state. Children of inputs named in `remap`
 * (old name to new name; an input not named stays) are kept; the others go.
 */
function rebuild(block, def, settings, state, remap = new Map(), strict = false) {
  // In strict mode (from the gear) an input that is not named in remap is gone, so a new item never inherits the
  // child of an item that was taken away.
  const mapName = (name) => {
    if (remap.has(name)) return remap.get(name);
    return strict && /^(ARG|IF|DO|KW|ELSE)/.test(name) ? null : name;
  };
  const fieldValues = {};
  const kept = [];
  for (const input of block.inputList) {
    for (const field of input.fieldRow) if (field.name) fieldValues[field.name] = field.getValue();
    if (input.connection && input.connection.isConnected()) {
      const target = input.connection.targetConnection;
      input.connection.disconnect();
      kept.push([input.name, target]);
    }
  }
  while (block.inputList.length) block.removeInput(block.inputList[0].name);
  block.bfState = state;
  layout(block, def, settings, state);
  for (const [name, value] of Object.entries(fieldValues)) {
    const mapped = mapName(name);
    const target = mapped ? block.getField(mapped) : null;
    if (target) target.setValue(value);
  }
  for (const [name, target] of kept) {
    const mapped = mapName(name);
    const input = mapped ? block.getInput(mapped) : null;
    if (input && input.connection) input.connection.connect(target);
    else target.getSourceBlock().dispose(false);
  }
  if (block.bfCatalogue) refreshCall(block);
}

/**
 * A row was chosen in the name list. A name with a kit block that fits puts the kit block in the general block's place
 * (BF-6); any other name builds the call's slots (an attribute block has none to build).
 */
function chooseEntry(block, entry, def, settings) {
  const kit = isBareCall(block) ? null : kitFor(entry);   // a bare name is not `f.name`: no kit block
  if (kit && kitFits(block, entry, kit)) swapForKit(block, kit);
  else if (block.bfState?.args) adoptSignature(block, def, settings, entry);
}

/**
 * Puts the kit block in the place of a general block, in one undo step. The arguments the general block has move over
 * one to one (kitFits has seen to it that they fit); with none, the kit block comes with the toolbox's values. The
 * block keeps its place (in its stack, in its slot, or on the page), its comment and its blank lines.
 */
function swapForKit(block, kit) {
  const { def, fields } = kit;
  const workspace = block.workspace;
  const inputs = {};
  slotNames(def).forEach((slot, i) => {
    const connection = block.getInput("ARG" + i)?.connection;
    const child = connection?.targetBlock();
    if (child && !child.isShadow()) inputs[slot] = { block: Blockly.serialization.blocks.save(child, { saveIds: false }) };
    else if (child) inputs[slot] = { shadow: connection.getShadowState(true) };
  });
  const state = block.bfState?.args?.length ? { type: typeOf(def.type), inputs } : toolboxBlock(def.type);
  if (fields && Object.keys(fields).length) state.fields = fields;
  const where = block.getRelativeToSurfaceXY();
  const wasGroup = Blockly.Events.getGroup();
  if (!wasGroup) Blockly.Events.setGroup(true);       // inside a step already (the phone's name sheet), the swap joins it
  try {
    const next = Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
    const place = block.previousConnection?.targetConnection ?? block.outputConnection?.targetConnection ?? null;
    block.unplug(true);
    if (place) place.connect(next.previousConnection ?? next.outputConnection);
    else next.moveBy(where.x, where.y);
    if (next.bfData && block.bfData) next.bfData = { ...block.bfData };
    const comment = block.getCommentText();
    if (comment !== null && comment !== undefined) next.setCommentText(comment);
    block.dispose(false);
  } finally {
    if (!wasGroup) Blockly.Events.setGroup(false);
  }
}

/**
 * A name was chosen from the catalogue's list (section 7): the required arguments become slots, each with a value that
 * runs. Optional ones are not added: the gear still adds them, as keywords. Slots already there are kept, so choosing
 * again never takes away what the learner filled in.
 */
function adoptSignature(block, def, settings, entry) {
  const required = entry.params.filter((p) => p.required);
  const args = block.bfState.args;
  const positional = args.filter((kind) => kind === "p").length;
  const added = required.length - positional;
  if (added <= 0) return;
  const before = JSON.stringify(block.saveExtraState() ?? {});
  // positional slots come before keyword ones, which move along
  const next = [...args.slice(0, positional), ...Array(added).fill("p"), ...args.slice(positional)];
  const remap = new Map();
  for (let j = positional; j < args.length; j++) {
    remap.set("ARG" + j, "ARG" + (j + added));
    remap.set("KW" + j, "KW" + (j + added));
  }
  rebuild(block, def, settings, { args: next }, remap);
  for (let k = 0; k < added; k++) {
    const value = defaultFor(settings.catalogue, entry, required[positional + k]);
    if (value) block.getInput("ARG" + (positional + k)).connection.setShadowState(shadowOf(value).shadow);
  }
  refreshCall(block);
  const after = JSON.stringify(block.saveExtraState() ?? {});
  if (block.workspace.rendered && before !== after) {
    Blockly.Events.fire(new Blockly.Events.BlockChange(block, "mutation", null, before, after));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The gear (mutator): small blocks inside the gear's bubble

const MUTATOR_BLOCKS = {
  root: { label: "arguments", colour: "#6e6e6e", top: true },
  item: { label: "item" },
  pos: { label: "argument" },
  kw: { label: "keyword argument" },
  elif: { label: "else if" },
  else: { label: "else", last: true },
};
const MUTATOR_ITEMS = { items: ["item"], args: ["pos", "kw"], if: ["elif", "else"] };

function registerMutatorBlocks() {
  for (const [id, spec] of Object.entries(MUTATOR_BLOCKS)) {
    Blockly.Blocks[PREFIX + "m_" + id] = {
      init() {
        this.setColour(spec.colour || "#8a8a8a");
        if (spec.top) {
          this.appendDummyInput().appendField(spec.label);
          this.appendStatementInput("STACK");
        } else {
          this.appendDummyInput().appendField(spec.label);
          this.setPreviousStatement(true);
          if (!spec.last) this.setNextStatement(true);
        }
        this.bfSlot = null;
      },
    };
  }
}

/** The mutator's view of a block: its items in order, each with the name of the input it stands for. */
function itemsOf(block, def) {
  const state = block.bfState;
  if (def.mutator === "items") {
    return Array.from({ length: state.items }, (_, i) => ({ type: "item", slot: "ARG" + i, index: i }));
  }
  if (def.mutator === "args") {
    return state.args.map((kind, i) => ({ type: kind === "k" ? "kw" : "pos", slot: "ARG" + i, index: i }));
  }
  const list = [];
  for (let i = 1; i <= state.elifs; i++) list.push({ type: "elif", slot: i, index: i });
  if (state.else) list.push({ type: "else", slot: "ELSE" });
  return list;
}

/** The new state and the old-to-new names of inputs and fields, read from the items left in the gear. */
function stateFromItems(def, items) {
  const remap = new Map();
  if (def.mutator === "items") {
    items.forEach((item, j) => { if (item.slot !== null) remap.set(item.slot, "ARG" + j); });
    return { state: { items: items.length }, remap };
  }
  if (def.mutator === "args") {
    items.forEach((item, j) => {
      if (item.slot === null) return;
      remap.set(item.slot, "ARG" + j);
      remap.set("KW" + item.slot.slice(3), "KW" + j);
    });
    return { state: { args: items.map((i) => (i.type === "kw" ? "k" : "p")) }, remap };
  }
  // the first "if" is not an item in the gear, and always keeps its condition and its body
  remap.set("IF0", "IF0");
  remap.set("DO0", "DO0");
  let elifs = 0;
  let hasElse = false;
  for (const item of items) {
    if (item.type === "elif") {
      elifs++;
      if (item.slot !== null && item.slot !== "ELSE") {
        remap.set("IF" + item.slot, "IF" + elifs);
        remap.set("DO" + item.slot, "DO" + elifs);
      }
    } else if (!hasElse) {
      hasElse = true;
      if (item.slot !== null) remap.set("ELSE", "ELSE");
    }
  }
  return { state: { elifs, else: hasElse }, remap };
}

/** A slot made by the gear, with no kept child, gets the editable default the toolbox gives (loading adds none). */
function fillNewSlots(block, def, remap) {
  const spec = NEW_SLOTS[def.type];
  const kept = new Set(remap.values());
  for (const input of block.inputList) {
    const isNew = /^ARG\d+$/.test(input.name) || /^IF[1-9]\d*$/.test(input.name);
    if (!isNew || kept.has(input.name) || input.connection.isConnected()) continue;
    const filled = shadowOf(spec);
    if (filled.shadow) input.connection.setShadowState(filled.shadow);
    else input.connection.connect(Blockly.serialization.blocks.append(filled.block, block.workspace).outputConnection);
  }
}

/**
 * Builds the block again for the items the gear would leave (see compose): the same steps the gear's bubble takes. Gives the items,
 * the keyword arguments last (Python wants positional arguments first).
 */
function recompose(block, def, settings, items) {
  if (def.mutator === "args") items.sort((a, b) => (a.type === "kw") - (b.type === "kw"));
  const { state, remap } = stateFromItems(def, items);
  rebuild(block, def, settings, state, remap, true);
  fillNewSlots(block, def, remap);
}

function newSlots(def) {
  // After a rebuild the items in the gear must name the new inputs.
  if (def.mutator === "if") {
    let i = 0;
    return (item) => (item.type === "elif" ? ++i : "ELSE");
  }
  let j = 0;
  return () => "ARG" + j++;
}

// ---------------------------------------------------------------------------------------------------------------
// Context menu: blank lines and where the comment goes

function offerStatementMenu(block, options) {
  const rendered = !!block.workspace.rendered;
  const change = (fn) => {
    const before = JSON.stringify(block.saveExtraState() ?? {});
    fn();
    const after = JSON.stringify(block.saveExtraState() ?? {});
    if (rendered && before !== after) {
      Blockly.Events.fire(new Blockly.Events.BlockChange(block, "mutation", null, before, after));
    }
  };
  options.push({
    text: "Add a blank line before", enabled: true,
    callback: () => change(() => { block.bfData.blank++; }),
  });
  options.push({
    text: "Take away a blank line before", enabled: block.bfData.blank > 0,
    callback: () => change(() => { block.bfData.blank--; }),
  });
  if (block.getCommentText() !== null) {
    options.push({
      text: block.bfData.trailing ? "Put the comment on its own line" : "Put the comment at the end of the line",
      enabled: true,
      callback: () => change(() => { block.bfData.trailing = !block.bfData.trailing; }),
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

function initialState(def) {
  if (def.mutator === "items") return { items: def.type === "say" ? 1 : 2 };
  if (def.mutator === "args") return { args: [] };
  if (def.own) return { args: 0 };
  if (def.mutator === "if") return { elifs: 0, else: false };
  return null;
}

function hueOf(def) {
  return categoryColour(def.cat);
}

function definition(def, settings) {
  const isStatement = def.kind === "statement";
  return {
    init() {
      this.bfData = { blank: 0, trailing: false };
      this.bfCatalogue = def.mutator === "args" || def.property ? settings.catalogue : undefined;
      if (def.hat) this.hat = "cap";   // a rounded top, as Scratch's "when ... clicked" (the renderer reads it)
      this.setColour(hueOf(def));
      this.setInputsInline(true);
      if (!isStatement) this.setOutput(true);
      else if (!def.top) {
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      }
      this.bfState = initialState(def);
      layout(this, def, settings, this.bfState);
      if (typeof def.line === "string") this.setTooltip(fillTemplate(def.line, this));
      if (this.bfCatalogue) {
        // the signature and the plain sentence, looked up when the tooltip shows (section 7)
        this.setTooltip(() => {
          const entry = lookupEntry(this, this.bfCatalogue, true);
          return entry ? tooltipOf(entry) : fillTemplate(def.line, this);
        });
      }
      if (def.mutator) this.setMutator(new Blockly.icons.MutatorIcon(MUTATOR_ITEMS[def.mutator].map((i) => PREFIX + "m_" + i), this));
    },

    saveExtraState() {
      const state = { ...(this.bfState ?? {}) };
      if (def.order && this.bfOrder) state.order = this.bfOrder;
      if (isStatement) {
        if (this.bfData.blank) state.blank = this.bfData.blank;
        if (this.bfData.trailing) state.trailing = true;
      }
      return Object.keys(state).length ? state : null;
    },

    loadExtraState(state) {
      this.bfData.blank = state.blank ?? 0;
      this.bfData.trailing = !!state.trailing;
      this.bfOrder = def.order ? state.order : undefined;
      if (def.own) rebuild(this, def, settings, { args: state.args ?? 0 });
      if (def.mutator) {
        const fresh = def.mutator === "items" ? { items: state.items ?? 1 }
          : def.mutator === "args" ? { args: state.args ?? [] }
            : { elifs: state.elifs ?? 0, else: !!state.else };
        rebuild(this, def, settings, fresh);
      }
    },

    decompose(workspace) {
      const root = workspace.newBlock(PREFIX + "m_root");
      root.initSvg?.();
      let connection = root.getInput("STACK").connection;
      for (const item of itemsOf(this, def)) {
        const part = workspace.newBlock(PREFIX + "m_" + item.type);
        part.initSvg?.();
        part.bfSlot = item.slot;
        connection.connect(part.previousConnection);
        connection = part.nextConnection;
      }
      return root;
    },

    compose(root) {
      const items = [];
      for (let part = root.getInputTargetBlock("STACK"); part; part = part.getNextBlock()) {
        items.push({ type: part.type.slice((PREFIX + "m_").length), slot: part.bfSlot, block: part });
      }
      recompose(this, def, settings, items);
      const next = newSlots(def);
      for (const item of items) item.block.bfSlot = next(item);
    },

    // The gear without its bubble (the phone's list): the parts the gear would show, and a change of them. A part is
    // {type: "elif" | "else" | "item" | "pos" | "kw", slot}; a part with slot null is new. One change is one BlockChange event, as the
    // bubble's is, so it is one step to undo.
    bfParts() {
      return def.mutator ? itemsOf(this, def) : null;
    },

    bfSetParts(parts) {
      const before = JSON.stringify(this.saveExtraState() ?? {});
      recompose(this, def, settings, parts);
      const after = JSON.stringify(this.saveExtraState() ?? {});
      if (before !== after) Blockly.Events.fire(new Blockly.Events.BlockChange(this, "mutation", null, before, after));
    },

    customContextMenu: isStatement ? function (options) { offerStatementMenu(this, options); } : undefined,
  };
}

let registeredAs = null;

/** Registers (or registers again) every block for these settings. */
export function registerBlocks({ words = "scratch", pythonLine = true, catalogue = null, helpBase = null } = {}) {
  if (words !== "scratch" && words !== "python") throw new Error(`words must be "scratch" or "python", not ${words}`);
  injectStyle();
  registerIconToolbox();
  registerMutatorBlocks();
  // With Python words there is never a Python line, whatever was asked for
  const settings = { words, pythonLine: words === "scratch" && !!pythonLine };
  const full = { ...settings, catalogue: catalogue ? createCatalogue(catalogue, { helpBase }) : null };
  for (const def of BLOCKS) Blockly.Blocks[typeOf(def.type)] = definition(def, full);
  registeredAs = settings;
  return settings;
}

export const registeredSettings = () => registeredAs;

const shadowOf = (spec) => {
  if (spec.number !== undefined) return { shadow: { type: typeOf("number"), fields: { NUM: String(spec.number) } } };
  if (spec.text !== undefined) return { shadow: { type: typeOf("text"), fields: { TEXT: spec.text } } };
  if (spec.name !== undefined) return { shadow: { type: typeOf("variable"), fields: { VAR: spec.name } } };
  // a condition: a real comparison, v = 0, whose left side is a name to choose or type and whose right a number
  return { block: toolboxBlock("compare") };
};

/** The JSON of a block as the toolbox gives it: its slots filled with editable defaults. */
export function toolboxBlock(id) {
  const inputs = {};
  for (const [slot, spec] of Object.entries(DEFAULTS[id] || {})) inputs[slot] = shadowOf(spec);
  return Object.keys(inputs).length ? { type: typeOf(id), inputs } : { type: typeOf(id) };
}

// "Your own blocks" is a custom category: its blocks depend on the defs in the workspace, so the editor registers
// a callback under this name (registerToolboxCategoryCallback) that gives the flyout's blocks.
export const OWN_CATEGORY = "BF_OWN_BLOCKS";
const OWN_STATIC = new Set(["def", "return"]);

const entry = (id) => ({ kind: "block", ...toolboxBlock(id) });

/** The blocks of "Your own blocks" that do not depend on the program: make a block, give back. */
export function ownStaticBlocks() {
  return BLOCKS.filter((b) => OWN_STATIC.has(b.type)).map((b) => entry(b.type));
}

const paramCount = (def) => def.getFieldValue("PARAMS").split(",").filter((p) => p.trim() !== "").length;
const givesBack = (def) => def.getDescendants(false).some(
  (b) => b.type === typeOf("return") && b.getInputTargetBlock("VALUE") !== null);

/**
 * The blocks that call the defs of a workspace, sorted by name: a call with a slot (holding 0) for each parameter,
 * and a value call too when the def gives something back. Renaming a def does not rename its calls: the name on a
 * call block is a label, not a link (a known limit).
 */
export function ownBlocks(workspace) {
  const defs = workspace.getBlocksByType(typeOf("def"), false)
    .map((def) => ({ def, name: def.getFieldValue("NAME") }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const call = (type, name, count) => ({
    kind: "block",
    type: typeOf(type),
    fields: { NAME: name },
    extraState: { args: count },
    inputs: Object.fromEntries(Array.from({ length: count }, (_, i) => ["ARG" + i, shadowOf({ number: 0 })])),
  });
  return defs.flatMap(({ def, name }) => [
    call("own_call", name, paramCount(def)),
    ...(givesBack(def) ? [call("own_call_value", name, paramCount(def))] : []),
  ]);
}

// "Find a block" is the first item of the toolbox: a custom category whose flyout is the blocks that match what is typed
// (find.js registers the callback under this name).
export const SEARCH_CATEGORY = "BF_SEARCH";
const SEARCH = { kind: "category", name: "Find a block", colour: "#607D8B", icon: "search", custom: SEARCH_CATEGORY };

/** A toolbox with a search first, then every block by category. "Your own blocks" is filled by the editor (see OWN_CATEGORY). */
export function toolbox() {
  return {
    kind: "categoryToolbox",
    contents: [SEARCH, ...CATEGORIES.map((cat) => {
      const head = { kind: "category", name: cat.name, colour: cat.colour, icon: cat.icon };
      if (cat.id === "functions") return { ...head, custom: OWN_CATEGORY };
      return { ...head, contents: BLOCKS.filter((b) => b.cat === cat.id).map((b) => entry(b.type)) };
    })],
  };
}
