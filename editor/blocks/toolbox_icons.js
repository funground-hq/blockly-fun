// The toolbox as a column of icons (BF-D-041), or on a phone a row of them (BF-15, BF-D-049). Each category shows one small picture in its own colour; its name is the
// tooltip (title) and the accessible name (aria-label). There is no text label.
//
// How: a subclass of Blockly's own ToolboxCategory, registered in its place (the supported way to customise a category,
// Blockly.registry TOOLBOX_ITEM). The subclass changes only what the row draws, so opening the flyout on a click and the
// toolbox's keyboard navigation (arrows, Enter) stay Blockly's. The other route, cssConfig and CSS, can add a class to the
// icon but cannot put an SVG or an aria-label in, so it would still need code.

import * as Blockly from "blockly";

const NS = "http://www.w3.org/2000/svg";

// The paths of the icons, on a 24 by 24 grid, drawn with a round 2.2 px line (from the design mock-up, BF-10).
export const ICONS = {
  bubble: '<path d="M4 5h16v10H9l-5 4z"/>',
  dot: '<circle cx="12" cy="12" r="5"/>',
  box: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 12h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eq: '<path d="M5 9h14M5 15h14"/>',
  loop: '<path d="M17 7a7 7 0 1 0 2 5"/><path d="M19 3v4h-4"/>',
  list: '<path d="M8 7h11M8 12h11M8 17h11M4 7h.5M4 12h.5M4 17h.5"/>',
  puzzle: '<path d="M5 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v3H5z"/>',
  shape: '<circle cx="9" cy="10" r="5"/><rect x="11" y="11" width="9" height="9" rx="1"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  bolt: '<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>',
  note: '<path d="M9 17V5l10-2v12"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="15" r="2"/>',
  cam: '<rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l2-3h4l2 3"/>',
  call: '<path d="M6 12h9M12 8l4 4-4 4"/><path d="M18 5v14"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>',
};

/** The svg element of an icon; it draws in the text colour of its parent (currentColor). */
export function iconSvg(name, doc = document) {
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "26");
  svg.setAttribute("height", "26");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name];
  return svg;
}

export class IconCategory extends Blockly.ToolboxCategory {
  createIconDom_() {
    const span = document.createElement("span");
    span.className = "bf-kit-icon";
    span.style.setProperty("--bf-kit", this.toolboxItemDef_.colour);
    span.appendChild(iconSvg(this.toolboxItemDef_.icon));
    return span;
  }

  // no text: the name goes on the row as its accessible name and its tooltip
  createLabelDom_() {
    const span = document.createElement("span");
    span.hidden = true;
    return span;
  }

  createDom_() {
    const div = super.createDom_();
    div.removeAttribute("aria-labelledby");
    div.setAttribute("aria-label", this.getName());
    div.title = this.getName();
    this.rowDiv_.title = this.getName();
    return div;
  }

  // the colour is the icon's, not a strip beside it
  addColourBorder_() {}
}

// Blockly's names: the container holds a row (blocklyToolboxCategory) that holds the icon.
const CSS = `
.injectionDiv:not(.bf-phone) .blocklyToolbox { width: 46px; }
.injectionDiv .blocklyToolboxCategory { display: flex; align-items: center; justify-content: center; height: 40px; margin: 0; padding: 0; }
.injectionDiv .blocklyTreeRowContentContainer { display: flex; }
.injectionDiv .bf-kit-icon { display: flex; color: var(--bf-kit); }
.injectionDiv .blocklyToolboxSelected .bf-kit-icon { color: #fff; }
/* The phone layout (BF-15, BF-D-051): one row along the bottom, as the mock-up's .kinds. Each kind is a 44 by 40 px outlined
   button on the rail colour (the page's --rail, --ink, --panel; the mock-up's values when it has none); the chosen one is green.
   The row scrolls sideways by touch, and the half button at its edge shows that there are more. */
.injectionDiv.bf-phone .blocklyToolbox { overflow-x: auto; overflow-y: hidden; touch-action: pan-x; scrollbar-width: none; box-sizing: border-box;
  padding: 6px; background: var(--rail, #efe6d2); border-top: 1.5px solid var(--ink, #191970); }
.injectionDiv.bf-phone .blocklyToolbox::-webkit-scrollbar { display: none; }
.injectionDiv.bf-phone .blocklyScrollbarVertical, .injectionDiv.bf-phone .blocklyScrollbarHorizontal { pointer-events: none; }
.injectionDiv.bf-phone .blocklyScrollbarHandle { fill: var(--muted, #6b6b8a); opacity: .3; }
.injectionDiv.bf-phone .blocklyScrollbarBackground { fill: none; }
.injectionDiv.bf-phone .blocklyToolboxCategoryGroup { flex-wrap: nowrap; gap: 4px; }
.injectionDiv.bf-phone .blocklyToolboxCategoryContainer { flex: none; margin: 0; }
.injectionDiv.bf-phone .blocklyToolboxCategory { width: 44px; height: 40px; box-sizing: border-box; border: 1.5px solid var(--ink, #191970);
  border-radius: 8px; background-color: var(--panel, #fffaf0); }
.injectionDiv.bf-phone .bf-kit-icon { color: var(--ink, #191970); }
.injectionDiv.bf-phone .blocklyToolboxSelected { background-color: var(--block-shape, #0fbd8c) !important; }
.injectionDiv.bf-phone .blocklyToolboxSelected .bf-kit-icon { color: #fff; }
`;

let done = false;

/** Puts the icon category in place of Blockly's (once), and its style on the page. */
export function registerIconToolbox() {
  if (!done) {
    Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.ToolboxCategory.registrationName, IconCategory, true);
    done = true;
  }
  if (typeof document === "undefined" || document.getElementById("bf-toolbox-style")) return;
  const style = document.createElement("style");
  style.id = "bf-toolbox-style";
  style.textContent = CSS;
  document.head.appendChild(style);
}
