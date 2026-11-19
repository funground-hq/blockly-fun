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
import { typeOf, FieldName } from "./blocks/register.js";
import { labelOf, openBlockList, rowsFor } from "./phone/blocklist.js";
import { keepAboveKeyboard } from "./keyboard.js";
import { Recent } from "./phone/slots.js";
import { ActionBar } from "./phone/bar.js";
import { actionsFor, addAt, duplicate, firstBody, inOneStep, moveDown, moveIn, moveOut, moveUp, remove, wrapIn } from "./phone/moves.js";
import { blockAtLine, blockLines, matchLines } from "./phone/lines.js";
import { createValueSheets } from "./phone/valuesheet.js";
import { addPhoneStyle, make } from "./phone/style.js";

// what the held list's tests and the check import from here; the parts themselves are shared with spike B (editor/phone/)
export { actionsFor, blockLines, matchLines };

export const HELD_SCALE = 0.9;       // the blocks' size when they fit; 16 px text at 1, so 14 px here
export const MIN_SCALE = 0.5;        // the smallest a long block is drawn (8 px text)
const PAD = 8;                       // px between the blocks and the screen's edge

export const WORDS = {
  idle: "Tap a block to pick it. Tap a value to change it.",
  wrap: "Wrap in…",
};

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

/**
 * Makes `workspace` a held list. `frame`, `scroller` and `stage` are makeHeldFrame's; `catalogue` is the catalogue index or null.
 * Gives `{pick, picked, fit, markError, clearErrors, dispose, ...}`.
 */
export function attachHeld(workspace, { frame, scroller, stage, catalogue = null, column }) {
  hookFieldTaps();
  const recent = new Recent();
  const errors = new Map();          // block id -> message
  let picked = null;
  let list = null;
  let notice = "";
  let wrapping = false;
  let down = { x: 0, y: 0 };
  let fitting = null;
  let disposed = false;

  const tools = {};
  workspace.bfHeld = tools;

  // -- the pieces of page ------------------------------------------------------------------------------------------

  const bar = new ActionBar(frame);
  const run = inOneStep;

  // -- fitting: the page's height, and what is too wide ---------------------------------------------------------------

  const cover = () => Math.max(bar.height, sheets.root ? sheets.root.offsetHeight : 0) + 12;

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
    const on = {
      add: () => openList({ kind: "end" }),
      below: () => { sheets.close(); openList(picked.nextConnection || firstBody(picked) ? { kind: "below", block: picked } : { kind: "end" }); },
      up: () => act(moveUp),
      down: () => act(moveDown),
      in: () => act(moveIn),
      out: () => act(moveOut),
      copy: () => act((block) => { pick(duplicate(workspace, block)); return null; }),
      delete: () => act((block) => { pick(null); remove(block); return null; }),
      wrap: () => { wrapping = true; render(); },
      wrapWith: (type) => wrap(type),
      back: () => { wrapping = false; render(); },
    };
    if (!picked) bar.show({ mode: "idle", info: notice || WORDS.idle }, on);
    else if (wrapping) bar.show({ mode: "wrap", info: WORDS.wrap }, on);
    else {
      bar.show({
        mode: "picked", info: notice || labelOf(BY_TYPE[picked.type.slice(3)] ?? { scratch: "" }),
        message: errors.get(picked.id), can: actionsFor(picked),
      }, on);
    }
    scheduleFit();
  }

  // -- moving a statement: one step -----------------------------------------------------------------------------------------

  /** Runs an action as one step to undo; an action says why it cannot (a sentence) or gives nothing. */
  function act(fn) {
    sheets.close();
    const block = picked;
    if (!block) return;
    const problem = run(() => fn(block));
    notice = typeof problem === "string" ? problem : "";
    render();
    if (workspace.getBlockById(block.id)) reveal(block);
  }

  /** Puts a new C block (repeat, count, if) where the picked block is, with the picked block inside it. */
  function wrap(type) {
    const block = picked;
    if (!block) return;
    wrapping = false;
    run(() => wrapIn(workspace, block, type));
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
    sheets.close();
    closeList();
    const accept = where.kind === "end" ? (def) => def.kind === "statement" : (def) => def.kind === "statement" && !def.top;
    list = openBlockList(frame, {
      rows: rowsFor(catalogue, accept),
      onChoose: (row) => { closeList(); addFromList(row.type, where); },
      onClose: closeList,
    });
  }

  function addFromList(type, where) {
    const added = run(() => addAt(workspace, type, where));
    if (added.problem) {
      say(added.problem);
      return;
    }
    pick(added.block);
    openFirstValue(added.block);
  }

  /** After a block is added, its first number or variable is picked with the sheet open. */
  function openFirstValue(block) {
    for (const input of block.inputList) {
      if (input.type !== VALUE) continue;
      const value = input.connection?.targetBlock();
      if (value && (value.type === typeOf("number") || value.type === typeOf("variable"))) {
        sheets.openValue(value);
      }
      return;
    }
  }

  // -- the sheet: a tap on a value (phone/valuesheet.js) -------------------------------------------------------------------

  const sheets = createValueSheets(workspace, {
    host: frame, catalogue, recent,
    onOpen: closeList,
    onClose: scheduleFit,
    reveal: (block) => { scheduleFit(); reveal(block); },
  });

  // -- taps -----------------------------------------------------------------------------------------------------------------------

  tools.fieldTapped = (field) => {
    const block = field.getSourceBlock();
    if (!block || block.isDeadOrDying()) return false;
    if (block.isShadow() || block.outputConnection) {
      if ((block.type === typeOf("number") && field.name === "NUM") || (block.type === typeOf("variable") && field.name === "VAR")) {
        if (block.outputConnection?.targetConnection) { sheets.openValue(block); return true; }
      }
      return false;
    }
    if (field instanceof FieldName) { sheets.openName(block, field); return true; }
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
      if (block.outputConnection.targetConnection) sheets.openValue(block);
      return;
    }
    sheets.close();
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
        sheets.close();
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
    const block = blockAtLine(workspace, line);
    if (!block) return null;
    errors.set(block.id, message);
    block.getSvgRoot().classList.add("bfh-error");
    return block;
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
    pick, fit, markError, clearErrors, closeSheet: sheets.close,
    picked: () => picked,
    sheetOpen: () => sheets.isOpen(),
    dispose() {
      disposed = true;
      clearTimeout(fitting);
      window.removeEventListener("resize", onResize);
      stopKeyboard();
      sheets.close();
      closeList();
      bar.dispose();
      delete workspace.bfHeld;
    },
  });
  return tools;
}
