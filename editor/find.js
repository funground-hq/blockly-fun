// Find a block (BF-D-050): the first item of the toolbox, in both layouts. As the learner types, the blocks of the toolbox
// whose words match show in the flyout.
//
// What a block can be found by: its words (the label in Scratch's words, the label with the catalogue, the choices of its
// dropdowns) and its Python name (the Python label, the funground call it stands for, "f.circle"). Words are matched
// by their start, in any order, in lower case: "sq" finds "square at x ... size ..." and "square root of"; "circle size"
// finds the circle block. A name with a dot or an underscore is also matched by each of its parts ("size" finds f.size).
// Nothing is new data: the blocks are the toolbox's own, and the calls of the learner's own blocks.

import { BLOCKS } from "./blocks/table.js";
import { SEARCH_CATEGORY, toolbox, ownStaticBlocks, ownBlocks, typeOf } from "./blocks/register.js";

export const MAX_RESULTS = 40;
export const HINT = "Type a word, like square or circle.";
export const NOTHING = "No block has these words.";

const pieces = (label) => (typeof label === "string" ? [label] : label ? [label.head, label.first, label.sep, label.tail] : []);

/** The lower-case words of a text: letters and digits, with names like canvas_size and f.circle kept whole and in parts. */
export function wordsOf(text) {
  const out = new Set();
  const clean = String(text ?? "").toLowerCase().replace(/[{[][A-Z0-9_]+[}\]]/gi, " ");
  for (const word of clean.split(/[^\p{L}\p{N}_.]+/u)) {
    if (!word) continue;
    out.add(word);
    for (const part of word.split(/[_.]+/)) if (part) out.add(part);
  }
  return out;
}

function haystack(def, state) {
  const options = Object.values(def?.fields ?? {}).flatMap((f) => (f.options ?? []).flatMap((o) => [o.scratch, o.python]));
  const visible = new Set();
  const python = new Set();
  const add = (set, texts) => texts.forEach((t) => wordsOf(t).forEach((w) => set.add(w)));
  if (def) {
    add(visible, [...pieces(def.scratch), ...pieces(def.catalogue?.scratch), ...options]);
    add(python, [...pieces(def.python), def.call]);
  }
  // the call of a block of the learner's own: its name
  if (state?.fields?.NAME) add(visible, ["call " + state.fields.NAME]);
  return { visible, python, first: [...wordsOf(pieces(def?.scratch)[0] ?? "")][0] ?? "" };
}

const startsWith = (set, q) => { for (const w of set) if (w.startsWith(q)) return true; return false; };

/** The tier of a match, lower is better, or -1 for none: 0 the block's first word, 1 any of its words, 2 only its Python name. */
export function tierOf(hay, query) {
  let worst = 0;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return -1;
  for (const q of words) {
    const tier = hay.first.startsWith(q) ? 0 : startsWith(hay.visible, q) ? 1 : startsWith(hay.python, q) ? 2 : -1;
    if (tier < 0) return -1;
    worst = Math.max(worst, tier);
  }
  return worst;
}

/** Every block that can be found: the toolbox's blocks, and the calls of the workspace's own blocks (if there is one). */
export function findable(workspace) {
  const own = workspace ? ownBlocks(workspace) : [];
  const entries = [...toolbox().contents.flatMap((c) => c.contents ?? []), ...ownStaticBlocks(), ...own];
  return entries.map((state) => ({ state, hay: haystack(BLOCKS.find((b) => typeOf(b.type) === state.type), state) }));
}

/** The blocks (toolbox JSON) that match a query, best first: the block's first word, then its words, then its Python name. */
export function findBlocks(query, workspace = null) {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const hits = [];
  findable(workspace).forEach(({ state, hay }, order) => {
    const tier = tierOf(hay, q);
    if (tier >= 0) hits.push({ state, tier, order });
  });
  hits.sort((a, b) => a.tier - b.tier || a.order - b.order);
  return hits.slice(0, MAX_RESULTS).map((h) => h.state);
}

/**
 * Registers the flyout's contents for the search category and returns what the page needs: `query(text)` sets the
 * words and shows the matches again.
 */
export function attachFind(workspace, { layout }) {
  let text = "";
  workspace.registerToolboxCategoryCallback(SEARCH_CATEGORY, (ws) => {
    // in the wide layout the flyout is a column and the search box is laid over its top: a gap keeps the blocks clear of it
    const gap = layout === "wide" ? [{ kind: "sep", gap: "44" }] : [];
    const found = findBlocks(text, ws);
    if (found.length) return [...gap, ...found.map((b) => ({ kind: "block", ...b }))];
    return [...gap, { kind: "label", text: text.trim() ? NOTHING : HINT }];
  });
  return {
    get text() { return text; },
    query(next) {
      text = next;
      workspace.getToolbox()?.refreshSelection();
    },
    /** True when the flyout that is open is the search's. */
    isOpen() {
      const item = workspace.getToolbox()?.getSelectedItem();
      return !!item && item.getContents?.() === SEARCH_CATEGORY && !!workspace.getFlyout()?.isVisible();
    },
  };
}

