// Kit blocks and the name list (Funground_Calls_Note.md, section 5; BF-6).
//
// A name of funground's that has a named kit block (`f.circle` has "circle at x y size", `sound.melody` has "melody")
// is marked in the list of the general call block: "has its own block". Choosing it puts the kit block in the place of
// the general block, but only where nothing is lost: the kit block's slots stand for the call's arguments one to one.
// Otherwise the row is only marked, and the general block is built as for any other name.
//
// Only library functions and values of `f` have kit blocks (BF-D-035). A method (`tune.play()`) never does.

import { BLOCKS, BY_TYPE, PREFIX } from "../blocks/table.js";

/** Splits at commas outside brackets and quotes. */
function splitArgs(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "\"" || ch === "'") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

const templates = new Map();

/**
 * What a kit block calls, from its Python template: `f.rect({X}, {Y}, {W}, {H})` gives
 * {owner: "f", name: "rect", slots: {X: {position: 0}, ...}}; `name={SLOT}` gives {keyword: "name"}. null when the
 * template is not a call of that shape (a def, a loop, a bare value). The one reader of kit templates: the name list
 * (here) and the slot editors (editors/slots.js) both use it.
 */
export function templateOf(type) {
  if (templates.has(type)) return templates.get(type);
  const python = BY_TYPE[type.slice(PREFIX.length)]?.python;
  const match = typeof python === "string" ? /^(\w+)\.(\w+)\((.*)\)$/.exec(python) : null;
  let found = null;
  if (match) {
    const slots = {};
    let position = 0;
    for (const part of splitArgs(match[3])) {
      const slot = /^(?:(\w+)=)?\{(\w+)\}$/.exec(part);
      if (!slot) {
        if (!/^\w+=/.test(part)) position++;          // a fixed argument still takes its place
        continue;
      }
      slots[slot[2]] = slot[1] ? { keyword: slot[1] } : { position: position++ };
    }
    found = { owner: match[1], name: match[2], slots };
  }
  templates.set(type, found);
  return found;
}

const KITS = new Map();   // "f.circle" -> {def, fields}: the block and the fields it needs
for (const def of BLOCKS) {
  if (def.call) KITS.set(def.call, { def, fields: {} });
}
// the sketch's values (mouse x, width, the key pressed ...) are one block with a dropdown: each value is a kit of its own
const SKETCH = BLOCKS.find((def) => def.type === "sketch_value");
for (const option of SKETCH.fields.WHAT.options) KITS.set(`f.${option.value}`, { def: SKETCH, fields: { WHAT: option.value } });

/** What kit blocks of calls and values give back, for the type rule: block type -> [library or "f", name]. */
export const KIT_CALLS = new Map(BLOCKS.filter((def) => def.call && def.kind === "value").map((def) => {
  const [owner, name] = def.call.split(".");
  return [PREFIX + def.type, { owner, name }];
}));

/** The names of a kit block's value slots, in the order they stand in its Python (the order of the call's arguments). */
export const slotNames = (def) => Object.keys(templateOf(PREFIX + def.type)?.slots ?? {});

const ownerName = (entry) => (entry.owner.kind === "f" ? "f" : entry.owner.kind === "library" ? entry.owner.name : null);

/** The kit block of a catalogue entry, {def, fields}, or null. */
export function kitFor(entry) {
  const owner = ownerName(entry);
  return owner ? KITS.get(`${owner}.${entry.name}`) ?? null : null;
}

/**
 * Whether the kit block can take the place of this general block, losing nothing. Needs:
 *   - the object is the bare name the kit stands for (`f`, `sound`), and the block is a value if the kit is;
 *   - for a call: no keyword arguments, and as many positional arguments as the kit has slots (or none, when the block
 *     was just made), and the kit's slots cover the call's required parameters without passing its positional ones.
 * `text_align` has a dropdown where the call has an argument, so it never fits: its row is only marked.
 */
export function kitFits(block, entry, kit) {
  const object = block.getInputTargetBlock("OBJ");
  if (!object || object.type !== PREFIX + "variable" || object.getFieldValue("VAR") !== ownerName(entry)) return false;
  if ((kit.def.kind === "value") !== !!block.outputConnection) return false;
  const slots = slotNames(kit.def).length;
  if (block.type === PREFIX + "attribute") return slots === 0;
  const args = block.bfState?.args ?? [];
  if (args.includes("k") || (args.length && args.length !== slots)) return false;
  const required = entry.params.filter((p) => p.required).length;
  const positional = entry.params.filter((p) => !p.star).length;
  return required <= slots && slots <= positional;
}
