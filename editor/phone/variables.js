// A new variable (BF-D-053): asks a name, adds `name = 0` where module-level variables go, and gives the variable to
// the slot that asked. Where they go is the generator's order: the top stacks are written top to bottom, so a variable is set at
// the top, before the hats and the functions (and below the header, which is written above the imports).

import * as Blockly from "blockly";
import { BY_TYPE } from "../blocks/table.js";
import { isName, toolboxBlock, typeOf } from "../blocks/register.js";

/** Checks the name a learner typed. Gives `{ok: true, name}` or `{ok: false, message}` in plain words. */
export function checkName(text, taken = []) {
  const name = String(text ?? "").trim();
  if (!name) return { ok: false, message: "Type a name first." };
  if (!isName(name)) return { ok: false, message: "Use letters, digits and _. Do not start with a digit." };
  if (taken.includes(name)) return { ok: false, message: `${name} is a name already.` };
  return { ok: true, name };
}

/**
 * Where a new `name = 0` goes. `tops` are the top stacks in the order the program is written, `{kind}` each:
 * "header" (a docstring), "module" (statements at the top level), "hat" (every frame, when the sketch starts, ...), "def".
 * The answer is `{action: "append", index}` (the end of that stack: the first module stack, if it is before every hat and def)
 * or `{action: "new", index}` (a stack of its own at that place in the order: after the header, before everything else).
 */
export function variablePlace(tops) {
  const firstCode = tops.findIndex((t) => t.kind === "hat" || t.kind === "def");
  const limit = firstCode === -1 ? tops.length : firstCode;
  for (let i = 0; i < limit; i += 1) if (tops[i].kind === "module") return { action: "append", index: i };
  let index = 0;
  while (index < tops.length && tops[index].kind === "header") index += 1;
  return { action: "new", index };
}

const HATS = new Set(Object.values(BY_TYPE).filter((b) => b.hat).map((b) => typeOf(b.type)));

/** What kind of stack a top block starts. A header is the first stack, when it starts with a comment or a docstring. */
export function kindOfTop(block, first) {
  if (HATS.has(block.type)) return "hat";
  if (block.type === typeOf("def")) return "def";
  const text = block.type === typeOf("code") ? String(block.getFieldValue("TEXT") ?? "").trimStart() : "";
  if (first && /^(#|"|')/.test(text)) return "header";
  return "module";
}

/** The top stacks of a workspace in the order the generator writes them (by place, top to bottom), with their kinds. */
export function topStacks(workspace) {
  return workspace.getTopBlocks(false)
    .filter((block) => !block.outputConnection && !block.isInsertionMarker())
    .map((block) => ({ block, at: block.getRelativeToSurfaceXY() }))
    .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
    .map(({ block, at }, i) => ({ block, x: at.x, y: at.y, kind: kindOfTop(block, i === 0) }));
}

/** The names the program sets at the top level. */
export function moduleNames(tops) {
  const names = new Set();
  for (const { block, kind } of tops) {
    if (kind !== "module") continue;
    for (let b = block; b; b = b.getNextBlock()) if (b.type === typeOf("set")) names.add(b.getFieldValue("VAR"));
  }
  return names;
}

/**
 * Adds `name = 0` to a workspace where variables go, as part of the step the caller has open. Gives the `set` block, or null when
 * the program already sets that name at the top (nothing is added twice).
 */
export function addVariable(workspace, name) {
  const tops = topStacks(workspace);
  if (moduleNames(tops).has(name)) return null;
  const state = toolboxBlock("set");
  state.fields = { VAR: name };
  const block = Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
  const place = variablePlace(tops);
  if (place.action === "append") {
    let end = tops[place.index].block;
    while (end.getNextBlock()) end = end.getNextBlock();
    end.nextConnection.connect(block.previousConnection);
  } else {
    // a stack of its own, a little above the one it must stand before; the column puts the stacks in order again (column.js)
    const before = tops[place.index];
    const at = block.getRelativeToSurfaceXY();
    block.moveBy((before ? before.x : 0) - at.x, (before ? before.y - 1 : 0) - at.y);
  }
  return block;
}
