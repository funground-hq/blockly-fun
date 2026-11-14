// Registers the blocks of table.js with Blockly, for one pair of settings:
//   words: "scratch" | "python"   which label a block shows
//   pythonLine: true | false      whether the small grey line of Python shows under the label
// The settings change only what a block shows. Block types, fields and inputs stay the same, so a workspace saved
// as JSON loads under either setting and makes the same Python.

import * as Blockly from "blockly";
import { BLOCKS, CATEGORIES } from "./table.js";

export const PREFIX = "bf_";
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

function makeField(spec, words) {
  switch (spec.kind) {
    case "name": return new Blockly.FieldTextInput(spec.default, nameValidator);
    case "number": return new Blockly.FieldTextInput(spec.default, numberValidator);
    case "params": return new Blockly.FieldTextInput(spec.default, paramsValidator);
    case "dropdown":
      return new Blockly.FieldDropdown(spec.options.map((o) => [o[words], o.value]));
    default: return new Blockly.FieldTextInput(spec.default); // text, code
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Style

const CSS = ".injectionDiv .blocklyText.bf-python-line { fill: #d9d9d9; font-size: 8pt; font-weight: normal; font-family: monospace; }";

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

  text(str) {
    if (str) this.pending.push([new Blockly.FieldLabel(str), undefined]);
  }

  field(name) {
    this.pending.push([makeField(this.def.fields[name], this.words), name]);
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

function lineText(template, block) {
  return template.replace(/\[(\w+)\]/g, (whole, name) => {
    const value = block.getFieldValue(name);
    return value === null || value === undefined ? whole : value;
  });
}

function addLine(block, rows, template, index) {
  if (!rows.settings.pythonLine || !template) return;
  const name = "LINE" + index;
  block.appendDummyInput("PYLINE" + index).appendField(
    new Blockly.FieldLabel(lineText(template, block), "bf-python-line"), name);
  block.bfLines.push({ name, template });
}

/** Builds every input of the block for its current state. */
function layout(block, def, settings, state) {
  const rows = new Rows(block, settings.words);
  rows.settings = settings;
  rows.def = def;
  block.bfLines = [];
  const words = def[settings.words];

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

  if (def.mutator === "items" || def.mutator === "args") {
    const kinds = def.mutator === "items" ? Array(state.items).fill("p") : state.args;
    rows.tokens(words.head);
    kinds.forEach((kind, i) => {
      rows.text(i === 0 ? words.first : words.sep);
      if (kind === "k") {
        rows.pending.push([new Blockly.FieldTextInput("key", nameValidator), "KW" + i]);
        rows.text("=");
      }
      rows.value("ARG" + i);
    });
    rows.text(words.tail);
    rows.end();
  } else {
    rows.tokens(words);
    rows.end();
  }
  addLine(block, rows, def.line, 0);
  for (const name of def.body || []) block.appendStatementInput(name);
}

function updateLines(block) {
  for (const { name, template } of block.bfLines) {
    const field = block.getField(name);
    if (field) field.setValue(lineText(template, block));
  }
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
    const target = mapped && !/^LINE\d+$/.test(name) ? block.getField(mapped) : null;
    if (target) target.setValue(value);
  }
  for (const [name, target] of kept) {
    const mapped = mapName(name);
    const input = mapped ? block.getInput(mapped) : null;
    if (input && input.connection) input.connection.connect(target);
    else target.getSourceBlock().dispose(false);
  }
  updateLines(block);
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

function newSlots(def, state) {
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
  if (def.mutator === "if") return { elifs: 0, else: false };
  return null;
}

function hueOf(def) {
  return CATEGORIES.find((c) => c.id === def.cat).colour;
}

function definition(def, settings) {
  const isStatement = def.kind === "statement";
  return {
    init() {
      this.bfData = { blank: 0, trailing: false };
      this.setColour(hueOf(def));
      this.setInputsInline(true);
      if (!isStatement) this.setOutput(true);
      else if (!def.top) {
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      }
      this.bfState = initialState(def);
      layout(this, def, settings, this.bfState);
      if (typeof def.line === "string") this.setTooltip(lineText(def.line, this));
      if (def.mutator) this.setMutator(new Blockly.icons.MutatorIcon(MUTATOR_ITEMS[def.mutator].map((i) => PREFIX + "m_" + i), this));
      if (settings.pythonLine) {
        this.setOnChange((event) => {
          const own = event.blockId === this.id || (event.ids && event.ids.includes(this.id));
          if (own && !this.isDeadOrDying()) updateLines(this);
        });
      }
    },

    saveExtraState() {
      const state = { ...(this.bfState ?? {}) };
      if (isStatement) {
        if (this.bfData.blank) state.blank = this.bfData.blank;
        if (this.bfData.trailing) state.trailing = true;
      }
      return Object.keys(state).length ? state : null;
    },

    loadExtraState(state) {
      this.bfData.blank = state.blank ?? 0;
      this.bfData.trailing = !!state.trailing;
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
      // Python wants positional arguments before keyword ones, so the keyword ones go last (in the order given)
      if (def.mutator === "args") items.sort((a, b) => (a.type === "kw") - (b.type === "kw"));
      const { state, remap } = stateFromItems(def, items);
      rebuild(this, def, settings, state, remap, true);
      const next = newSlots(def, state);
      for (const item of items) item.block.bfSlot = next(item);
    },

    customContextMenu: isStatement ? function (options) { offerStatementMenu(this, options); } : undefined,
  };
}

let registeredAs = null;

/** Registers (or registers again) every block for these settings. */
export function registerBlocks({ words = "scratch", pythonLine = true } = {}) {
  if (words !== "scratch" && words !== "python") throw new Error(`words must be "scratch" or "python", not ${words}`);
  injectStyle();
  registerMutatorBlocks();
  const settings = { words, pythonLine: !!pythonLine };
  for (const def of BLOCKS) Blockly.Blocks[typeOf(def.type)] = definition(def, settings);
  registeredAs = settings;
  return settings;
}

export const registeredSettings = () => registeredAs;

/** A toolbox with every block, by category. */
export function toolbox() {
  return {
    kind: "categoryToolbox",
    contents: CATEGORIES.map((cat) => ({
      kind: "category",
      name: cat.name,
      colour: cat.colour,
      contents: BLOCKS.filter((b) => b.cat === cat.id).map((b) => ({ kind: "block", type: typeOf(b.type) })),
    })),
  };
}
