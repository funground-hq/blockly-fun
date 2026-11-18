// What the editor shows besides Blockly's own parts (BF-D-050, BF-D-051): the action bar and the search box. Both live in one
// element laid over the foot of the workspace, inside the editor's own container, so a host page has nothing to put in. On a
// phone the dock sits at the foot of the workspace, above the flyout (when one is open) and the row of kinds. In the wide
// layout only the search box shows, over the top of the flyout.
//
// The action bar is the mock-up's: the ink colour, one row, small light buttons. In Move mode it is always there (it says
// "Tap a block to pick it" until something is picked); in Add mode it shows only when a block is marked, to say where the
// next block goes. The sizes, colours and typeface are the mock-up's, from the page's custom properties when it has them.

import * as Blockly from "blockly";

const STYLE = `
.bf-dock { position: absolute; z-index: 75; box-sizing: border-box; pointer-events: none; font-family: var(--body, system-ui, sans-serif); }
.bf-dock > * { pointer-events: auto; }
.bf-dock[hidden] { display: none; }
.bf-bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: var(--ink, #191970); color: var(--paper, #fdf6e7); font-size: 12.5px; }
.bf-bar[hidden], .bf-find[hidden] { display: none; }
.bf-bar-text { flex: 1; min-width: 0; line-height: 1.3; }
.bf-bar-what { display: block; font-weight: 600; }
.bf-bar-hint { display: block; opacity: 0.85; }
.bf-bar-hint:empty { display: none; }
.bf-bar button { min-height: 30px; min-width: 40px; padding: 3px 9px; border-radius: 8px; border: 1.5px solid var(--paper, #fdf6e7); background: transparent;
  font: 600 12.5px var(--body, system-ui, sans-serif); color: var(--paper, #fdf6e7); touch-action: manipulation; cursor: pointer; }
.bf-bar button:focus-visible { outline: 3px solid var(--gold, #ffd700); outline-offset: 2px; }
.bf-bar button:disabled { opacity: 0.5; }
.bf-bar button[hidden] { display: none; }
.bf-find { display: flex; background: #fff; padding: 4px 6px; border-top: 1px solid #cbd2d9; }
.bf-find input { flex: 1; min-width: 0; box-sizing: border-box; height: 40px; padding: 0 10px; border: 1px solid #9aa5b1; border-radius: 8px;
  font: inherit; font-size: 16px; }
.bf-phone .bf-find { background: var(--panel, #fffaf0); padding: 8px 10px; border-top: 2px solid var(--ink, #191970); }
.bf-phone .bf-find input { height: auto; padding: 7px 10px; border: 1.5px solid var(--ink, #191970); background: var(--paper, #fdf6e7);
  color: var(--ink, #191970); font: 16px var(--body, system-ui, sans-serif); }   /* 16 px: a phone browser zooms in on a smaller one */
.injectionDiv .bf-picked > .blocklyPath { stroke: var(--gold, #ffd700); stroke-width: 4px; }
`;

let styled = false;

function addStyle() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const style = document.createElement("style");
  style.id = "bf-dock-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The words of the bar (plain, short; the learners are ten and up). */
export const WORDS = {
  many: (n) => `${n} blocks picked: drag them`,
  one: (n) => (n === 1 ? "1 block picked: drag it" : `${n} blocks picked: drag them`),
  justThis: "Tap again for just this one",
  theOnesBelow: "Tap again for the ones below",
  adding: "Tap a block in the list to add it under this one",
  none: "Tap a block to pick it",
  marked: "New blocks go under this block",
  chooseKind: "Choose a kind of block below",
  delete: "Delete",
  done: "Done",
  find: "Find a block",
};

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

export class Dock {
  /**
   * `phone` tells whether the bar is shown. `actions` are `delete()`, `done()` (the bar's buttons) and `search(text)`.
   */
  constructor(workspace, { phone, actions }) {
    addStyle();
    this.workspace = workspace;
    this.phone = phone;
    this.root = make("div", "bf-dock");
    this.root.hidden = true;
    this.message = "";
    this.mode = "move";               // what the bar says depends on the mode (modes.js); Move is what round 3 was
    this.finder = null;

    this.bar = make("div", "bf-bar");
    this.bar.hidden = true;
    this.bar.setAttribute("role", "region");
    this.bar.setAttribute("aria-label", "Blocks");
    const text = make("div", "bf-bar-text");
    this.what = make("span", "bf-bar-what");
    this.hint = make("span", "bf-bar-hint");
    this.hint.setAttribute("role", "status");
    text.append(this.what, this.hint);
    this.remove = make("button", "bf-delete");
    this.remove.append(make("span", "", "🗑 "), WORDS.delete);
    this.remove.firstChild.setAttribute("aria-hidden", "true");
    const done = make("button", "bf-done", WORDS.done);
    for (const b of [this.remove, done]) b.type = "button";
    this.remove.addEventListener("click", () => actions.delete());
    done.addEventListener("click", () => actions.done());
    this.bar.append(text, this.remove, done);

    this.find = make("div", "bf-find");
    this.find.hidden = true;
    this.input = make("input");
    this.input.type = "search";
    this.input.placeholder = WORDS.find;
    this.input.setAttribute("aria-label", WORDS.find);
    this.input.setAttribute("autocomplete", "off");
    this.input.setAttribute("autocapitalize", "off");
    this.input.setAttribute("spellcheck", "false");
    this.input.setAttribute("enterkeyhint", "search");
    this.input.addEventListener("input", () => actions.search(this.input.value));
    this.input.addEventListener("focus", () => this.holdFocus());
    this.input.addEventListener("blur", () => this.letFocusGo());
    this.find.append(this.input);

    this.root.append(...(phone ? [this.bar, this.find] : [this.find]));
    workspace.getInjectionDiv().appendChild(this.root);
  }

