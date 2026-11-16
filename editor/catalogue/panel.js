// The list under a name field (Funground_Calls_Note.md, section 5): rows, the highlight and the footer link.
//
// It knows nothing of Blockly: it takes a scope (catalogue.scope) and draws it into a document, so the tests can
// run it in jsdom. field.js puts it in Blockly's DropDownDiv.

import { searchScope } from "./search.js";

const MAX_ROWS = 300;
const STYLE_ID = "bf-catalogue-style";

const CSS = `
.bf-cat-panel { width: 340px; max-width: 90vw; font: 13px sans-serif; color: #222; background: #fff; }
.bf-cat-list { max-height: 300px; overflow-y: auto; }
.bf-cat-heading { padding: 4px 8px; font-weight: bold; font-size: 11px; text-transform: uppercase; color: #666; background: #f2f2f2; }
.bf-cat-note { padding: 6px 8px; color: #8a4b00; background: #fff4e0; }
.bf-cat-row { padding: 4px 8px; cursor: pointer; border-bottom: 1px solid #eee; }
.bf-cat-row.bf-cat-on, .bf-cat-row:hover { background: #dcecff; }
.bf-cat-name { font-weight: bold; }
.bf-cat-sig { font: 12px monospace; color: #555; margin-left: 6px; }
.bf-cat-kit { margin-left: 6px; padding: 0 5px; font-size: 11px; color: #1b5e20; background: #e3f2e1; border-radius: 8px; }
.bf-cat-plain { color: #444; }
.bf-cat-empty { padding: 8px; color: #666; }
.bf-cat-footer { padding: 6px 8px; border-top: 1px solid #ddd; min-height: 1em; }
@media (pointer: coarse) { .bf-cat-row { min-height: 44px; box-sizing: border-box; } .bf-cat-footer a { display: inline-block; min-height: 44px; line-height: 44px; } }
`;

function injectStyle(document) {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export class NamePanel {
  /**
   * @param document   the page's document
   * @param catalogue  the Catalogue (for reference links)
   * @param scope      catalogue.scope(type): what the list offers
   * @param name       the name now in the field (its row is the one the footer links to)
   * @param kitOf      entry => the kit block of that name, or null: a row with one says "has its own block"
   * @param onChoose   called with the entry a row stands for
   */
  constructor({ document, catalogue, scope, name = "", kitOf = () => null, onChoose }) {
    this.document = document;
    this.catalogue = catalogue;
    this.scope = scope;
    this.name = name;
    this.kitOf = kitOf;
    this.onChoose = onChoose;
    this.query = "";
    this.rows = [];
    this.index = -1;
    injectStyle(document);
    this.element = document.createElement("div");
    this.element.className = "bf-cat-panel";
    this.list = document.createElement("div");
    this.list.className = "bf-cat-list";
    this.footer = document.createElement("div");
    this.footer.className = "bf-cat-footer";
    this.element.append(this.list, this.footer);
    // a click must not take the typing away from the text box
    this.element.addEventListener("mousedown", (event) => event.preventDefault());
    this.render();
  }

  /** The text in the box changed: draw the matches again. The highlight starts from nothing. */
  setQuery(query) {
    this.query = query;
    this.render();
  }

  render() {
    const doc = this.document;
    const groups = searchScope(this.scope, this.query);
    this.list.replaceChildren();
    this.rows = [];
    this.index = -1;
    if (!this.scope.known) {
      const note = doc.createElement("div");
      note.className = "bf-cat-note";
      note.textContent = "funground doesn't know what this is yet";
      this.list.appendChild(note);
    }
    for (const group of groups) {
      if (group.title && this.rows.length < MAX_ROWS) {
        const heading = doc.createElement("div");
        heading.className = "bf-cat-heading";
        heading.textContent = group.title;
        this.list.appendChild(heading);
      }
      for (const entry of group.entries) {
        if (this.rows.length >= MAX_ROWS) break;
        this.rows.push({ entry, element: this.row(entry) });
      }
    }
    if (!this.rows.length && this.scope.known) {
      const empty = doc.createElement("div");
      empty.className = "bf-cat-empty";
      empty.textContent = "No match. The name you typed is used as it is.";
      this.list.appendChild(empty);
    }
    this.showFooter();
  }

  row(entry) {
    const doc = this.document;
    const row = doc.createElement("div");
    row.className = "bf-cat-row";
    row.setAttribute("role", "option");
    const name = doc.createElement("span");
    name.className = "bf-cat-name";
    name.textContent = entry.name.replace(/_/g, " ");
    const signature = doc.createElement("span");
    signature.className = "bf-cat-sig";
    signature.textContent = entry.signature;
    const plain = doc.createElement("div");
    plain.className = "bf-cat-plain";
    plain.textContent = entry.plain;
    row.append(name, signature);
    if (this.kitOf(entry)) {
      const kit = doc.createElement("span");
      kit.className = "bf-cat-kit";
      kit.textContent = "has its own block";
      row.append(kit);
    }
    row.append(plain);
    row.addEventListener("click", () => this.onChoose(entry));
    row.addEventListener("mouseenter", () => this.highlight(this.rows.findIndex((r) => r.element === row)));
    this.list.appendChild(row);
    return row;
  }

  /** The entry now highlighted, or null. */
  get highlighted() {
    return this.rows[this.index]?.entry ?? null;
  }

  highlight(index) {
    this.rows[this.index]?.element.classList.remove("bf-cat-on");
    this.index = index;
    const row = this.rows[index];
    if (row) {
      row.element.classList.add("bf-cat-on");
      if (row.element.scrollIntoView) row.element.scrollIntoView({ block: "nearest" });
    }
    this.showFooter();
  }

  /** Up (-1) and down (+1), stopping at the ends. */
  move(delta) {
    if (!this.rows.length) return;
    const next = this.index < 0 ? (delta > 0 ? 0 : this.rows.length - 1) : this.index + delta;
    this.highlight(Math.max(0, Math.min(this.rows.length - 1, next)));
  }

  /** The row whose name is exactly this text, if the list has one (the text typed is the name of an entry). */
  exact(text) {
    return this.rows.find((r) => r.entry.name === text)?.entry ?? null;
  }

  /** The footer: a link to the reference entry of the highlighted row (or of the name now in the field). */
  showFooter() {
    this.footer.replaceChildren();
    const entry = this.highlighted ?? this.exact(this.name);
    const url = this.catalogue.helpUrl(entry);
    if (!url) return;
    const link = this.document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `Open the reference for ${entry.name.replace(/_/g, " ")}`;
    this.footer.appendChild(link);
  }
}
