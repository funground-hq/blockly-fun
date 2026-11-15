// The type rule (Funground_Calls_Note.md, section 4): what an object is, so a name list can offer its own methods.
//
// It is the rule of Play's text editor, applied to blocks:
//   - `f` is funground; a library's name (`sound`, `camera`, `ml`, `sangeet`) is that library;
//   - a variable is what its last assignment above held ("above" means earlier in the Python the blocks make);
//   - `X.name(...)` is what the catalogue says name gives back (`returns`);
//   - `for item in X`, where X is a list of some class (the catalogue's `element`), makes item that class;
//   - anything else is unknown (null). Never a guess.
// The "hint" step (a quoted annotation) is not built in blocks yet.
//
// Python code blocks are read as text with the same rule, so `body.nose.x` is understood too.

import * as Blockly from "blockly";
import { PREFIX } from "../blocks/table.js";

const T = (id) => PREFIX + id;
const VALUE_INPUT = Blockly.ConnectionType.INPUT_VALUE;

const IDENT_START = /[A-Za-z_]/;
const IDENT = /[A-Za-z_]\w*/y;

/** The index of the bracket closing the one at `open`, skipping strings; text.length if there is none. */
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\"" || ch === "'") i = endOfString(text, i);
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

function endOfString(text, start) {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return text.length;
}

export class TypeWalk {
  constructor(catalogue) {
    this.catalogue = catalogue;
    this.env = new Map();          // variable name -> type or null, as the walk goes
    this.sites = [];               // every place `OBJECT.name` is: {block, text, type}
    this.objects = new Map();      // call block id -> the type of its object
  }

  /** The type a bare name has: an assigned variable, else `f` or a library, else unknown. */
  nameType(name) {
    if (this.env.has(name)) return this.env.get(name);
    if (name === "f") return { kind: "f" };
    return this.catalogue.isLibrary(name) ? { kind: "library", name } : null;
  }

  /** The type of `type.name` (a call or a property). */
  step(type, name) {
    const entry = this.catalogue.member(type, name);
    return entry ? this.catalogue.typeOfEntry(entry) : null;
  }

  classOf(name) {
    return this.catalogue.classes.has(name) ? { kind: "class", name } : null;
  }

  // -- blocks ------------------------------------------------------------------------------------------------------

  /** Walks a stack of statements in the order the generator writes them. */
  chain(block) {
    for (let b = block; b; b = b.getNextBlock()) this.statement(b);
  }

  statement(b) {
    switch (b.type) {
      case T("set"): {
        const type = this.input(b, "VALUE");
        this.env.set(b.getFieldValue("VAR"), type);
        return;
      }
      case T("for_each"): {
        const list = this.input(b, "LIST");
        this.env.set(b.getFieldValue("VAR"), list?.kind === "list" ? this.classOf(list.of) : null);
        this.inputs(b, ["LIST"]);
        return;
      }
      case T("count"):
      case T("count_by"):
        this.inputs(b, []);
        this.env.set(b.getFieldValue("VAR"), null);
        return;
      case T("def"): {
        const params = b.getFieldValue("PARAMS").split(",").map((p) => p.trim()).filter(Boolean);
        const before = params.map((p) => [p, this.env.has(p), this.env.get(p)]);
        for (const p of params) this.env.set(p, null);
        this.inputs(b, []);
        for (const [p, had, type] of before) { if (had) this.env.set(p, type); else this.env.delete(p); }
        return;
      }
      case T("code"):
        this.code(b, b.getFieldValue("TEXT"));
        return;
      default:
        this.value(b);
    }
  }

  /** Walks every input of a block (value inputs and bodies) except the named ones, in the order drawn. */
  inputs(block, skip) {
    for (const input of block.inputList) {
      if (skip.includes(input.name) || !input.connection) continue;
      const child = input.connection.targetBlock();
      if (!child) continue;
      if (input.connection.type === VALUE_INPUT) this.value(child);
      else this.chain(child);
    }
  }

  /** The type of the block in a named input (null if empty). */
  input(block, name) {
    const child = block.getInputTargetBlock(name);
    return child ? this.value(child) : null;
  }

  /** The type of a value block, walking what is inside it. */
  value(b) {
    switch (b.type) {
      case T("variable"):
        return this.nameType(b.getFieldValue("VAR"));
      case T("method"):
      case T("method_value"): {
        const object = this.input(b, "OBJ");
        this.sites.push({ block: b, text: null, type: object });
        this.objects.set(b.id, object);
        this.inputs(b, ["OBJ"]);
        return this.step(object, b.getFieldValue("NAME"));
      }
      case T("code_value"):
        return this.scan(b, b.getFieldValue("TEXT")).whole;
      default:
        this.inputs(b, []);
        return null;
    }
  }

