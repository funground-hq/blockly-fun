// The block list (BF-D-053): a full-width list over the editor, one block per row (its words, and a small mark in
// the colour of its kind), most used first, a search box at the top and a few chips for the kinds. A tap on a row chooses the
// block; the caller decides where it goes. No Blockly in the page part: the rows are plain data.
//
// Phone scope (the OctoStudio lesson, maintainer 19 Nov): a phone offers the catalogue's most used blocks of each kind (PER_KIND)
// and the Python basics a sketch needs (BASICS), not every block. The last row says what is left out, in a sentence.

import { BLOCKS, CATEGORIES } from "../blocks/table.js";
import { haystack, tierOf } from "../find.js";
import { addPhoneStyle, ignoreGhostClick, make } from "./style.js";

/** How many blocks of each kind the phone offers, most used first. The cut was measured in the spike (BF-D-053). */
export const PER_KIND = 5;

/** The blocks a sketch cannot do without, offered whatever their rank: repeat, count, if, set, change, variables, maths, comparisons. */
export const BASICS = ["repeat", "count", "if", "set", "change", "variable", "number", "text", "arith", "compare", "logic", "not", "say", "sketch_frame", "sketch_start"];

/** The general blocks that need a name typed or a gear: the phone leaves them to a larger screen or to Code. */
export const LEFT_OUT = new Set(["call", "call_value", "method", "method_value", "attribute", "code", "code_value", "own_call", "own_call_value"]);

/** The catalogue does not rank the Python basics (they are not calls of funground's), so they stand first, in this order. */
export const BASIC_RANK = Object.fromEntries(BASICS.map((type, i) => [type, 400 - i * 10]));

export const MORE_WORDS = "More blocks on a larger screen or in Code";

/** The catalogue's rank of a block (a kit block stands for a call: "f.circle"), else the basics' rank, else 0. */
export function rankOfBlock(def, catalogue) {
  if (def.call && catalogue) {
    const [owner, name] = def.call.split(".");
    const entry = owner === "f" ? (catalogue.functions.get(name) ?? catalogue.values.get(name)) : catalogue.libraries.get(owner)?.get(name);
    if (entry) return entry.rank;
  }
  return BASIC_RANK[def.type] ?? 0;
}

/**
 * The blocks the phone offers: the first `perKind` of each kind by rank (the table's order breaks a tie), and the basics.
 * `rankOf(def)` gives a rank. The answer is the block definitions, most used first.
 */
export function phoneScope(blocks, rankOf, { perKind = PER_KIND, basics = BASICS, left = LEFT_OUT } = {}) {
  const order = new Map(blocks.map((def, i) => [def, i]));
  const byRank = (a, b) => rankOf(b) - rankOf(a) || order.get(a) - order.get(b);
  const chosen = new Set(blocks.filter((def) => basics.includes(def.type)));
  const kinds = new Map();
  for (const def of blocks) {
    if (left.has(def.type)) continue;
    if (!kinds.has(def.cat)) kinds.set(def.cat, []);
    kinds.get(def.cat).push(def);
  }
  for (const list of kinds.values()) for (const def of list.sort(byRank).slice(0, perKind)) chosen.add(def);
  return [...chosen].sort(byRank);
}

/** A block's words for a row: the label in Scratch's words, with each slot as "..." and each choice as its first word. */
export function labelOf(def) {
  const text = typeof def.scratch === "string" ? def.scratch : `${def.scratch.head ?? def.scratch.if ?? ""} ${def.scratch.first ?? ""}`;
  return text
    .replace(/\{\w+\}/g, "…")
    .replace(/\[(\w+)\]/g, (whole, name) => {
      const field = def.fields?.[name];
      const option = field?.options?.find((o) => o.value === field.default);
      return option ? option.scratch : "…";
    })
    .replace(/\s+/g, " ").trim();
}

const category = (id) => CATEGORIES.find((c) => c.id === id);

/** The rows of the list: the scope, as plain data. `accept(def)` keeps the blocks that can go where the caller is adding. */
export function rowsFor(catalogue, accept = () => true, blocks = BLOCKS) {
  return phoneScope(blocks, (def) => rankOfBlock(def, catalogue)).filter(accept).map((def) => ({
    type: def.type,
    label: labelOf(def),
    kind: def.cat,
    kindName: category(def.cat).name,
    colour: category(def.cat).colour,
    rank: rankOfBlock(def, catalogue),
    hay: haystack(def, null),
  }));
}

/** The rows that match a search and a kind, best first (the block's first word, then any word, then its Python name; then by rank). */
export function matching(rows, query = "", kind = null) {
  const q = query.trim();
  const out = [];
  rows.forEach((row, order) => {
    if (kind && row.kind !== kind) return;
    const tier = q ? tierOf(row.hay, q) : 0;
    if (tier >= 0) out.push({ row, tier, order });
  });
  out.sort((a, b) => a.tier - b.tier || a.order - b.order);
  return out.map((m) => m.row);
}

/** The kinds that have a chip, in this order: the few a sketch uses most. A chip shows only when a row has the kind. */
export const CHIPS = [["control", "Control"], ["variables", "Variables"], ["events", "Events"], ["shapes", "Shapes"], ["canvas", "Colour"], ["maths", "Maths"]];

export const WORDS = { find: "Find a block", all: "All", close: "Close", nothing: "No block has these words." };

/**
 * Opens the list over `host`. `rows` come from rowsFor; `onChoose(row)` is called by a tap on a row (the caller closes the list
 * when the choice is placed); `onClose()` by the Close button. Gives `{close, root}`.
 */
export function openBlockList(host, { rows, onChoose, onClose = () => {}, title = WORDS.find }) {
  addPhoneStyle();
  const root = make("div", "bfp-list", undefined, { role: "dialog", "aria-label": "Add a block" });
  let query = "";
  let kind = null;

  const find = make("div", "bfp-find");
  const input = make("input", "", undefined, {
    type: "search", placeholder: title, "aria-label": title, autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search",
    "data-bf": "search",
  });
  const close = make("button", "", WORDS.close, { type: "button", "data-bf": "close-list" });
  find.append(input, close);

  const chips = make("div", "bfp-chips");
  const kinds = [[null, WORDS.all], ...CHIPS.filter(([id]) => rows.some((r) => r.kind === id))];
  const chipButtons = kinds.map(([id, label]) => {
    const b = make("button", "", label, { type: "button", "aria-pressed": String(id === kind), "data-bf": `chip-${id ?? "all"}` });
    b.addEventListener("click", () => { kind = id; draw(); });
    chips.append(b);
    return [id, b];
  });

  const list = make("div", "bfp-rows");

  function draw() {
    for (const [id, b] of chipButtons) b.setAttribute("aria-pressed", String(id === kind));
    list.replaceChildren();
    const shown = matching(rows, query, kind);
    for (const row of shown) {
      const b = make("button", "bfp-block", undefined, { type: "button", "data-bf": `block-${row.type}` });
      const mark = make("span", "bfp-mark", "", { "aria-hidden": "true", title: row.kindName });
      mark.style.background = row.colour;
      b.append(mark, make("span", "", row.label));
      b.addEventListener("click", () => onChoose(row));
      list.append(b);
    }
    if (!shown.length) list.append(make("div", "bfp-more", WORDS.nothing));
    list.append(make("div", "bfp-more", MORE_WORDS, { "data-bf": "more-words" }));
  }

  input.addEventListener("input", () => { query = input.value; draw(); });
  close.addEventListener("click", () => onClose());
  root.append(find, chips, list);
  draw();
  host.append(root);
  ignoreGhostClick(root);
  return { root, close: () => root.remove() };
}
