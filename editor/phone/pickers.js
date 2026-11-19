// The other sheets of spike B (BF-D-053): what a tap on a word, a choice or a colour opens. They are like the slot sheet (sheet.js): a
// sheet from the bottom of the screen, a title, Done. Plain data in, callbacks out; no Blockly in here.
//
//   openChoiceSheet(host, {title, options: [{value, label, hex?}], current, onChoose(value), onDone()})
//       a list of buttons (a dropdown's options, the words a slot takes), or a grid of colour squares when the options have a hex.
//       A tap on one is the choice, and the sheet closes.
//   openTextSheet(host, {title, value, multiline, onInput(text), onDone()})
//       the phone's keyboard: the only sheet with an input box. Each key is told to onInput at once, so the canvas follows.

import { addPhoneStyle, ignoreGhostClick, make } from "./style.js";

const WORDS = { done: "Done", textLabel: "Text", textPlaceholder: "Type here" };

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
