// What a tap on a value offers (BF-D-053). Pure functions: no page, no Blockly. The sheet (sheet.js) draws what they say,
// and a host that is not Blockly (the list's rows) passes in the same plain data.
//
// A slot is one of four kinds:
//   "number"      a number: a slider, a number pad, the variables, + - x /, "new variable", the last few numbers used
//   "expression"  any other value (a variable, a sum, a measure): the same, with no slider
//   "name"        the name of a variable in a statement (set [x] to ...): the variables and "new variable" only
//   "text"        a word or a name in quotes: the phone's keyboard, so the sheet offers nothing
//
// Variables in scope are the loop variables of the loops around the slot, the parameters of the block around it, the names the
// program sets (globals), and the sketch's own values (width, height ...), in that order.

import { BY_TYPE } from "../blocks/table.js";
import { isName } from "../blocks/register.js";

export const OPERATORS = [
  { op: "+", label: "+", word: "plus" },
  { op: "-", label: "−", word: "minus" },
  { op: "*", label: "×", word: "times" },
  { op: "/", label: "÷", word: "divided by" },
];

export const RECENT_MAX = 5;

/** The last few numbers used, newest first, no number twice. */
export class Recent {
  constructor(max = RECENT_MAX) {
    this.max = max;
    this.items = [];
  }

  add(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    this.items = [value, ...this.items.filter((v) => v !== value)].slice(0, this.max);
  }

  list() {
    return [...this.items];
  }
}

/** The sketch's own values, as the sketch_value block offers them: width and height first, they are the ones a drawing needs. */
export function sketchValues() {
  const options = BY_TYPE.sketch_value.fields.WHAT.options;
  const first = ["width", "height", "frame_count", "mouse_x", "mouse_y", "key"];
  return first.map((value) => options.find((o) => o.value === value)).filter(Boolean)
    .map((o) => ({ name: o.value, label: o.scratch, group: "sketch" }));
}

/**
 * The variables a slot can use, in the order the sheet shows them. `loops` and `params` come nearest first; `globals` are the
 * names the program sets. A name is listed once (the nearest wins); a word Python cannot use as a name is left out.
 */
export function variablesInScope({ loops = [], params = [], globals = [], sketch = sketchValues() } = {}) {
  const seen = new Set();
  const out = [];
  const add = (names, group) => {
    for (const name of names) {
      if (seen.has(name) || !isName(name)) continue;
      seen.add(name);
      out.push({ name, label: name, group });
    }
  };
  add(loops, "loop");
  add(params, "param");
  add([...new Set(globals)].sort(), "global");
  // a sketch value is listed under its own words; a variable of the same name does not hide it (they make different blocks)
  for (const entry of sketch) out.push(entry);
  return out;
}

/** The slider for a number: the catalogue's range when it has one, else a range around the value. */
export function sliderFor(value, range = null) {
  if (range && range.low < range.high && range.step > 0) return { low: range.low, high: range.high, step: range.step };
  const v = Number.isFinite(value) ? value : 0;
  const reach = Math.abs(v);
  const high = reach <= 10 ? 10 : reach <= 100 ? 100 : 10 ** Math.ceil(Math.log10(reach * 1.5));
  return { low: v < 0 ? -high : 0, high, step: Number.isInteger(v) ? 1 : 0.1 };
}

/** What the sheet offers for a slot: `{kind, value, range, scope, recent}` in, the parts to draw out. */
export function offerFor({ kind, value = null, range = null, scope = [], recent = [] }) {
  if (kind === "text") return { keyboard: true, slider: null, pad: false, variables: [], operators: [], newVariable: false, recent: [] };
  if (kind === "name") return { keyboard: false, slider: null, pad: false, variables: scope, operators: [], newVariable: true, recent: [] };
  return {
    keyboard: false,
    slider: kind === "number" ? sliderFor(value, range) : null,
    pad: true,
    variables: scope,
    operators: OPERATORS,
    newVariable: true,
    recent,
  };
}

/**
 * The block a slot becomes when an operator is chosen: `[old] op [ ]`. The old block is the left side, the right side is an
 * empty number (0, a shadow), and the sheet goes on to the right side. `old` is the old block's own state (Blockly's JSON).
 */
export function wrapInOperator(op, old) {
  if (!OPERATORS.some((o) => o.op === op)) throw new Error(`not an operator: ${op}`);
  return {
    type: "bf_arith",
    fields: { OP: op },
    inputs: { A: { block: old }, B: { shadow: { type: "bf_number", fields: { NUM: "0" } } } },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The number pad

/** The pad's state is the text typed so far. The first digit after the sheet opens starts a new number (`fresh`). */
export const startPad = (value) => ({ text: value === null || value === undefined ? "" : String(value), fresh: true });

/** One press: "0".."9", ".", "-" (changes the sign) or "back". */
export function padPress(state, key) {
  const base = state.fresh && key !== "back" && key !== "-" ? "" : state.text;
  let text = base;
  if (key === "back") text = state.text.slice(0, -1);
  else if (key === "-") text = state.text.startsWith("-") ? state.text.slice(1) : "-" + state.text;
  else if (key === ".") text = base.includes(".") ? base : (base === "" || base === "-" ? base + "0." : base + ".");
  else if (/^\d$/.test(key)) text = base === "0" ? key : base === "-0" ? "-" + key : base + key;
  return { text, fresh: key === "-" ? state.fresh : false };
}

/** The number the pad's text stands for, or null while it is not one yet ("", "-", "3."). */
export function padValue(text) {
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}
