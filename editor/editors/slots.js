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

/**
 * What a number block should edit with: {key: "plain"}, {key: "angle"}, or {key: "range:low:high:step", low, high, step}.
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
  return { key: "plain" };
}

/** Whether a text block is in a colour slot. */
export function isColourSlot(block, catalogue) {
  const slot = slotParam(block, catalogue);
  if (!slot) return false;
  return kindOf(slot.entry, slot.param)?.kind === "colour" || catalogue.isColourParam(slot.entry, slot.param.name);
}
