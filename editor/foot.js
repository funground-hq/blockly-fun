// The foot of the blocks on a phone (BF-D-051): one row with the mode, zoom out, zoom in and Reset, as in mock-up v4. It
// replaces Blockly's own zoom buttons and bin, which sat over the blocks. Next to it, a small hint at the top right says what
// a drag or a tap does in this mode.
//
// The mode button names the mode (an icon and a word) and opens a list of the four, each with a line of what it does. The list
// is a menu in the sense of the page's accessibility rules: the button says it has a menu and whether it is open
// (aria-haspopup, aria-expanded), the items are radios (menuitemradio, aria-checked), the arrow keys move between them, Escape
// closes it and gives the focus back to the button.
//
// The sizes, colours and spacing are the mock-up's. Colours and the typeface come from the page's custom properties (--ink,
// --paper, --panel, --rail, --line, --muted, --gold, --body), with the mock-up's values when a page has none.

import { MODES } from "./modes.js";

const STYLE = `
.bf-frame { display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; }
.bf-stage { flex: 1 1 auto; min-height: 0; position: relative; }
.bf-foot { flex: none; position: relative; display: flex; gap: 6px; align-items: center; padding: 6px 8px; box-sizing: border-box;
  border-top: 2px solid var(--ink, #191970); background: var(--panel, #fffaf0); color: var(--ink, #191970);
  font-family: var(--body, system-ui, sans-serif); }
.bf-keyboard .bf-foot { display: none; }
.bf-foot button { cursor: pointer; touch-action: manipulation; }
.bf-foot button:focus-visible { outline: 3px solid var(--gold, #ffd700); outline-offset: 2px; }
.bf-grow { flex: 1; }
.bf-modebtn { font: 700 13px var(--body, system-ui, sans-serif); min-height: 40px; padding: 0 12px; border: 1.5px solid var(--ink, #191970);
  border-radius: 20px; background: var(--ink, #191970); color: var(--paper, #fdf6e7); display: inline-flex; gap: 6px; align-items: center; }
.bf-zbtn { width: 40px; height: 40px; padding: 0; border: 1.5px solid var(--ink, #191970); border-radius: 8px; background: transparent;
  color: var(--ink, #191970); font: 700 17px var(--body, system-ui, sans-serif); }
.bf-zbtn.bf-wide { width: auto; padding: 0 10px; font-size: 13px; }
.bf-modemenu { position: absolute; left: 8px; bottom: calc(100% + 6px); width: 270px; max-width: calc(100% - 16px); box-sizing: border-box;
  background: var(--panel, #fffaf0); border: 1.5px solid var(--ink, #191970); border-radius: 12px; box-shadow: 0 -8px 22px var(--shadow, rgba(0, 0, 0, 0.18));
  padding: 6px; display: grid; gap: 2px; z-index: 200; }
.bf-modemenu[hidden] { display: none; }
.bf-modemenu button { display: grid; grid-template-columns: 28px 1fr; gap: 2px 8px; text-align: left; padding: 8px; border: 0; border-radius: 8px;
  background: none; color: var(--ink, #191970); min-height: 48px; font-family: inherit; }
.bf-modemenu button[aria-checked="true"] { background: var(--rail, #efe6d2); }
.bf-modemenu .bf-icon { grid-row: span 2; font-size: 18px; align-self: center; text-align: center; }
.bf-modemenu b { font: 700 13.5px var(--body, system-ui, sans-serif); }
.bf-modemenu small { font-size: 12px; color: var(--muted, #5a5f84); }
.bf-hint { position: absolute; right: 10px; top: 8px; z-index: 75; font: 600 11.5px var(--body, system-ui, sans-serif); background: var(--panel, #fffaf0);
  border: 1.5px solid var(--line, #d8cdb5); border-radius: 12px; padding: 2px 8px; color: var(--muted, #5a5f84); pointer-events: none; }
`;

let styled = false;

/** Puts the style on the page, once. Shared by the foot, the frame and the keyboard rule. */
export function addFootStyle() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const style = document.createElement("style");
  style.id = "bf-foot-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

export const WORDS = {
  menu: "Mode",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  reset: "Reset",
};

const make = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

export class FootBar {
  /**
   * `frame` holds the blocks' stage and, last, this bar. `stage` is where the hint goes. `actions` are `mode(id)`, `zoom(+1 | -1)`
   * and `reset()`.
   */
  constructor(frame, stage, actions) {
    addFootStyle();
    this.actions = actions;
    this.root = make("div", "bf-foot");

    this.button = make("button", "bf-modebtn");
    this.button.type = "button";
    this.button.setAttribute("aria-haspopup", "menu");
    this.button.setAttribute("aria-expanded", "false");
    this.label = make("span");
    this.button.append(this.label, make("span", "", "▾"));
    this.button.addEventListener("click", () => this.toggle());

    const button = (className, label, text, act) => {
      const b = make("button", className, text);
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.addEventListener("click", act);
      return b;
    };
    this.out = button("bf-zbtn", WORDS.zoomOut, "−", () => actions.zoom(-1));
    this.in = button("bf-zbtn", WORDS.zoomIn, "+", () => actions.zoom(1));
    this.reset = button("bf-zbtn bf-wide", WORDS.reset, WORDS.reset, () => actions.reset());
    this.reset.removeAttribute("aria-label");          // its own text names it

    this.menu = make("div", "bf-modemenu");
    this.menu.hidden = true;
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", WORDS.menu);
    this.items = MODES.map((mode) => {
      const item = make("button");
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", "false");
      item.tabIndex = -1;
      item.dataset.mode = mode.id;
      item.append(make("span", "bf-icon", mode.icon), make("b", "", mode.name), make("small", "", mode.about));
      item.addEventListener("click", () => {
        this.close();
        actions.mode(mode.id);
      });
      return item;
    });
    this.menu.append(...this.items);
    this.menu.addEventListener("keydown", (event) => this.key(event));
    // a touch anywhere but on the list or the button (which opens and closes it) closes the list, whatever it lands on
    this.outside = (event) => {
      if (!this.menu.contains(event.target) && !this.button.contains(event.target)) this.close(false);
    };

    this.root.append(this.button, make("span", "bf-grow"), this.out, this.in, this.reset, this.menu);
    frame.append(this.root);

    this.hint = make("div", "bf-hint");
    stage.append(this.hint);
  }

  /** Shows which mode it is: on the button, in the list, and in the hint. */
  show(mode) {
    this.label.textContent = `${mode.icon} ${mode.name}`;
    this.hint.textContent = mode.hint;
    for (const item of this.items) item.setAttribute("aria-checked", String(item.dataset.mode === mode.id));
  }

  get isOpen() {
    return !this.menu.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.menu.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", this.outside, true);
    (this.items.find((i) => i.getAttribute("aria-checked") === "true") ?? this.items[0]).focus();
  }

  /** Closes the list. The focus goes back to the button unless the learner touched something else (`refocus` false). */
  close(refocus = true) {
    if (!this.isOpen) return;
    this.menu.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.outside, true);
    if (refocus) this.button.focus();
  }

  key(event) {
    const at = this.items.indexOf(document.activeElement);
    const go = (i) => { this.items[(i + this.items.length) % this.items.length].focus(); event.preventDefault(); };
    if (event.key === "Escape") { this.close(); event.preventDefault(); event.stopPropagation(); }
    else if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(this.items.length - 1);
    else if (event.key === "Tab") this.close(false);
  }

  dispose() {
    document.removeEventListener("pointerdown", this.outside, true);
    this.root.remove();
    this.hint.remove();
  }
}
