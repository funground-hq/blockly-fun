// Spike A of BF-D-053, the "phone-a" layout: Blockly, held in a list. Blockly still draws the blocks, but as one column that the
// page scrolls up and down (the browser scrolls, not Blockly), with no free dragging and no modes:
//
//   - a tap on a block picks it (a gold line) and the bar at the foot offers what can be done with it: add below, up, down, in, out,
//     copy, delete, wrap. A tap on the picked block puts it down;
//   - a tap on a value opens the slot sheet (phone/sheet.js): a slider and a number pad for a number, the variables, + - x /, "new
//     variable". Text, colours and choices keep their own editors (the keyboard opens for text only);
//   - a tap on an empty C, or "Add below", opens the block list (phone/blocklist.js); the block chosen goes there;
//   - a block that is too wide for the screen puts its inputs on lines of their own, and what is still too wide is drawn smaller.
//
// Blocks move by their connections (taken out of the stack with the gap closed, then connected): one statement a step. Blockly's KeyboardMover was
// looked at and left: it is a move session with arrows and a preview, and a button here is one step.
// Every change is part of an event group, so one tap on Undo takes back one action (a sheet session is one action).

import * as Blockly from "blockly";
import { BY_TYPE } from "./blocks/table.js";
import { toolboxBlock, typeOf, FieldName } from "./blocks/register.js";
import { generator } from "./generator/python.js";
import { numberEditor, slotParam } from "./editors/slots.js";
import { belowOf, endOf, endOfSketch } from "./add.js";
import { labelOf, openBlockList, rowsFor } from "./phone/blocklist.js";
import { keepAboveKeyboard } from "./keyboard.js";
import { openSheet } from "./phone/sheet.js";
import { Recent, variablesInScope, wrapInOperator } from "./phone/slots.js";
import { addVariable, checkName, moduleNames, topStacks } from "./phone/variables.js";
import { addPhoneStyle, make } from "./phone/style.js";

export const HELD_SCALE = 0.9;       // the blocks' size when they fit; 16 px text at 1, so 14 px here
export const MIN_SCALE = 0.5;        // the smallest a long block is drawn (8 px text)
const PAD = 8;                       // px between the blocks and the screen's edge

export const WORDS = {
  idle: "Tap a block to pick it. Tap a value to change it.",
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
  first: "This is the first line.",
  last: "This is the last line.",
  noRoom: "The block above has no room inside.",
  notInside: "It is not inside another block.",
  cannot: "That block cannot go there.",
  newVariable: "New variable",
};

const WRAPPERS = [["repeat", "repeat"], ["count", "count"], ["if", "if"]];

const STYLE = `
.bfh-frame { position: relative; box-sizing: border-box; width: 100%; height: 100%; overflow: hidden; }
.bfh-scroll { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; touch-action: pan-y; overscroll-behavior: contain; }
.bfh-stage { position: relative; width: 100%; overflow: hidden; }
.bfh-stage .injectionDiv, .bfh-stage .blocklySvg, .bfh-stage .blocklyMainBackground { touch-action: pan-y !important; }
.bfh-stage .blocklyScrollbarVertical, .bfh-stage .blocklyScrollbarHorizontal { display: none; }
.bfh-stage .bf-picked > .blocklyPath { stroke: var(--gold, #ffd700); stroke-width: 4px; }
.bfh-stage .bfh-error > .blocklyPath { stroke: #d32f2f; stroke-width: 4px; stroke-dasharray: 7 4; }
`;

let styled = false;