  // -- Python code, read as text -----------------------------------------------------------------------------------

  /** A Python code block: its lines, in order. A plain assignment or a for line changes what a name holds. */
  code(block, text) {
    for (const line of text.split("\n")) {
      const assign = /^\s*([A-Za-z_]\w*)\s*(?::[^=]*)?=(?!=)\s*(.*)$/.exec(line);
      const loop = /^\s*for\s+([A-Za-z_]\w*)\s+in\s+(.*):\s*$/.exec(line);
      const define = /^\s*def\s+\w+\s*\((.*)\)/.exec(line);
      if (assign) this.env.set(assign[1], this.scan(block, assign[2]).whole);
      else if (loop) {
        const list = this.scan(block, loop[2]).whole;
        this.env.set(loop[1], list?.kind === "list" ? this.classOf(list.of) : null);
      } else if (define) {
        for (const p of define[1].split(",")) this.env.set(p.split(/[:=]/)[0].trim().replace(/^\*+/, ""), null);
      } else this.scan(block, line);
    }
  }

  /**
   * Reads the chains `name.member(...).member` in a text, recording a site at every dot. `whole` is the type of the
   * text if all of it is one chain, else null.
   */
  scan(block, text) {
    let whole = null;
    const trimmed = text.trim();
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\"" || ch === "'") { i = endOfString(text, i) + 1; continue; }
      if (!IDENT_START.test(ch) || (i > 0 && /[\w.]/.test(text[i - 1]))) { i++; continue; }
      const start = i;
      IDENT.lastIndex = i;
      const first = IDENT.exec(text)[0];
      i += first.length;
      let type = this.nameType(first);
      let steps = 0;
      for (;;) {
        if (text[i] === "." && IDENT_START.test(text[i + 1] ?? "")) {
          this.sites.push({ block, text: text.slice(start, i), type });
          IDENT.lastIndex = i + 1;
          const name = IDENT.exec(text)[0];
          type = this.step(type, name);
          steps++;
          i += 1 + name.length;
        } else if (text[i] === "(" || text[i] === "[") {
          const end = closing(text, i);
          this.scan(block, text.slice(i + 1, end));
          if (text[i] === "[" || steps === 0) type = null;   // a subscript, or a call of a bare name
          i = end + 1;
        } else break;
      }
      if (text.slice(start, i) === trimmed) whole = type;
    }
    return { whole };
  }
}

/** Walks a whole workspace: {objects: Map of call block id to the type of its object, sites}. */
export function analyse(workspace, catalogue) {
  const walk = new TypeWalk(catalogue);
  for (const top of workspace.getTopBlocks(true)) walk.chain(top);
  return { objects: walk.objects, sites: walk.sites };
}

/** What an object block is without the whole program: only `f` and a library's bare name are known. */
export function staticType(block, catalogue) {
  const object = block.getInputTargetBlock("OBJ");
  if (!object || object.type !== T("variable")) return null;
  const name = object.getFieldValue("VAR");
  if (name === "f") return { kind: "f" };
  return catalogue.isLibrary(name) ? { kind: "library", name } : null;
}

const nextFrame = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 16));

/**
 * Keeps the types of a workspace's objects true. A change event only marks them stale; they are worked out again at
 * most once per animation frame, for the whole workspace (note, section 4), or at once if someone asks while stale.
 */
export class TypeTracker {
  constructor(workspace, catalogue, afterUpdate = () => {}) {
    this.workspace = workspace;
    this.catalogue = catalogue;
    this.afterUpdate = afterUpdate;
    this.objects = new Map();
    this.sites = [];
    this.stale = true;
    this.pending = false;
    this.updates = 0;
    this.listener = workspace.addChangeListener((event) => { if (!event.isUiEvent) this.schedule(); });
  }

  /** Marks the types stale and works them out in the next frame. */
  schedule() {
    this.stale = true;
    if (this.pending) return;
    this.pending = true;
    nextFrame(() => {
      this.pending = false;
      if (this.workspace.disposed || (this.workspace.isDisposed && this.workspace.isDisposed())) return;
      this.update();
      this.afterUpdate();
    });
  }

  /** Works out every object's type now. */
  update() {
    ({ objects: this.objects, sites: this.sites } = analyse(this.workspace, this.catalogue));
    this.stale = false;
    this.updates++;
  }

  /** The type of the object of a call block (null: unknown). */
  objectType(block) {
    if (this.stale) this.update();
    return this.peekObjectType(block);
  }

  /** The same from the last update, even if stale: for drawing, which must not walk the program. */
  peekObjectType(block) {
    return this.objects.has(block.id) ? this.objects.get(block.id) : staticType(block, this.catalogue);
  }

  dispose() {
    this.workspace.removeChangeListener(this.listener);
  }
}
