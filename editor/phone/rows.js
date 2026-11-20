// The phone layout (BF-D-053): what a row says. The program is a list of rows, one for each line of a statement block (a C block's bodies are
// rows under it, one step in; an "if" with "else" has a row for each part). This file works out the rows from Blockly's blocks and says
// what is in each as plain data, so it can be tested without a page. list.js draws them.
//
// The words are not written again here. The "Blocks" look reads a block's own inputs: the labels Blockly would draw (Scratch's words
// as the table gave them), the fields (a dropdown, a name, a text box) and the value slots. The "Code" look reads the table's Python
// template of the block, with the same slots and fields as chips. A row is:
//
//   {type: "line", block, segment, look, depth, rails, colour, ink, hat, parts}   a line of a block
//   {type: "empty", block, conn, depth, rails}                              the body of a C that has nothing in it yet
//
// and a part of a line is one of
//
//   {type: "word", text}                                                    a word (a label, or a piece of Python)
//   {type: "field", block, name, kind, text}                                a field of a statement or an operator: kind "name", "catalogue", "choice", "text" or "code"
//   {type: "slot", conn, block, text}                                       a value in a slot: a chip with a text (a number, a name, a colour ...)
//   {type: "slot", conn, block, parts}                                      a value that has slots of its own (x + i): a chip with chips in it
//   {type: "slot", conn, block: null, text}                                 an empty slot
//
// In the Code look a slot is always one chip with the value's Python as its text (to change a part of a sum, switch to Blocks).

import * as Blockly from "blockly";
import { BY_TYPE, PREFIX } from "../blocks/table.js";
import { FieldName } from "../blocks/register.js";
import { FieldCatalogueName } from "../catalogue/field.js";
import { generator, headerLines } from "../generator/python.js";
import { previewOf } from "../fold.js";
import { topStacks } from "./variables.js";

const STATEMENT = Blockly.inputs.inputTypes.STATEMENT;
const VALUE = Blockly.inputs.inputTypes.VALUE;

export const LOOKS = ["blocks", "code"];

/** What the switch in the list's top row calls each look. */
export const LOOK_WORDS = { blocks: "Blocks", code: "Python" };

const defOf = (block) => BY_TYPE[block.type.slice(PREFIX.length)];
const word = (text) => ({ type: "word", text });

// ---------------------------------------------------------------------------------------------------------------
// Colour

/** Black or white, whichever reads better on a colour (#rrggbb). */
export function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#191970" : "#ffffff";
}

// ---------------------------------------------------------------------------------------------------------------
// Fields and slots

/** The Python of a field's value: a dropdown's option has one (a choice of "×" is `*`), anything else is as it is. */
function pythonOfField(block, field) {
  const spec = defOf(block)?.fields?.[field.name];
  const option = spec?.options?.find((o) => o.value === field.getValue());
  return option ? option.python : String(field.getValue());
}

function fieldPart(block, field, look) {
  const kind = field instanceof FieldName ? "name"
    : field instanceof FieldCatalogueName ? "catalogue"
      : field instanceof Blockly.FieldDropdown ? "choice"
      : defOf(block)?.fields?.[field.name]?.kind === "code" ? "code" : "text";
  let text = look === "code" ? pythonOfField(block, field) : String(field.getText());
  if (kind === "code") text = previewOf(field.getValue());
  return { type: "field", block, name: field.name, kind, text };
}

/** The Python a value block writes; of a value that has several lines (Python code), the first and "…". */
export function pythonOf(block) {
  let code = "";
  try {
    const made = generator.blockToCode(block);
    code = Array.isArray(made) ? made[0] : "";
  } catch (error) {
    code = "";
  }
  const [first, ...more] = code.split("\n");
  return more.some((l) => l.trim() !== "") ? `${first}…` : first;
}

