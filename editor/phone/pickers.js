// The other sheets of the phone layout (BF-D-053): what a tap on a word, a choice or a colour opens. They are like the slot sheet (sheet.js): a
// sheet from the bottom of the screen, a title, Done. Plain data in, callbacks out; no Blockly in here.
//
//   openChoiceSheet(host, {title, options: [{value, label, hex?}], current, onChoose(value), onDone()})
//       a list of buttons (a dropdown's options, the words a slot takes), or a grid of colour squares when the options have a hex.
//       A tap on one is the choice, and the sheet closes.
//   openNameSheet(host, {title, scope, current, onChoose(entry), onUse(text), onDone()})
//       the catalogue's names for a place (catalogue.scope), with a search box: the names most used first, the same search as the name list
//       of the wide layout (catalogue/search.js). A tap on a row is onChoose(entry); with something typed that no row is called, the last
//       row is "Use this name", onUse(text).
//   openTextSheet(host, {title, value, multiline, onInput(text), onDone()})
//       the phone's keyboard: the only sheet with an input box. Each key is told to onInput at once, so the canvas follows.

import { searchScope } from "../catalogue/search.js";
import { addPhoneStyle, ignoreGhostClick, make } from "./style.js";

const WORDS = {
  done: "Done", textLabel: "Text", textPlaceholder: "Type here", find: "Find a name", use: (text) => `Use “${text}”`,
  none: "No name has these words.", more: "Type to find more names.",
};

/** The most names the sheet draws at once: the catalogue is a few hundred, and the first ones are the most used. */
export const MAX_NAMES = 60;

function frameOf(host, title, label, onDone) {
  addPhoneStyle();
  const root = make("div", "bfp-sheet", undefined, { role: "dialog", "aria-label": label });
  const head = make("div", "bfp-head");
  const done = make("button", "", WORDS.done, { type: "button", "data-bf": "done" });
  done.addEventListener("click", () => onDone());
  head.append(make("div", "bfp-title", title), done);
  root.append(head);
  host.append(root);
  ignoreGhostClick(root);
  return root;
}

export function openChoiceSheet(host, { title, options, current, onChoose, onDone }) {
  const root = frameOf(host, title, "Choose", onDone);
  const colours = options.some((o) => o.hex);
  const grid = make("div", colours ? "bfp-swatches" : "bfp-choices");
  for (const option of options) {
    const b = make("button", colours ? "bfp-swatch" : "bfp-choice", colours ? "" : option.label, {
      type: "button", "data-bf": `choice-${option.value}`, "aria-pressed": String(option.value === current), "aria-label": option.label, title: option.label,
    });
    if (option.hex) b.style.background = option.hex;
    b.addEventListener("click", () => onChoose(option.value));
    grid.append(b);
  }
  root.append(grid);
  return { root, close: () => root.remove() };
}

export function openNameSheet(host, { title, scope, current, onChoose, onUse, onDone }) {
  const root = frameOf(host, title, "Choose a name", onDone);
  const input = make("input", "bfp-text", undefined, {
    type: "search", "aria-label": WORDS.find, placeholder: WORDS.find, autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    enterkeyhint: "search", "data-bf": "search",
  });
  const list = make("div", "bfp-names", undefined, { role: "listbox", "aria-label": title });
  root.append(input, list);

  function draw() {
    const query = input.value.trim();
    list.replaceChildren();
    let shown = 0;
    let more = false;
    for (const group of searchScope(scope, query)) {
      if (group.title && shown < MAX_NAMES) list.append(make("div", "bfp-group", group.title));
      for (const entry of group.entries) {
        if (shown >= MAX_NAMES) { more = true; break; }
        shown += 1;
        const row = make("button", "bfp-name-row", undefined, {
          type: "button", role: "option", "data-bf": `name-${entry.name}`, "aria-selected": String(entry.name === current),
        });
        row.append(make("span", "bfp-name-word", entry.name.replace(/_/g, " ")), make("span", "bfp-name-plain", entry.plain || entry.summary || ""));
        row.addEventListener("click", () => onChoose(entry));
        list.append(row);
      }
    }
    if (!shown) list.append(make("div", "bfp-more", WORDS.none));
    else if (more) list.append(make("div", "bfp-more", WORDS.more));
    if (query && !scope.groups.some((g) => g.entries.some((e) => e.name === query))) {
      const use = make("button", "bfp-name-row", WORDS.use(query), { type: "button", "data-bf": "use-name" });
      use.addEventListener("click", () => onUse(query));
      list.append(use);
    }
  }

  input.addEventListener("input", draw);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); });
  draw();
  return { root, close: () => root.remove() };
}

export function openTextSheet(host, { title, value, multiline = false, onInput, onDone }) {
  const root = frameOf(host, title, WORDS.textLabel, onDone);
  const input = make(multiline ? "textarea" : "input", "bfp-text", undefined, {
    "aria-label": title, placeholder: WORDS.textPlaceholder, autocomplete: "off", autocapitalize: "off", spellcheck: "false", "data-bf": "text",
    ...(multiline ? { rows: "4" } : { type: "text", enterkeyhint: "done" }),
  });
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !multiline) onDone(); });
  root.append(input);
  input.focus({ preventScroll: true });
  return { root, close: () => root.remove() };
}