  /** Tells the dock the mode ("add" or "move" are the ones with a bar); the bar is drawn again by the next showPicked. */
  setMode(id) {
    this.mode = id;
    this.message = "";
  }

  /**
   * Shows what is picked (a Picker's info()). In Move mode the bar is always there; in Add mode it shows while a block is
   * marked; in the other modes there is none. `adding` is true while a flyout is open.
   */
  showPicked(info, adding = false) {
    if (!this.phone) return;
    const move = this.mode === "move";
    this.bar.hidden = !(info || move) || !(move || this.mode === "add");
    this.remove.hidden = !move;
    this.remove.disabled = !info;
    if (info) {
      if (move) this.what.textContent = info.single ? WORDS.one(info.count) : WORDS.many(info.count);
      else this.what.textContent = WORDS.marked;
      const turn = move && info.canTurn ? (info.single ? WORDS.theOnesBelow : WORDS.justThis) : "";
      this.hint.textContent = this.message || (adding ? WORDS.adding : turn || (move ? "" : WORDS.chooseKind));
    } else {
      this.message = "";
      this.what.textContent = WORDS.none;
      this.hint.textContent = "";
    }
    this.place();
  }

  /** A short answer in the bar's hint line (an add that could not be done). It lasts until the next change of what is picked. */
  say(message) {
    this.message = message;
    this.hint.textContent = message;
  }

  /** Shows or hides the search box, and takes the typing. */
  showFind(open) {
    const was = !this.find.hidden;
    this.find.hidden = !open;
    this.place();
    if (open && !was) this.input.focus({ preventScroll: true });
    if (!open && document.activeElement === this.input) this.input.blur();
  }

  /**
   * Blockly keeps the keyboard's focus on its own parts (its FocusManager): it gives the focus back to the toolbox after
   * a tap on it, and a toolbox that loses the focus closes its flyout. A box of the page's own holds the focus as Blockly's
   * dropdowns do, "ephemerally", for as long as it has it.
   */
  holdFocus() {
    const manager = Blockly.getFocusManager();
    if (this.release || manager.ephemeralFocusTaken()) return;
    this.release = manager.takeEphemeralFocus(this.input);
  }

  letFocusGo() {
    const release = this.release;
    this.release = null;
    release?.(false);                  // the focus goes where the learner put it, not back to the toolbox
  }

  /** How tall the dock is on the screen, in CSS px (0 when it is hidden). */
  height() {
    return this.root.hidden ? 0 : this.root.getBoundingClientRect().height;
  }

  /** Puts the dock where it belongs, from where the flyout and the row of kinds are now. */
  place() {
    const visible = !this.bar.hidden || !this.find.hidden;
    this.root.hidden = !visible;
    if (!visible) return;
    const inject = this.workspace.getInjectionDiv().getBoundingClientRect();
    const flyoutShown = this.workspace.getFlyout()?.isVisible();
    const flyout = flyoutShown ? this.workspace.getInjectionDiv().querySelector(".blocklyFlyout")?.getBoundingClientRect() : null;
    const style = this.root.style;
    if (this.phone) {
      const toolbox = this.workspace.getInjectionDiv().querySelector(".blocklyToolbox")?.getBoundingClientRect();
      const shown = toolbox && toolbox.height > 0;           // the kinds are hidden in Read and Values
      const edge = flyout ? flyout.top : shown ? toolbox.top : inject.bottom;
      Object.assign(style, { left: "0px", right: "0px", width: "", top: "auto", bottom: `${Math.max(0, inject.bottom - edge)}px` });
    } else {
      // over the top of the column of blocks
      Object.assign(style, {
        left: `${(flyout?.left ?? inject.left) - inject.left}px`, top: `${(flyout?.top ?? inject.top) - inject.top}px`,
        width: `${flyout?.width ?? 0}px`, right: "auto", bottom: "auto",
      });
    }
  }

  dispose() {
    this.letFocusGo();
    this.root.remove();
  }
}