/** What stands in a slot: a chip. In the Blocks look a value with slots of its own has the chips of those in it. */
function slotPart(input, look) {
  const conn = input.connection;
  const target = conn.targetBlock();
  if (!target) return { type: "slot", conn, block: null, text: "empty" };
  if (look === "code") return { type: "slot", conn, block: target, text: pythonOf(target) };
  const parts = valueParts(target);
  if (parts.some((p) => p.type === "slot")) return { type: "slot", conn, block: target, parts };
  return { type: "slot", conn, block: target, text: parts.map((p) => p.text).join("").replace(/\s+/g, " ").trim() };
}

/** The parts of a "Python code" block: its words and the first line of its text. */
function codeParts(block) {
  const label = String(block.bfFold?.label ?? "Python code:");
  return [word(label), fieldPart(block, block.getField("TEXT"), "blocks")];
}

/** The parts of a value block: the same walk. Gives parts with no slots for a leaf (a number, a name, a word in quotes). */
function valueParts(block) {
  return defOf(block)?.fold ? codeParts(block) : partsOf(block, block.inputList.filter((i) => !i.name.startsWith("PYLINE")));
}

// ---------------------------------------------------------------------------------------------------------------
// The lines of a block, by look

/**
 * Parts from a Python template of the table: `{SLOT}` is a slot, `[FIELD]` a field, the rest words. `rename` maps a slot's name in the
 * template to the input's (an "if" has IF0, IF1 ... for the template's {IF}).
 */
export function templateParts(block, template, rename = (name) => name) {
  const parts = [];
  for (const piece of template.split(/(\{\w+\}|\[\w+\])/)) {
    if (piece === "") continue;
    const name = piece.slice(1, -1);
    if (/^\{\w+\}$/.test(piece)) {
      const input = block.getInput(rename(name));
      if (input?.connection) parts.push(slotPart(input, "code"));
    } else if (/^\[\w+\]$/.test(piece)) {
      const field = block.getField(name);
      if (field instanceof Blockly.FieldLabel) parts.push(word(String(field.getValue())));
      else if (field) parts.push(fieldPart(block, field, "code"));
    } else parts.push(word(piece));
  }
  return parts;
}

/** The Python line of a call with a list of arguments (print, a general call, a call of a block of one's own). */
function listLine(block, template) {
  const parts = templateParts(block, template.head);
  const args = block.inputList.filter((i) => /^ARG\d+$/.test(i.name));
  args.forEach((input, i) => {
    const sep = i === 0 ? template.first : template.sep;
    if (sep) parts.push(word(`${sep} `));
    const keyword = block.getField("KW" + input.name.slice(3));
    if (keyword) parts.push(fieldPart(block, keyword, "code"), word("="));
    parts.push(slotPart(input, "code"));
  });
  parts.push(...templateParts(block, template.tail));
  return parts;
}

const bodyInput = (block, name) => block.getInput(name);

/**
 * The generator puts the Python of a slot in brackets when Python needs them (`while not (a and b):`). The row has them as words around the
 * chip, found by laying the parts along the line the generator wrote.
 */
function withBrackets(parts, line) {
  if (line === undefined) return parts;
  let built = "";
  const out = [];
  for (const part of parts) {
    if (part.type === "slot" && part.block && !line.startsWith(built + part.text) && line.startsWith(`${built}(${part.text})`)) {
      out.push(word("("), part, word(")"));
      built += `(${part.text})`;
    } else {
      out.push(part);
      built += part.text;
    }
  }
  return out;
}

/** The lines of a block in the Code look: `[{parts, body}]`, `body` the statement input that hangs under the line, or null. */
function codeSegments(block, def) {
  const lines = headerLines(block);
  return codeLines(block, def).map((segment, i) => ({ ...segment, parts: withBrackets(segment.parts, lines[i]) }));
}