function addHeldStyle() {
  addPhoneStyle();
  if (styled || typeof document === "undefined") return;
  styled = true;
  const style = document.createElement("style");
  style.id = "bf-held-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The page parts of the layout: a frame that holds a scroller, and in it the stage Blockly is drawn in. */
export function makeHeldFrame(element) {
  addHeldStyle();
  const frame = make("div", "bfh-frame");
  const scroller = make("div", "bfh-scroll");
  const stage = make("div", "bfh-stage");
  scroller.append(stage);
  frame.append(scroller);
  element.append(frame);
  return { frame, scroller, stage };
}

/** A block cannot be dragged: a touch on it is a tap, or a scroll of the page. */
class NoDrag extends Blockly.dragging.BlockDragStrategy {
  isMovable() {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Which line is which block (for the error line)

/** The first non-blank line of each block's code, in program order, found in the program's lines: the 1-based line of each. */
export function matchLines(lines, firsts) {
  const out = [];
  let cursor = 0;
  for (const first of firsts) {
    let found = -1;
    for (let i = cursor; i < lines.length && first; i += 1) {
      if (lines[i].trim() === first) { found = i; break; }
    }
    if (found >= 0) cursor = found + 1;
    out.push(found + 1);          // 0 when not found
  }
  return out;
}

/** The statements of a stack in program order, the blocks inside a C after the C's own line. */
function inOrder(first, out = []) {
  for (let b = first; b; b = b.getNextBlock()) {
    out.push(b);
    for (const input of b.inputList) {
      if (input.type === Blockly.inputs.inputTypes.STATEMENT && input.connection?.targetBlock()) inOrder(input.connection.targetBlock(), out);
    }
  }
  return out;
}

/** The block of each line of the program: `[{block, line}]` for every statement whose line could be found. */
export function blockLines(workspace) {
  const text = generator.workspaceToCode(workspace);
  const tops = topStacks(workspace).map((t) => t.block);
  const blocks = tops.flatMap((top) => inOrder(top));
  const firsts = blocks.map((block) => {
    try {
      return (generator.blockToCode(block, true) ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    } catch (error) {
      return "";
    }
  });
  const lines = matchLines(text.split("\n"), firsts);
  return blocks.map((block, i) => ({ block, line: lines[i] })).filter((b) => b.line > 0);
}

// ---------------------------------------------------------------------------------------------------------------
// The field tap: a tap on a number or a variable opens the sheet, not Blockly's own editor

let hooked = false;

/** Blockly's gesture calls the field's own editor; for a workspace of this layout the sheet gets the first look (it says if it took it). */
function hookFieldTaps() {
  if (hooked) return;
  hooked = true;
  const original = Blockly.Gesture.prototype.doFieldClick;
  Blockly.Gesture.prototype.doFieldClick = function doFieldClick() {
    const field = this.startField;
    const tools = field?.getSourceBlock?.()?.workspace?.bfHeld;
    if (tools?.fieldTapped(field)) return;
    original.call(this);
  };
}

// ---------------------------------------------------------------------------------------------------------------

const STATEMENT = Blockly.inputs.inputTypes.STATEMENT;
const VALUE = Blockly.inputs.inputTypes.VALUE;

/** What stands above a statement: its sibling (the block it hangs under), its parent (the block whose C it is first in), or nothing. */
function above(block) {
  const c = block.previousConnection?.targetConnection;
  if (!c) return { kind: "none" };
  const owner = c.getSourceBlock();
  return owner.nextConnection === c ? { kind: "sibling", block: owner } : { kind: "parent", block: owner };
}

const firstBody = (block) => block.inputList.find((i) => i.type === STATEMENT && i.connection)?.connection ?? null;

/** What can be done with a picked statement now (the bar greys the rest). */
export function actionsFor(block) {
  const a = above(block);
  const next = block.getNextBlock();
  return {
    below: true,
    up: a.kind === "sibling" || (a.kind === "parent" && !!a.block.previousConnection),
    down: (!!next && !!next.nextConnection) || (!next && !!block.getSurroundParent()?.nextConnection),
    in: a.kind === "sibling" && !!firstBody(a.block),
    out: !!block.getSurroundParent()?.nextConnection,
    copy: !!block.nextConnection && !!block.previousConnection,
    delete: true,
    wrap: !!block.previousConnection,
  };
}

/**
 * Makes `workspace` a held list. `frame`, `scroller` and `stage` are makeHeldFrame's; `catalogue` is the catalogue index or null.
 * Gives `{pick, picked, fit, markError, clearErrors, dispose, ...}`.
 */
export function attachHeld(workspace, { frame, scroller, stage, catalogue = null, column }) {
  hookFieldTaps();
  const recent = new Recent();
  const errors = new Map();          // block id -> message
  let picked = null;
  let sheet = null;
  let target = null;                 // the value block the sheet is about
  let startValue = null;
  let list = null;
  let notice = "";
  let wrapping = false;
  let down = { x: 0, y: 0 };
  let fitting = null;
  let disposed = false;

  const tools = {};
  workspace.bfHeld = tools;

  // -- the pieces of page ------------------------------------------------------------------------------------------

  const bar = make("div", "bfp-bar", undefined, { role: "region", "aria-label": "Blocks" });
  const error = make("div", "bfp-error", "", { role: "status" });
  const info = make("div", "bfp-info", "", { role: "status" });
  const grid = make("div", "bfp-grid");
  bar.append(error, info, grid);
  frame.append(bar);

  const run = (fn) => {
    const outer = Blockly.Events.getGroup();
    if (!outer) Blockly.Events.setGroup(true);
    try {
      return fn();
    } finally {
      if (!outer) Blockly.Events.setGroup(false);
    }
  };

  // -- fitting: the page's height, and what is too wide ---------------------------------------------------------------

  const cover = () => Math.max(bar.hidden ? 0 : bar.offsetHeight, sheet ? sheet.root.offsetHeight : 0) + 12;

  /** How wide a block is on its own (its inline values inside it; not the blocks under it or in its C), in workspace units. */
  const ownWidth = (block) => block.getBoundingRectangleWithoutChildren().getWidth();

  /** The block to give lines of its own so that `block` gets narrower: itself with two values or more, else the widest of those in its values. */
  function wrapCandidate(block) {
    const values = block.inputList.filter((i) => i.type === VALUE && i.connection?.targetBlock());
    if (block.getInputsInline() && values.length >= 2) return block;
    let best = null;
    for (const input of values) {
      const found = wrapCandidate(input.connection.targetBlock());
      if (found && (!best || ownWidth(found) > ownWidth(best))) best = found;
    }
    return best;
  }

  /** How wide the blocks are on the screen, in CSS px, from the first left edge to the last right edge. */
  function drawnWidth() {
    let left = Infinity;
    let right = -Infinity;
    for (const block of workspace.getTopBlocks(false)) {
      const r = block.getSvgRoot().getBoundingClientRect();
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    return right > left ? right - left : 0;
  }

  /** Where the blocks begin on the screen (client px), and how far a block's right edge is, on the screen. */
  const contentLeft = () => Math.min(...workspace.getTopBlocks(false).map((b) => b.getSvgRoot().getBoundingClientRect().left));
  const rightOf = (block) => {
    const box = block.getBoundingRectangleWithoutChildren();
    return Blockly.utils.svgMath.wsToScreenCoordinates(workspace, new Blockly.utils.Coordinate(box.right, box.top)).x;
  };

  async function fit() {
    if (disposed || workspace.isDragging?.()) return;
    await Blockly.renderManagement.finishQueuedRenders();
    if (disposed) return;
    const avail = scroller.clientWidth - 2 * PAD;
    if (avail <= 0) return;
    // a block wider than the screen puts its inputs on lines of its own (this is layout, not an edit: no event, no undo step)
    Blockly.Events.disable();
    try {
      for (let pass = 0; pass < 6; pass += 1) {
        const wide = workspace.getAllBlocks(false).filter((b) => !b.isShadow() && ownWidth(b) * HELD_SCALE > avail);
        const wrap = new Set(wide.map(wrapCandidate).filter(Boolean));
        if (!wrap.size) break;
        for (const block of wrap) block.setInputsInline(false);
        await Blockly.renderManagement.finishQueuedRenders();
      }
    } finally {
      Blockly.Events.enable();
    }
    // what is still too wide is drawn smaller, down to MIN_SCALE (measured on the screen, as the text does not grow in step); at the
    // smallest size, the blocks that still reach past the edge (a block deep in a C) get lines of their own too
    const rescale = async () => {
      for (let pass = 0; pass < 3; pass += 1) {
        const width = drawnWidth();
        if (!width) return;
        const scale = Math.max(MIN_SCALE, Math.min(HELD_SCALE, workspace.scale * (avail / width) * 0.995));
        if (Math.abs(scale - workspace.scale) < 0.004) return;
        workspace.setScale(scale);
        await Blockly.renderManagement.finishQueuedRenders();
      }
    };
    for (let round = 0; round < 4; round += 1) {
      await rescale();
      if (workspace.scale > MIN_SCALE + 0.004) break;
      const left = contentLeft();
      const wrap = new Set(workspace.getAllBlocks(false).filter((b) => !b.isShadow() && rightOf(b) - left > avail + 0.5)
        .map(wrapCandidate).filter(Boolean));
      if (!wrap.size) break;
      Blockly.Events.disable();
      try {
        for (const block of wrap) block.setInputsInline(false);
      } finally {
        Blockly.Events.enable();
      }
      await Blockly.renderManagement.finishQueuedRenders();
    }
    const now = workspace.getBlocksBoundingBox();
    const s = workspace.scale;
    const height = Math.max(scroller.clientHeight, Math.ceil((now.bottom - now.top) * s + 2 * PAD + cover()));
    if (stage.style.height !== `${height}px`) {
      stage.style.height = `${height}px`;
      Blockly.svgResize(workspace);
    }
    workspace.scroll(PAD - now.left * s, PAD - now.top * s);
  }

  const scheduleFit = () => {
    if (fitting || disposed) return;
    fitting = setTimeout(() => { fitting = null; fit(); }, 0);
  };

  /** Brings a block into the part of the page that no sheet or bar covers. */
  function reveal(block) {
    const el = block?.getSvgRoot?.();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const bottom = s.bottom - cover();
    if (r.bottom > bottom) scroller.scrollTop += r.bottom - bottom;
    else if (r.top < s.top + 4) scroller.scrollTop -= s.top + 4 - r.top;
  }

  // -- the picked block and the bar ---------------------------------------------------------------------------------------

  function mark(block) {
    for (const el of stage.querySelectorAll(".bf-picked")) el.classList.remove("bf-picked");
    block?.getSvgRoot?.()?.classList.add("bf-picked");
  }

  function pick(block) {
    wrapping = false;
    notice = "";
    picked = block && !block.isShadow() && !block.outputConnection ? block : null;
    mark(picked);
    render();
    if (picked) reveal(picked);
  }

  function say(text) {
    notice = text;
    render();
  }

  function render() {
    grid.replaceChildren();
    error.hidden = true;
    const button = (label, name, onTap, enabled = true, wide = false) => {
      const b = make("button", wide ? "bfp-wide" : "", label, { type: "button", "data-bf": name });
      b.disabled = !enabled;
      b.addEventListener("click", onTap);
      grid.append(b);
    };
    if (!picked) {
      info.textContent = notice || WORDS.idle;
      button(WORDS.add, "add", () => openList({ kind: "end" }), true, true);
    } else if (wrapping) {
      info.textContent = WORDS.wrap;
      for (const [type, label] of WRAPPERS) button(label, `wrap-${type}`, () => wrap(type));
      button(WORDS.back, "wrap-back", () => { wrapping = false; render(); });
    } else {
      const can = actionsFor(picked);
      const message = errors.get(picked.id);
      if (message) {
        error.hidden = false;
        error.textContent = message;
      }
      info.textContent = notice || labelOf(BY_TYPE[picked.type.slice(3)] ?? { scratch: "" });
      button(WORDS.below, "below", () => { closeSheet(); openList(picked.nextConnection || firstBody(picked) ? { kind: "below", block: picked } : { kind: "end" }); }, can.below);
      button(WORDS.up, "up", () => act(moveUp), can.up);
      button(WORDS.down, "down", () => act(moveDown), can.down);
      button(WORDS.in, "in", () => act(moveIn), can.in);
      button(WORDS.out, "out", () => act(moveOut), can.out);
      button(WORDS.copy, "copy", () => act(duplicate), can.copy);
      button(WORDS.delete, "delete", () => act(remove), can.delete);
      button(WORDS.wrap, "wrap", () => { wrapping = true; render(); }, can.wrap);
    }
    scheduleFit();
  }

  // -- moving a statement: one step -----------------------------------------------------------------------------------------

  /** Runs an action as one step to undo; an action says why it cannot (a sentence) or gives nothing. */
  function act(fn) {
    closeSheet();
    const block = picked;
    if (!block) return;
    const problem = run(() => fn(block));
    notice = typeof problem === "string" ? problem : "";
    render();
    if (workspace.getBlockById(block.id)) reveal(block);
  }

  /**
   * Takes a statement out of its stack and closes the gap: the block under it goes to where it was. (Blockly 13's unplug(true) was tried:
   * with a block under it, it left that block hanging on, and the next connection made a loop.)
   */
  function takeOut(block) {
    const above = block.previousConnection.targetConnection;
    const next = block.getNextBlock();
    if (next && !next.isShadow()) block.nextConnection.disconnect();
    if (above) block.previousConnection.disconnect();
    if (next && above) above.connect(next.previousConnection);
  }

  /** Puts a block where `before` hangs: above it, in the same stack (or at its place when it starts a stack). */
  function putAbove(block, before) {
    const q = before.previousConnection?.targetConnection;
    if (q) {
      q.connect(block.previousConnection);
      return;
    }
    const at = before.getRelativeToSurfaceXY();
    const here = block.getRelativeToSurfaceXY();
    block.moveBy(at.x - here.x, at.y - here.y);
    block.nextConnection.connect(before.previousConnection);
  }

  function moveUp(block) {
    const a = above(block);
    if (a.kind === "none") return WORDS.first;
    if (a.kind === "parent" && !a.block.previousConnection) return WORDS.first;
    takeOut(block);
    putAbove(block, a.block);          // above the sibling it passes, or above the parent it leaves
    return null;
  }

  function moveDown(block) {
    const next = block.getNextBlock();
    const parent = block.getSurroundParent();
    if (next) {
      if (!next.nextConnection) return WORDS.last;
      takeOut(block);
      next.nextConnection.connect(block.previousConnection);
      return null;
    }
    if (parent?.nextConnection) {                     // the last line of a C: it leaves the C, below it
      takeOut(block);
      parent.nextConnection.connect(block.previousConnection);
      return null;
    }
    return WORDS.last;
  }

  function moveIn(block) {
    const a = above(block);
    const body = a.kind === "sibling" ? firstBody(a.block) : null;
    if (!body) return WORDS.noRoom;
    const end = endOf(body);
    if (!end) return WORDS.noRoom;
    takeOut(block);
    end.connect(block.previousConnection);
    return null;
  }

  function moveOut(block) {
    const parent = block.getSurroundParent();
    if (!parent?.nextConnection) return WORDS.notInside;
    takeOut(block);
    parent.nextConnection.connect(block.previousConnection);
    return null;
  }

  function duplicate(block) {
    const state = Blockly.serialization.blocks.save(block, { addCoordinates: false, addNextBlocks: false, saveIds: false });
    const copy = Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
    block.nextConnection.connect(copy.previousConnection);
    pick(copy);
    return null;
  }

  function remove(block) {
    pick(null);
    takeOut(block);
    block.dispose(false);
    return null;
  }

  /** Puts a new C block (repeat, count, if) where the picked block is, with the picked block inside it. */
  function wrap(type) {
    const block = picked;
    if (!block) return;
    wrapping = false;
    run(() => {
      const outer = block.previousConnection.targetConnection;
      const next = block.getNextBlock();
      const at = block.getRelativeToSurfaceXY();
      const wrapper = Blockly.serialization.blocks.append(toolboxBlock(type), workspace, { recordUndo: true });
      if (next) block.nextConnection.disconnect();
      block.unplug(false);
      if (outer) outer.connect(wrapper.previousConnection);
      else {
        const here = wrapper.getRelativeToSurfaceXY();
        wrapper.moveBy(at.x - here.x, at.y - here.y);
      }
      firstBody(wrapper).connect(block.previousConnection);
      if (next) wrapper.nextConnection.connect(next.previousConnection);
    });
    render();
    reveal(block);
  }

  // -- the block list -----------------------------------------------------------------------------------------------------

  function closeList() {
    list?.close();
    list = null;
  }

  /** `where`: {kind: "below", block}, {kind: "inside", conn} or {kind: "end"}. */
  function openList(where) {
    closeSheet();
    closeList();
    const accept = where.kind === "end" ? (def) => def.kind === "statement" : (def) => def.kind === "statement" && !def.top;
    list = openBlockList(frame, {
      rows: rowsFor(catalogue, accept),
      onChoose: (row) => { closeList(); addFromList(row.type, where); },
      onClose: closeList,
    });
  }

  function addFromList(type, where) {
    let block = null;
    let problem = null;
    run(() => {
      block = Blockly.serialization.blocks.append(toolboxBlock(type), workspace, { recordUndo: true });
      const checker = workspace.connectionChecker;
      const into = where.kind === "below" ? belowOf(where.block) : where.kind === "inside" ? where.conn : null;
      if (block.previousConnection && into) {
        if (checker.canConnect(block.previousConnection, into, false, Infinity)) into.connect(block.previousConnection);
        else problem = WORDS.cannot;
      } else if (block.previousConnection) {
        const end = endOfSketch(workspace);
        if (end && checker.canConnect(block.previousConnection, end, false, Infinity)) end.connect(block.previousConnection);
        else putAtFoot(block);
      } else if (into) problem = WORDS.cannot;
      else putAtFoot(block);
      if (problem) block.dispose(false);
    });
    if (problem) {
      say(problem);
      return;
    }
    pick(block);
    openFirstValue(block);
  }

  /** A block of its own (a hat) goes under the last stack: the column keeps the order. */
  function putAtFoot(block) {
    const box = workspace.getBlocksBoundingBox();
    const at = block.getRelativeToSurfaceXY();
    block.moveBy(box.left - at.x, box.bottom + 40 - at.y);
  }

  /** After a block is added, its first number or variable is picked with the sheet open. */
  function openFirstValue(block) {
    for (const input of block.inputList) {
      if (input.type !== VALUE) continue;
      const value = input.connection?.targetBlock();
      if (value && (value.type === typeOf("number") || value.type === typeOf("variable"))) {
        openValue(value);
      }
      return;
    }
  }

  // -- the sheet ---------------------------------------------------------------------------------------------------------------

  function closeSheet() {
    if (!sheet) return;
    if (target && !target.isDeadOrDying() && target.type === typeOf("number")) {
      const n = Number(target.getFieldValue("NUM"));
      if (n !== startValue) recent.add(n);
    }
    sheet.close();
    sheet = null;
    target = null;
    Blockly.Events.setGroup(false);
    scheduleFit();
  }

  /** The words of the slot a value is in: the label before it in its block ("size"), else the catalogue's parameter, else "value". */
  function titleFor(block) {
    const input = block.outputConnection?.targetConnection?.getParentInput();
    const label = [...(input?.fieldRow ?? [])].reverse().map((f) => String(f.getValue?.() ?? "").trim()).find((t) => /\p{L}/u.test(t));
    const param = catalogue ? slotParam(block, catalogue)?.param?.name : null;
    return param ?? label ?? "value";
  }

  /** The variables the value can use: the loops it is inside of, the block it is in, the names the program sets, the sketch's values. */
  function scopeFor(block) {
    const loops = [];
    const params = [];
    let child = block;
    for (let p = block.getParent(); p; child = p, p = p.getParent()) {
      const inBody = p.getInputWithBlock(child)?.type === STATEMENT;
      if (inBody && [typeOf("count"), typeOf("count_by"), typeOf("for_each")].includes(p.type)) loops.push(p.getFieldValue("VAR"));
      if (inBody && p.type === typeOf("def")) params.push(...p.getFieldValue("PARAMS").split(",").map((n) => n.trim()).filter(Boolean));
    }
    const globals = workspace.getAllBlocks(false)
      .filter((b) => [typeOf("set"), typeOf("change"), typeOf("subtract")].includes(b.type)).map((b) => b.getFieldValue("VAR"));
    return variablesInScope({ loops, params, globals: [...globals, ...moduleNames(topStacks(workspace))] });
  }

  const textOf = (block) => (block.type === typeOf("variable") ? block.getFieldValue("VAR")
    : block.type === typeOf("sketch_value") ? block.getFieldValue("WHAT") : "an expression");

  function specFor(block) {
    const number = block.type === typeOf("number");
    const value = number ? Number(block.getFieldValue("NUM")) : null;
    const editor = number && catalogue ? numberEditor(block, catalogue) : { key: "plain" };
    const range = editor.key === "angle" ? { low: 0, high: 360, step: 1 } : editor.low !== undefined ? { low: editor.low, high: editor.high, step: editor.step } : null;
    return {
      title: titleFor(block),
      kind: number ? "number" : "expression",
      value: Number.isFinite(value) ? value : null,
      valueText: textOf(block),
      range,
      variables: scopeFor(block),
      recent: recent.list(),
      on: {
        number: setNumber,
        variable: setVariable,
        operator: setOperator,
        newName: newVariable,
        more: () => openValueList(),
        done: closeSheet,
      },
    };
  }

  /** The value block in the slot is replaced by one made from `state` (the old one goes; a shadow under it comes back if the new one goes). */
  function replace(state) {
    const old = target;
    const conn = old?.outputConnection?.targetConnection;
    if (!conn) return null;
    const block = Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
    if (!old.isShadow()) old.dispose(false);
    conn.connect(block.outputConnection);
    target = block;
    return block;
  }

  function setNumber(n) {
    if (!target) return;
    if (target.type === typeOf("number")) target.setFieldValue(String(n), "NUM");
    else {
      replace({ type: typeOf("number"), fields: { NUM: String(n) } });
      sheet.update(specFor(target));
    }
  }

  function setVariable(entry) {
    if (!target) return;
    const sketch = entry.group === "sketch";
    const type = typeOf(sketch ? "sketch_value" : "variable");
    const field = sketch ? "WHAT" : "VAR";
    if (target.type === type) target.setFieldValue(entry.name, field);
    else replace({ type, fields: { [field]: entry.name } });
    sheet.update(specFor(target));
  }

  /** [old] op [ ]: the slot becomes a sum, the old block its left side, and the sheet goes on to the right side. */
  function setOperator(op) {
    if (!target) return;
    const old = Blockly.serialization.blocks.save(target, { addCoordinates: false, addNextBlocks: false, saveIds: false });
    const arith = replace(wrapInOperator(op, old));
    if (!arith) return;
    target = arith.getInputTargetBlock("B");
    startValue = null;
    sheet.update(specFor(target));
  }

  function newVariable(text) {
    const names = workspace.getAllBlocks(false).filter((b) => b.type === typeOf("set")).map((b) => b.getFieldValue("VAR"));
    const answer = checkName(text, names);
    if (!answer.ok) return answer;
    addVariable(workspace, answer.name);
    setVariable({ name: answer.name, group: "global" });
    return answer;
  }

  /** A tap on a number or a variable: the sheet opens for it. A new tap while a sheet is open ends that sheet's step. */
  function openValue(block) {
    closeSheet();
    closeList();
    Blockly.Events.setGroup(true);
    target = block;
    const spec = specFor(block);
    startValue = spec.value;
    sheet = openSheet(frame, spec);
    scheduleFit();
    requestAnimationFrame(() => reveal(block));
  }

  /** "Other blocks" in the sheet: the list of values; the one chosen goes into the slot. */
  function openValueList() {
    const keep = target;
    closeList();
    list = openBlockList(frame, {
      rows: rowsFor(catalogue, (def) => def.kind === "value"),
      onChoose: (row) => {
        closeList();
        if (!keep || keep.isDeadOrDying()) return;
        target = keep;
        const block = replace(toolboxBlock(row.type));
        if (block) { target = block; sheet.update(specFor(block)); }
      },
      onClose: closeList,
    });
  }

  /** A tap on the name of a variable in a statement (set [x] to ...): the variables, and a new one. */
  function openName(block, field) {
    closeSheet();
    closeList();
    Blockly.Events.setGroup(true);
    const choose = (name) => { block.setFieldValue(name, field.name); };
    const spec = () => ({
      title: "Variable",
      kind: "name",
      value: null,
      valueText: block.getFieldValue(field.name),
      variables: scopeFor(block).filter((v) => v.group !== "sketch"),
      recent: [],
      on: {
        variable: (entry) => { choose(entry.name); sheet.update(spec()); },
        newName: (text) => {
          const names = workspace.getAllBlocks(false).filter((b) => b.type === typeOf("set")).map((b) => b.getFieldValue("VAR"));
          const answer = checkName(text, names);
          if (!answer.ok) return answer;
          addVariable(workspace, answer.name);
          choose(answer.name);
          sheet.update(spec());
          return answer;
        },
        done: closeSheet,
      },
    });
    sheet = openSheet(frame, spec());
    scheduleFit();
    requestAnimationFrame(() => reveal(block));
  }

  // -- taps -----------------------------------------------------------------------------------------------------------------------

  tools.fieldTapped = (field) => {
    const block = field.getSourceBlock();
    if (!block || block.isDeadOrDying()) return false;
    if (block.isShadow() || block.outputConnection) {
      if ((block.type === typeOf("number") && field.name === "NUM") || (block.type === typeOf("variable") && field.name === "VAR")) {
        if (block.outputConnection?.targetConnection) { openValue(block); return true; }
      }
      return false;
    }
    if (field instanceof FieldName) { openName(block, field); return true; }
    return false;
  };

  /** An empty C of this block that the tap landed in, or null. */
  function emptyBodyAt(block) {
    const p = Blockly.utils.svgMath.screenToWsCoordinates(workspace, new Blockly.utils.Coordinate(down.x, down.y));
    for (const input of block.inputList) {
      const c = input.connection;
      if (input.type !== STATEMENT || !c || c.targetBlock()) continue;
      if (p.y >= c.y - 4 && p.y <= c.y + 44 && p.x >= c.x - 4) return c;
    }
    return null;
  }

  function blockTapped(block) {
    if (!block || block.isShadow()) return;
    if (block.outputConnection) {
      // a value that is not a number or a name (a sum, a measure): the same sheet, with no slider
      if (block.outputConnection.targetConnection) openValue(block);
      return;
    }
    closeSheet();
    const body = emptyBodyAt(block);
    if (body) {
      pick(block);
      openList({ kind: "inside", conn: body });
      return;
    }
    pick(picked === block ? null : block);
  }

  stage.addEventListener("pointerdown", (event) => { down = { x: event.clientX, y: event.clientY }; }, true);

  const installStrategies = () => {
    for (const block of workspace.getAllBlocks(false)) {
      if (!block.isShadow() && !block.isInsertionMarker() && !block.isDragging() && !(block.getDragStrategy() instanceof NoDrag)) {
        block.setDragStrategy(new NoDrag(block));
      }
    }
  };
  installStrategies();

  workspace.addChangeListener((event) => {
    if (event.type === Blockly.Events.CLICK) {
      installStrategies();
      if (event.targetType === "block" && event.blockId) blockTapped(workspace.getBlockById(event.blockId));
      else if (event.targetType === "workspace") {
        closeSheet();
        closeList();
        pick(null);
      }
      return;
    }
    if (event.isUiEvent) return;
    installStrategies();
    if (picked && picked.isDeadOrDying()) pick(null);
    else if (picked) { mark(picked); render(); }
    for (const id of errors.keys()) if (!workspace.getBlockById(id)) errors.delete(id);
    scheduleFit();
  });

  // -- the error line -------------------------------------------------------------------------------------------------------------

  /**
   * Marks the block that wrote line `line` of the Python (the last line before it, when that line is no block's first) and keeps
   * `message` for it: a tap on the block picks it and the bar shows the message. Gives the block, or null.
   */
  function markError(line, message) {
    clearErrors();
    const lines = blockLines(workspace);
    const exact = lines.find((l) => l.line === line);
    const found = exact ?? [...lines].reverse().find((l) => l.line < line);
    if (!found) return null;
    errors.set(found.block.id, message);
    found.block.getSvgRoot().classList.add("bfh-error");
    return found.block;
  }

  function clearErrors() {
    for (const id of errors.keys()) workspace.getBlockById(id)?.getSvgRoot()?.classList.remove("bfh-error");
    errors.clear();
    render();
  }

  render();
  scheduleFit();
  const onResize = () => scheduleFit();
  window.addEventListener("resize", onResize);
  // the phone's keyboard covers the foot of the page: the sheet and the bar stand above it (keyboard.js; not testable without a phone)
  const stopKeyboard = keepAboveKeyboard(frame, (height) => {
    frame.style.setProperty("--bfh-keyboard", height ? `${height}px` : "0px");
    scheduleFit();
  });

  Object.assign(tools, {
    pick, fit, markError, clearErrors, closeSheet,
    picked: () => picked,
    sheetOpen: () => !!sheet,
    dispose() {
      disposed = true;
      clearTimeout(fitting);
      window.removeEventListener("resize", onResize);
      stopKeyboard();
      closeSheet();
      closeList();
      bar.remove();
      delete workspace.bfHeld;
    },
  });
  return tools;
}
