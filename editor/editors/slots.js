// Which editor a value block should have, from the slot it sits in (Funground_Calls_Note.md, section 6).
//
// A number or text block is plugged into an input of a call. The call's parameter has a kind in the catalogue
// (angle, range, colour). Two kinds of call are understood:
//   - the general call blocks, `object.name(...)`: the catalogue entry of the block (lookupEntry), then the slot's
//     place among the positional arguments, or its keyword;
//   - a block of a kit, whose Python template says what it calls (`f.fill({COLOR})`): the entry is that name, the
//     slots are the {NAMES} in the template.
// Anything else (no catalogue, no entry, no kind) gives null: the plain field stays.

import { PREFIX } from "../blocks/table.js";
import { typeOf } from "../blocks/register.js";
import { lookupEntry } from "../catalogue/call_block.js";
import { templateOf } from "../catalogue/kit.js";
import { positionalParams } from "../catalogue/slots.js";

export { templateOf };

const ARG = /^ARG(\d+)$/;

/** The input of a parent block this value block is plugged into, or null. */
const inputOf = (block) => block.outputConnection?.targetConnection?.getParentInput() ?? null;

/**
 * The parameter a value block fills: {entry, param}, or null. `param` is the signature's {name, ...}.
 * A general call asks for fresh types (lookupEntry's third argument), so the answer is true even before the type
 * tracker has run.
 */
export function slotParam(block, catalogue) {
  const input = inputOf(block);
  const parent = block.getParent();
  if (!input || !parent) return null;

  if (parent.type === typeOf("method") || parent.type === typeOf("method_value")) {
    const entry = lookupEntry(parent, catalogue, true);
    const index = ARG.exec(input.name)?.[1];
    if (!entry || index === undefined) return null;
    const args = parent.bfState?.args ?? [];
    const i = Number(index);
    if (args[i] === "k") {
      const keyword = parent.getFieldValue("KW" + i);
      const param = entry.params.find((p) => !p.star && p.name === keyword);
      return param ? { entry, param } : null;
    }
    const before = args.slice(0, i).filter((kind) => kind === "p").length;
    const param = positionalParams(entry)[before];
    return param ? { entry, param } : null;
  }

  if (!parent.type.startsWith(PREFIX)) return null;
  const template = templateOf(parent.type);
  const slot = template?.slots[input.name];
  if (!slot) return null;
  const owner = template.owner === "f" ? { kind: "f" } : catalogue.isLibrary(template.owner) ? { kind: "library", name: template.owner } : null;
  const entry = owner ? catalogue.member(owner, template.name) : null;
  if (!entry) return null;
  const param = slot.keyword
    ? entry.params.find((p) => !p.star && p.name === slot.keyword)
    : positionalParams(entry)[slot.position];
  return param ? { entry, param } : null;
}

/** The kind of a parameter as the catalogue wrote it ({kind: "range", low, high, step}), or null. */
export const kindOf = (entry, param) => entry.raw.kinds?.[param.name] ?? null;

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

const DEFAULT_CANVAS = 1000;     // when the sketch has no f.size(W, H) of plain whole numbers
const SIZE_LIMIT = 4000;         // the slider of f.size's own W and H (not the canvas it sets, or it would chase itself)

/** A whole number block's value (a positive one), or null. */
const wholeNumber = (block) => {
  if (!block || block.type !== typeOf("number")) return null;
  const text = String(block.getFieldValue("NUM")).trim();
  return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : null;
};

/** The size of the canvas the workspace asks for: the first f.size(W, H) with two whole numbers, else 1000 by 1000. */
export function canvasSize(workspace) {
  for (const block of workspace?.getAllBlocks(true) ?? []) {
    let w = null;
    let h = null;
    if (block.type === typeOf("canvas_size")) {
      w = block.getInputTargetBlock("W");
      h = block.getInputTargetBlock("H");
    } else if (block.type === typeOf("method") && block.getFieldValue("NAME") === "size") {
      const object = block.getInputTargetBlock("OBJ");
      if (object?.type !== typeOf("variable") || object.getFieldValue("VAR") !== "f") continue;
      w = block.getInputTargetBlock("ARG0");
      h = block.getInputTargetBlock("ARG1");
    } else continue;
    const width = wholeNumber(w);
    const height = wholeNumber(h);
    if (width && height) return { width, height };
    return { width: DEFAULT_CANVAS, height: DEFAULT_CANVAS };     // the first f.size decides, even if it is not plain
  }
  return { width: DEFAULT_CANVAS, height: DEFAULT_CANVAS };
}

/** The far end of a pixels slider for a parameter: the canvas width, height, or the larger of the two. */
function pixelsHigh(entry, param, workspace) {
  if (entry.name === "size" && entry.owner?.kind === "f") return SIZE_LIMIT;
  const { width, height } = canvasSize(workspace);
  const name = param.name;
  if (/^x/.test(name) || name === "width" || name === "w" || name === "dx") return width;
  if (/^y/.test(name) || name === "height" || name === "h" || name === "dy") return height;
  return Math.max(width, height);
}

/**
 * What a number block should edit with: {key: "plain"}, {key: "angle"}, or {key: "range:low:high:step", low, high, step}.
 * A pixels parameter gets a slider from 0 to the canvas (canvasSize) in whole steps.
 * The key says whether two answers are the same editor.
 */
export function numberEditor(block, catalogue) {
  const slot = slotParam(block, catalogue);
  const kind = slot && kindOf(slot.entry, slot.param);
  if (kind?.kind === "angle") return { key: "angle" };
  if (kind?.kind === "range" && isNumber(kind.low) && isNumber(kind.high) && isNumber(kind.step) && kind.step > 0 && kind.low < kind.high) {
    const { low, high, step } = kind;
    return { key: `range:${low}:${high}:${step}`, low, high, step };
  }
  if (kind?.kind === "pixels") {
    const high = pixelsHigh(slot.entry, slot.param, block.workspace);
    return { key: `range:0:${high}:1`, low: 0, high, step: 1 };
  }
  return { key: "plain" };
}

// A parameter whose type is a group of words and nothing else: `CONSTANTS.MODE`, or `CONSTANTS.STYLE | None`. One that also takes
// a number or any text (`int | CONSTANTS.PAGE | str`) is not a choice from a list.
const GROUP = /^CONSTANTS\.(\w+)(?:\s*\|\s*None)?$/;

/**
 * The words a text block may be, when the catalogue lists them for the slot, else null. The catalogue lists them in two ways:
 * the parameter's `options` (each word with its meaning), and its type in `detail`, a CONSTANTS group (the words alone).
 * Colour slots are not here: their words are a grid of colours, and a colour is also any hex value.
 */
export function choicesOf(block, catalogue) {
  const slot = slotParam(block, catalogue);
  if (!slot) return null;
  const listed = slot.entry.raw.options?.[slot.param.name]?.map((option) => option.word);
  if (listed?.length) return listed;
  const type = new RegExp(`(?:^|[(,])\\s*\\*?${slot.param.name}:\\s*([^,)=]+)`).exec(slot.entry.raw.detail ?? "")?.[1]?.trim();
  const group = type && GROUP.exec(type)?.[1];
  return (group && catalogue.constantWords(group)) || null;
}

/** Whether a text block is in a colour slot. */
export function isColourSlot(block, catalogue) {
  const slot = slotParam(block, catalogue);
  if (!slot) return false;
  return kindOf(slot.entry, slot.param)?.kind === "colour" || catalogue.isColourParam(slot.entry, slot.param.name);
}