function codeLines(block, def) {
  // Python code is Python already: its first line, with no label
  if (def.fold) return [{ parts: [fieldPart(block, block.getField("TEXT"), "code")], body: null }];
  if (def.mutator === "if") {
    const out = [];
    const state = block.bfState;
    for (let i = 0; i <= state.elifs; i += 1) {
      const head = templateParts(block, i === 0 ? def.python.if : def.python.elseif, () => "IF" + i);
      out.push({ parts: [...head, word(":")], body: bodyInput(block, "DO" + i) });
    }
    if (state.else) out.push({ parts: [...templateParts(block, def.python.else), word(":")], body: bodyInput(block, "ELSE") });
    return out;
  }
  const body = block.inputList.find((i) => i.type === STATEMENT) ?? null;
  // `for i in range(10)`: a "count" with no start is written without one (the converter makes it so)
  const noStart = def.type === "count" && !block.getInputTargetBlock("A");
  const template = noStart ? "for [VAR] in range({B})" : def.python;
  const parts = typeof template === "string" ? templateParts(block, template) : listLine(block, template);
  if (body) parts.push(word(":"));
  return [{ parts, body }];
}

/** The lines of a block in the Blocks look, read from its inputs: a line ends where a body (a statement input) begins. */
function blockSegments(block, def) {
  if (def.fold) return [{ parts: codeParts(block), body: null }];
  const out = [];
  let from = 0;
  const inputs = block.inputList.filter((i) => !i.name.startsWith("PYLINE"));
  inputs.forEach((input, at) => {
    if (input.type !== STATEMENT) return;
    // the labels of the C itself ("else") belong to this line, with whatever came before it since the last body
    const own = [];
    for (const field of input.fieldRow) {
      if (field instanceof Blockly.FieldLabel && String(field.getValue()).trim()) own.push(word(String(field.getValue())));
    }
    out.push({ parts: [...partsOf(block, inputs.slice(from, at)), ...own], body: input });
    from = at + 1;
  });
  const rest = partsOf(block, inputs.slice(from));
  if (rest.length || !out.length) out.push({ parts: rest, body: null });
  return out;
}

/** The parts of some of a block's inputs (all but the statement ones: bodies are rows of their own). */
function partsOf(block, inputs) {
  const parts = [];
  for (const input of inputs) {
    if (input.type === STATEMENT) continue;
    for (const field of input.fieldRow) {
      if (field instanceof Blockly.FieldLabel) {
        const text = String(field.getValue() ?? "");
        if (text.trim()) parts.push(word(text));
      } else if (field.name) parts.push(fieldPart(block, field, "blocks"));
    }
    if (input.type === VALUE && input.connection) parts.push(slotPart(input, "blocks"));
  }
  return parts;
}

/** The lines of a statement block, in a look: `[{parts, body}]`. */
export function segmentsOf(block, look = "blocks") {
  const def = defOf(block);
  if (!def) return [{ parts: [word(block.type)], body: null }];
  return look === "code" ? codeSegments(block, def) : blockSegments(block, def);
}

/**
 * The words of a line as one text (for a screen reader, and for a test). The Blocks look puts a space between the parts (they are
 * apart on the screen); the Code look's words have the spaces of the Python in them.
 */
export function textOfParts(parts, look = "blocks") {
  const joint = look === "code" ? "" : " ";
  return parts.map((p) => (p.type === "word" ? p.text : p.parts ? `(${textOfParts(p.parts, look)})` : p.text)).join(joint).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------------------------
// The rows of a program

function stackRows(first, depth, rails, look, out) {
  for (let block = first; block; block = block.getNextBlock()) {
    if (block.isInsertionMarker()) continue;
    const def = defOf(block);
    const colour = block.getColour();
    segmentsOf(block, look).forEach((segment, i) => {
      out.push({
        type: "line", block, segment: i, look, depth, rails, colour, ink: inkFor(colour), hat: !!def?.hat, parts: segment.parts,
      });
      if (!segment.body?.connection) return;
      const inner = [...rails, colour];
      const child = segment.body.connection.targetBlock();
      if (child) stackRows(child, depth + 1, inner, look, out);
      else out.push({ type: "empty", block, conn: segment.body.connection, depth: depth + 1, rails: inner });
    });
  }
  return out;
}

/** The rows of the whole program, in the order the Python is written. */
export function describeProgram(workspace, look = "blocks") {
  if (!LOOKS.includes(look)) throw new Error(`look must be "blocks" or "code", not ${look}`);
  const out = [];
  for (const { block } of topStacks(workspace)) stackRows(block, 0, [], look, out);
  return out;
}
