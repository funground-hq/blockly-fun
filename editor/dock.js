// The search box of the wide layout (BF-D-050): "Find a block" lies over the top of the flyout, in one element laid inside the editor's own
// container, so a host page has nothing to put in. The sizes, colours and typeface come from the page's custom properties when it has them.

import * as Blockly from "blockly";

const STYLE = `
.bf-dock { position: absolute; z-index: 75; box-sizing: border-box; pointer-events: none; font-family: var(--body, system-ui, sans-serif); }
.bf-dock > * { pointer-events: auto; }
.bf-dock[hidden] { display: none; }
.bf-find[hidden] { display: none; }
.bf-find { display: flex; background: #fff; padding: 4px 6px; border-top: 1px solid #cbd2d9; }
.bf-find input { flex: 1; min-width: 0; box-sizing: border-box; height: 40px; padding: 0 10px; border: 1px solid #9aa5b1; border-radius: 8px;
  font: inherit; font-size: 16px; }
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

/** The words of the box (plain, short; the learners are ten and up). */
export const WORDS = {
  find: "Find a block",
};

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

export class Dock {
  /** `actions.search(text)` hears each change of the text. */
  constructor(workspace, { actions }) {
    addStyle();
    this.workspace = workspace;
    this.root = make("div", "bf-dock");
    this.root.hidden = true;

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

    this.root.append(this.find);
    workspace.getInjectionDiv().appendChild(this.root);
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

  /** Puts the box over the top of the column of blocks, from where the flyout is now. */
  place() {
    this.root.hidden = this.find.hidden;
    if (this.root.hidden) return;
    const inject = this.workspace.getInjectionDiv().getBoundingClientRect();
    const flyoutShown = this.workspace.getFlyout()?.isVisible();
    const flyout = flyoutShown ? this.workspace.getInjectionDiv().querySelector(".blocklyFlyout")?.getBoundingClientRect() : null;
    Object.assign(this.root.style, {
      left: `${(flyout?.left ?? inject.left) - inject.left}px`, top: `${(flyout?.top ?? inject.top) - inject.top}px`,
      width: `${flyout?.width ?? 0}px`, right: "auto", bottom: "auto",
    });
  }

  dispose() {
    this.letFocusGo();
    this.root.remove();
  }
}
