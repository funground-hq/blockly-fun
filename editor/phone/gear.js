// The gear of a block, as buttons (BF-D-053): on Blockly's page the gear opens a bubble where the parts of a block are dragged in and
// out. Here the picked block offers the same changes by name:
//
//   if                              + else if    + else    - else if    - else
//   say, a list, a call             + input      - input
//
// The block makes the change itself (register.js: bfParts, bfSetParts), the way its gear does, so the Python is the generator's and one
// button is one step to undo. A "-" takes away only the last part, and only an empty one: nothing the learner built is lost by a tap.

import { BY_TYPE, PREFIX } from "../blocks/table.js";
import { typeOf } from "../blocks/register.js";

export const GEAR_WORDS = {
  elif: "+ else if",
  else: "+ else",
  noElif: "− else if",
  noElse: "− else",
  more: "+ input",
  less: "− input",
};

const FEWEST = { say: 1 };           // a say block keeps one input; a list or a call may have none

/** Whether an input holds nothing the learner made: no block, or the number 0 / the empty text a new input starts with. */
function isBlank(input) {
  const target = input?.connection?.targetBlock();
  if (!target) return true;
  if (!target.isShadow()) return false;
  if (target.type === typeOf("number")) return ["", "0"].includes(String(target.getFieldValue("NUM")));
  if (target.type === typeOf("text")) return target.getFieldValue("TEXT") === "";
  return false;
}

const hasBody = (block, name) => !!block.getInput(name)?.connection?.targetBlock();

/** The buttons the gear of this block offers now: [{id, label, enabled}]; none when the block has no gear. */
export function gearFor(block) {
  const parts = block.bfParts?.();
  if (!parts) return [];
  const def = BY_TYPE[block.type.slice(PREFIX.length)];
  if (def.mutator === "if") {
    const elifs = parts.filter((p) => p.type === "elif");
    const hasElse = parts.some((p) => p.type === "else");
    const lastElif = elifs.at(-1);
    return [
      { id: "elif", label: GEAR_WORDS.elif, enabled: true },
      { id: "else", label: GEAR_WORDS.else, enabled: !hasElse },
      { id: "no-elif", label: GEAR_WORDS.noElif, enabled: !!lastElif && !hasBody(block, `DO${lastElif.slot}`) },
      { id: "no-else", label: GEAR_WORDS.noElse, enabled: hasElse && !hasBody(block, "ELSE") },
    ];
  }
  const last = parts.at(-1);
  return [
    { id: "more", label: GEAR_WORDS.more, enabled: true },
    { id: "less", label: GEAR_WORDS.less, enabled: !!last && parts.length > (FEWEST[def.type] ?? 0) && isBlank(block.getInput(last.slot)) },
  ];
}

/** Does what a gear button says. Gives null when it was done, or a sentence saying why not. */
export function applyGear(block, id) {
  const offered = gearFor(block).find((button) => button.id === id);
  if (!offered?.enabled) return "That cannot be done to this block now.";
  const parts = block.bfParts();
  const def = BY_TYPE[block.type.slice(PREFIX.length)];
  if (id === "elif") {
    const at = parts.findIndex((p) => p.type === "else");            // a new else if goes before the else
    parts.splice(at < 0 ? parts.length : at, 0, { type: "elif", slot: null });
  } else if (id === "else") parts.push({ type: "else", slot: null });
  else if (id === "no-elif") parts.splice(parts.findLastIndex((p) => p.type === "elif"), 1);
  else if (id === "no-else") parts.splice(parts.findIndex((p) => p.type === "else"), 1);
  else if (id === "more") parts.push({ type: def.mutator === "args" ? "pos" : "item", slot: null });
  else parts.pop();
  block.bfSetParts(parts);
  return null;
}
