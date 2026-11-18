// What the catalogue adds to the two general call blocks (Funground_Calls_Note.md, section 7): the entry a block
// stands for, its slot labels, its tooltip and its Help. All of it is looked up when shown and kept on the block in
// memory (bfSlotLabels); none of it is saved, in the JSON or in the Python.

import * as Blockly from "blockly";
import { PREFIX, categoryColour } from "../blocks/table.js";
import { slotLabel, positionalParams } from "./slots.js";
import { staticType } from "./types.js";
import { importsInWorkspace } from "./imports.js";

const METHODS = new Set([PREFIX + "method", PREFIX + "method_value"]);
const BARE = new Set([PREFIX + "call", PREFIX + "call_value"]);
const ATTRIBUTE = PREFIX + "attribute";

// A general call block takes the colour of its name (BF-D-039): the category of its catalogue section. One table; a
// name the table does not know, and a block with no entry, keep the "Calling anything else" grey. Names of funground's
// own (`f.`) go by their section; the libraries by their name.
const SECTION_CATEGORY = new Map([
  ...["Shapes", "Curves and custom shapes", "Paths and clipping", "Text and fonts", "Images and SVG", "Marks"]
    .map((section) => [section, "shapes"]),
  ...["Fill and stroke", "Colour", "Transforms and the state stack", "Live values", "Pixels and filters", "Pictures and layers",
    "Ground", "Sketch and loop", "Time", "Names for colours and options"].map((section) => [section, "canvas"]),
  ...["Maths", "Randomness and noise"].map((section) => [section, "maths"]),
  ["Interaction and controls", "events"],
]);
const LIBRARY_CATEGORY = new Map([["sound", "sound"], ["camera", "camera"], ["ml", "camera"]]);

/** The category id a catalogue entry (or null) is coloured by. */
export function categoryOfEntry(entry) {
  if (!entry) return "calls";
  const { owner } = entry;
  if (owner.kind === "library") return LIBRARY_CATEGORY.get(owner.name) ?? "calls";
  if (owner.kind === "f") return SECTION_CATEGORY.get(entry.section) ?? "calls";
  return "calls";
}

/** True for the blocks that have an object (`object.name(...)`, `object.name`). */
export const isMethodBlock = (block) => METHODS.has(block.type) || block.type === ATTRIBUTE;

/** True for a bare call, `name(...)` (BF-D-040): its list is Python's built-ins and the names the sketch imports. */
export const isBareCall = (block) => BARE.has(block.type);

/** The names the sketch imports ([{module, name, alias}]): from the last type update, or fresh if asked. */
export function importsOf(block, fresh = false) {
  const tracker = block.workspace?.bfTypes;
  if (!tracker) return importsInWorkspace(block.workspace);
  if (fresh && tracker.stale) tracker.update();
  return tracker.imports;
}

/** True for an attribute read (BF-D-037): its list is the object's properties, not its methods. */
export const isAttributeBlock = (block) => block.type === ATTRIBUTE;

/**
 * The catalogue entry of a method block (`object.name(...)`) or an attribute block (`object.name`), or null. The
 * object's type is the type rule's (types.js). If it is unknown, a name that only one class has is still that class's;
 * otherwise null: no guess. `fresh` works the types out now if they are stale; without it the last answer is used
 * (cheap enough to draw with).
 */
export function lookupEntry(block, catalogue, fresh = false) {
  if (isBareCall(block)) return catalogue.bareEntry(block.getFieldValue("NAME"), importsOf(block, fresh));
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
  const colour = categoryColour(categoryOfEntry(entry));
  if (block.getColour().toLowerCase() !== colour.toLowerCase()) block.setColour(colour);
  block.setHelpUrl(catalogue.helpUrl(entry) ?? "");
  block.getField("NAME")?.refreshDisplay?.();
}
