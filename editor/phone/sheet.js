// The slot sheet (BF-D-053, both spikes): a sheet from the bottom of the screen, opened by a tap on a value. It shows what the
// slot can take (slots.js says what) and tells the host at once about each choice, so the host can apply it and redraw (Auto-run).
// No Blockly in here: the host passes in data and callbacks, and spike B's rows use it as spike A's blocks do.
//
//   const sheet = openSheet(host, {
//     title: "size",                       // what is being changed, a few words
//     kind: "number",                      // "number", "expression" or "name" (slots.js)
//     value: 80, valueText: "80",          // the value now, and how to say it when it is not a number
//     range: {low: 0, high: 640, step: 1}, // the slider's range, when the catalogue knows one
//     variables: [{name, label, group}],   // the variables in scope (slots.js: variablesInScope)
//     recent: [60, 120],                   // the last few numbers used
//     on: {
//       number(n),                         // the number changed (slider, pad or a recent one)
//       variable(entry),                   // a variable was chosen
//       operator(op),                      // "+", "-", "*" or "/": the slot becomes [old] op [ ]; the host then calls update()
//       newName(text),                     // a name for a new variable: {ok: true} or {ok: false, message}
//       more(),                            // optional: "Other blocks" (the block list)
//       done(),                            // Done was tapped
//     },
//   });
//   sheet.update(next);                    // the sheet goes on to another slot (the empty side of an operator)
//   sheet.close();
//
// What opens the phone's keyboard: only the name of a new variable (an input box). Everything else is a button or the slider.

import { addPhoneStyle, ignoreGhostClick, make } from "./style.js";
import { offerFor, padPress, padValue, startPad } from "./slots.js";

export const WORDS = {
  done: "Done",
  newVariable: "New variable",
  more: "Other blocks",
  make: "Make",
  cancel: "Cancel",
  namePlaceholder: "Name, like speed",
  nameLabel: "Name of the new variable",
  variables: "Variables",
  recent: "Last used",
  none: "empty",
};

export function openSheet(host, initial) {
  addPhoneStyle();
  const root = make("div", "bfp-sheet", undefined, { role: "dialog", "aria-label": "Change a value" });
  host.append(root);
  ignoreGhostClick(root);
  let spec = initial;
  let pad = startPad(spec.value);
  let slider = null;
  let display = null;

  const button = (label, name, onTap, className = "") => {
    const b = make("button", className, label, { type: "button", "data-bf": name });
    b.addEventListener("click", onTap);
    return b;
  };

  const shown = () => (pad.text !== "" ? pad.text : spec.kind === "number" ? "0" : spec.valueText ?? WORDS.none);

  const sendNumber = (n) => {
    pad = { text: String(n), fresh: true };
    display.textContent = pad.text;
    spec.on.number(n);
  };

  function drawName() {
    root.replaceChildren(headRow());
    const row = make("div", "bfp-name");
    const input = make("input", "", undefined, {
      type: "text", placeholder: WORDS.namePlaceholder, "aria-label": WORDS.nameLabel, autocomplete: "off", autocapitalize: "off",
      spellcheck: "false", enterkeyhint: "done", "data-bf": "name",
    });
    const say = make("div", "bfp-say", "", { role: "status" });
    const make1 = () => {
      const answer = spec.on.newName(input.value);
      if (answer.ok) draw();
      else say.textContent = answer.message;
    };
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") make1(); });
    row.append(input, button(WORDS.make, "make", make1), button(WORDS.cancel, "cancel", () => draw()));
    root.append(row, say);
    input.focus({ preventScroll: true });
  }

  function headRow() {
    const head = make("div", "bfp-head");
    head.append(make("div", "bfp-title", spec.title), button(WORDS.done, "done", () => spec.on.done()));
    return head;
  }

  function draw() {
    const offer = offerFor({ kind: spec.kind, value: spec.value, range: spec.range, scope: spec.variables ?? [], recent: spec.recent ?? [] });
    root.replaceChildren(headRow());
    slider = null;
    display = null;

    if (offer.slider) {
      const { low, high, step } = offer.slider;
      slider = make("input", "bfp-slider", undefined, {
        type: "range", min: String(low), max: String(high), step: String(step), "aria-label": spec.title, "data-bf": "slider",
      });
      slider.value = String(Math.min(high, Math.max(low, Number(spec.value) || 0)));
      slider.addEventListener("input", () => sendNumber(Number(slider.value)));
      root.append(slider);
    }
    if (offer.pad) {
      display = make("div", "bfp-number", shown(), { "data-bf": "display", "aria-live": "polite" });
      const back = button("⌫", "back", () => press("back"), "bfp-back");
      back.setAttribute("aria-label", "Delete the last digit");
      const line = make("div", "bfp-display");
      line.append(display, back);
      root.append(line);
      const grid = make("div", "bfp-pad");
      const keys = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["-", "0", "."]];
      keys.forEach((row, r) => {
        for (const key of row) {
          grid.append(button(key === "-" ? "±" : key, `key-${key}`, () => press(key)));
        }
        const op = offer.operators[r];
        if (op) {
          const b = button(op.label, `op-${op.op}`, () => spec.on.operator(op.op), "bfp-op");
          b.setAttribute("aria-label", op.word);
          grid.append(b);
        } else grid.append(make("span"));
      });
      root.append(grid);
    }
    if (offer.recent.length) {
      const row = make("div", "bfp-row");
      row.append(make("p", "bfp-label", WORDS.recent));
      for (const n of offer.recent) row.append(button(String(n), `recent-${n}`, () => sendNumber(n), "bfp-chip"));
      root.append(row);
    }
    const row = make("div", "bfp-row");
    row.append(make("p", "bfp-label", WORDS.variables));
    for (const entry of offer.variables) {
      row.append(button(entry.label, `var-${entry.group}-${entry.name}`, () => spec.on.variable(entry), "bfp-chip"));
    }
    if (offer.newVariable) row.append(button(WORDS.newVariable, "new-variable", () => drawName(), "bfp-chip"));
    if (offer.pad && spec.on.more) row.append(button(WORDS.more, "more", () => spec.on.more(), "bfp-chip"));
    root.append(row);
  }

  function press(key) {
    pad = padPress(pad, key);
    display.textContent = shown();
    const n = padValue(pad.text);
    if (n === null) return;
    if (slider) slider.value = String(n);
    spec.on.number(n);
  }

  draw();
  return {
    root,
    /** Goes on to another slot (the host has changed what the sheet is about). */
    update(next) {
      spec = next;
      pad = startPad(spec.value);
      draw();
    },
    /** The value changed by the host (an undo, say): the sheet shows it. */
    showNumber(n) {
      pad = { text: String(n), fresh: true };
      if (display) display.textContent = pad.text;
      if (slider) slider.value = String(n);
    },
    close() {
      root.remove();
    },
  };
}
