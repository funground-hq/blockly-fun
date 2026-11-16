// What the catalogue adds to the two general call blocks (Funground_Calls_Note.md, section 7): the entry a block
// stands for, its slot labels, its tooltip and its Help. All of it is looked up when shown and kept on the block in
// memory (bfSlotLabels); none of it is saved, in the JSON or in the Python.

import * as Blockly from "blockly";
import { PREFIX } from "../blocks/table.js";
import { slotLabel, positionalParams } from "./slots.js";
import { staticType } from "./types.js";

const METHODS = new Set([PREFIX + "method", PREFIX + "method_value"]);
const ATTRIBUTE = PREFIX + "attribute";

/** True for the blocks that have an object (`object.name(...)`, `object.name`); a bare `name(...)` has no list. */
export const isMethodBlock = (block) => METHODS.has(block.type) || block.type === ATTRIBUTE;

/** True for an attribute read (BF-D-037): its list is the object's properties, not its methods. */
export const isAttributeBlock = (block) => block.type === ATTRIBUTE;

/**
 * The catalogue entry of a method block (`object.name(...)`) or an attribute block (`object.name`), or null. The
 * object's type is the type rule's (types.js). If it is unknown, a name that only one class has is still that class's;
 * otherwise null: no guess. `fresh` works the types out now if they are stale; without it the last answer is used
 * (cheap enough to draw with).
 */
export function lookupEntry(block, catalogue, fresh = false) {
  if (!isMethodBlock(block)) return null;
  const tracker = block.workspace?.bfTypes;
  const type = tracker ? (fresh ? tracker.objectType(block) : tracker.peekObjectType(block)) : staticType(block, catalogue);
  const name = block.getFieldValue("NAME");
  if (isAttributeBlock(block)) return catalogue.property(type, name) ?? (type ? null : catalogue.onlyProperty(name));
  return type ? catalogue.member(type, name) : catalogue.onlyMember(name);
}

/** The tooltip: the signature, then the plain sentence (or the summary). */
export function tooltipOf(entry) {
  return `${entry.signature}\n${entry.plain}`.trim();
}

/**
 * Brings what is shown up to date: the slot labels, the Help address, the name as spoken ("text align"). Nothing
 * here is an event, and nothing is saved.
 */
export function refreshCall(block) {
  const catalogue = block.bfCatalogue;
  if (!catalogue || block.isDeadOrDying?.() || block.disposed) return;
  const entry = lookupEntry(block, catalogue, true);
  const params = entry ? positionalParams(entry) : [];
  Blockly.Events.disable();   // a count: every disable is undone by one enable
  try {
    (block.bfSlotLabels || []).forEach((slot, i) => {
      const text = slot.positional && params[i] ? slotLabel(params[i]) : slot.plain;
      if (slot.field.getValue() !== text) slot.field.setValue(text);
    });
  } finally {
    Blockly.Events.enable();
  }
  block.setHelpUrl(catalogue.helpUrl(entry) ?? "");
  block.getField("NAME")?.refreshDisplay?.();
}
