// The bar at the foot (BF-D-053, both spikes): what can be done with the picked block (+ Below, Up, Down, In, Out, Copy, Delete,
// Wrap in...), or "+ Add a block" when nothing is picked, and the line's error message when it has one. It only draws: the host says
// what to show and what each button does. Every button is 44 px high at least (style.js).

import { addPhoneStyle, make } from "./style.js";

export const BAR_WORDS = {
  add: "+ Add a block",
  below: "+ Below",
  up: "↑ Up",
  down: "↓ Down",
  in: "→ In",
  out: "← Out",
  copy: "Copy",
  delete: "Delete",
  wrap: "Wrap in…",
  back: "Back",
};

export const WRAPPERS = [["repeat", "repeat"], ["count", "count"], ["if", "if"]];

export class ActionBar {
  constructor(frame) {
    addPhoneStyle();
    this.root = make("div", "bfp-bar", undefined, { role: "region", "aria-label": "Blocks" });
    this.error = make("div", "bfp-error", "", { role: "status" });
    this.info = make("div", "bfp-info", "", { role: "status" });
    this.grid = make("div", "bfp-grid");
    this.root.append(this.error, this.info, this.grid);
    frame.append(this.root);
  }

  /** How tall the bar is now, in px (0 when hidden). */
  get height() {
    return this.root.hidden ? 0 : this.root.offsetHeight;
  }

  /**
   * Draws the bar. `state`: {mode: "idle" | "picked" | "wrap", info, message, can}; `can` is what actionsFor says (picked only);
   * `message` is the picked line's error, if it has one. `on`: {add, below, up, down, in, out, copy, delete, wrap, wrapWith(type), back}.
   */
  show(state, on) {
    this.grid.replaceChildren();
    this.error.hidden = !state.message;
    this.error.textContent = state.message ?? "";
    this.info.textContent = state.info;
    const button = (label, name, onTap, enabled = true, wide = false) => {
      const b = make("button", wide ? "bfp-wide" : "", label, { type: "button", "data-bf": name });
      b.disabled = !enabled;
      b.addEventListener("click", onTap);
      this.grid.append(b);
    };
    if (state.mode === "idle") {
      button(BAR_WORDS.add, "add", on.add, true, true);
    } else if (state.mode === "wrap") {
      for (const [type, label] of WRAPPERS) button(label, `wrap-${type}`, () => on.wrapWith(type));
      button(BAR_WORDS.back, "wrap-back", on.back);
    } else {
      const can = state.can;
      button(BAR_WORDS.below, "below", on.below, can.below);
      button(BAR_WORDS.up, "up", on.up, can.up);
      button(BAR_WORDS.down, "down", on.down, can.down);
      button(BAR_WORDS.in, "in", on.in, can.in);
      button(BAR_WORDS.out, "out", on.out, can.out);
      button(BAR_WORDS.copy, "copy", on.copy, can.copy);
      button(BAR_WORDS.delete, "delete", on.delete, can.delete);
      button(BAR_WORDS.wrap, "wrap", on.wrap, can.wrap);
    }
  }

  dispose() {
    this.root.remove();
  }
}
