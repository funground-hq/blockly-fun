// What the editor shows besides Blockly's own parts (BF-D-050): the action bar that tells what is picked, and the search
// box. Both live in one element laid over the foot of the workspace, inside the editor's own container, so a host page has
// nothing to put in. On a phone the dock sits at the foot of the workspace, above the flyout (when one is open) and the row
// of kinds. In the wide layout only the search box shows, over the top of the flyout.

import * as Blockly from "blockly";

const STYLE = `
.bf-dock { position: absolute; z-index: 75; box-sizing: border-box; pointer-events: none; font-family: system-ui, sans-serif; }
.bf-dock > * { pointer-events: auto; }
.bf-dock[hidden] { display: none; }
.bf-bar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #fffbe6; border-top: 3px solid #ffd700;
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.2); color: #1f2933; }
.bf-bar[hidden], .bf-find[hidden] { display: none; }
.bf-bar-text { flex: 1; min-width: 0; line-height: 1.25; }
.bf-bar-what { display: block; font-size: 15px; font-weight: 600; }
.bf-bar-hint { display: block; font-size: 13px; color: #52606d; }
.bf-bar button { min-height: 44px; min-width: 44px; padding: 0 14px; border-radius: 8px; border: 1px solid #9aa5b1; background: #fff;
  font: inherit; font-size: 15px; color: #1f2933; touch-action: manipulation; }
.bf-bar button.bf-delete { border-color: #c0392b; color: #a12315; }
.bf-bar button.bf-done { background: #ffd700; border-color: #c9a800; font-weight: 600; }
.bf-find { display: flex; background: #fff; padding: 4px 6px; border-top: 1px solid #cbd2d9; }
.bf-find input { flex: 1; min-width: 0; box-sizing: border-box; height: 40px; padding: 0 10px; border: 1px solid #9aa5b1; border-radius: 8px;
  font: inherit; font-size: 16px; }
.injectionDiv .bf-picked > .blocklyPath { stroke: #ffd700; stroke-width: 4px; }
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
    this.finder = null;

    this.bar = make("div", "bf-bar");
    this.bar.hidden = true;
    this.bar.setAttribute("role", "region");
    this.bar.setAttribute("aria-label", "Picked blocks");
    const text = make("div", "bf-bar-text");
    this.what = make("span", "bf-bar-what");
    this.hint = make("span", "bf-bar-hint");
    this.hint.setAttribute("role", "status");
    text.append(this.what, this.hint);
    const remove = make("button", "bf-delete", WORDS.delete);
    const done = make("button", "bf-done", WORDS.done);
    for (const b of [remove, done]) b.type = "button";
    remove.addEventListener("click", () => actions.delete());
    done.addEventListener("click", () => actions.done());
    this.bar.append(text, remove, done);

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

  /** Shows what is picked (a Picker's info()), or hides the bar when nothing is. `adding` is true while a flyout is open. */
  showPicked(info, adding = false) {
    if (!this.phone) return;
    this.bar.hidden = !info;
    if (info) {
      this.what.textContent = info.single ? WORDS.one(info.count) : WORDS.many(info.count);
      this.hint.textContent = this.message || (adding ? WORDS.adding : info.canTurn ? (info.single ? WORDS.theOnesBelow : WORDS.justThis) : "");
    } else {
      this.message = "";
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
      const edge = flyout ? flyout.top : toolbox ? toolbox.top : inject.bottom;
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
