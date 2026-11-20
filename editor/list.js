// The "phone" layout (BF-D-053): our own list of lines. Blockly stays underneath with no page (a plain `new Blockly.Workspace()`:
// the model, the undo history and the Python generator), and the blocks are drawn here, as HTML:
//
//   - one row for each line of a statement; a C block's body is the rows under it, one step in, with a coloured rail for each block it is in;
//   - the words are the block's own (rows.js reads them from the block's inputs), each value a chip, a nested value a chip with chips in it;
//     rows wrap within the screen, text is 15 px and every chip's tap area is 44 px high at least;
//   - two looks of the same rows: "blocks" (colours, Scratch's words) and "code" (the Python line, the same chips over its values),
//     chosen by the host (editor.look(); Play has a "Show code" box by the file's name). The list has no top row of its own: a row of
//     buttons there took 54 px of a phone's height, and its "Python" was taken for the Code view (the maintainer's phone pass, 20 Nov);
//   - a tap on a row picks its block (the bar at the foot: phone/bar.js, with the changes of the block's gear: phone/gear.js), a tap on a
//     chip opens the sheet for that value (the slot sheet, a list of choices, a grid of colours, the catalogue's names, or the keyboard
//     for words), a tap on an empty body opens the block list.
//
// Every edit is made on Blockly's blocks, so the Python is the generator's by construction. The rows are drawn again, in full, after each
// change (simple on purpose: the time it takes is measured, see stats()). The page scrolls (the browser's scroll); nothing is dragged.

import * as Blockly from "blockly";
import { BY_TYPE } from "./blocks/table.js";
import { typeOf } from "./blocks/register.js";
import { keepAboveKeyboard } from "./keyboard.js";
import { gridColours } from "./editors/fields.js";
import { nameScope } from "./catalogue/call_block.js";
import { choicesOf, isColourSlot } from "./editors/slots.js";
import { ActionBar } from "./phone/bar.js";
import { applyGear, gearFor } from "./phone/gear.js";
import { labelOf, openBlockList, rowsFor } from "./phone/blocklist.js";
import { blockAtLine } from "./phone/lines.js";
import { actionsFor, addAt, duplicate, firstBody, inOneStep, moveDown, moveIn, moveOut, moveUp, remove, wrapIn } from "./phone/moves.js";
import { openChoiceSheet, openNameSheet, openTextSheet } from "./phone/pickers.js";
import { describeProgram, LOOKS, textOfParts } from "./phone/rows.js";
import { Recent } from "./phone/slots.js";
import { addPhoneStyle, make } from "./phone/style.js";
import { createValueSheets } from "./phone/valuesheet.js";

export const WORDS = {
  idle: "Tap a line to pick it. Tap a value to change it.",
  wrap: "Wrap in…",
  empty: "Nothing here yet. Tap to add a block.",
  nothing: "No blocks yet. Tap + Add a block.",
};

const STYLE = `
.bfl-frame { position: relative; box-sizing: border-box; width: 100%; height: 100%; overflow: hidden; font-family: var(--body, system-ui, sans-serif); color: var(--ink, #191970); }
.bfl-scroll { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; touch-action: pan-y; overscroll-behavior: contain; background: var(--panel, #fffaf0); }
.bfl-list { box-sizing: border-box; padding: 8px 6px 12px; }
.bfl-row { display: flex; align-items: stretch; box-sizing: border-box; min-height: 52px; margin: 0; border-bottom: 1.5px solid rgba(0, 0, 0, 0.22);
  background: var(--kind); color: var(--on); font-size: 15px; line-height: 1.3; touch-action: manipulation; cursor: pointer; -webkit-user-select: none; user-select: none; }
.bfl-row.bfl-hat { margin-top: 10px; border-radius: 16px 16px 0 0; font-weight: 700; }
.bfl-row.bfl-hat:first-child { margin-top: 0; }
.bfl-rail { flex: none; width: 10px; background: var(--rail); border-right: 1.5px solid rgba(0, 0, 0, 0.18); }
.bfl-line { flex: 1; min-width: 0; align-self: center; padding: 2px 8px; overflow-wrap: anywhere; }
.bfl-word { vertical-align: middle; margin: 0 3px; white-space: pre-wrap; }
.bfl-code .bfl-word { margin: 0; font-family: ui-monospace, Consolas, monospace; }
.bfl-chip { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; box-sizing: border-box; min-height: 44px; min-width: 44px; max-width: 100%;
  margin: 2px; padding: 0 2px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; touch-action: manipulation; }
.bfl-pill { display: inline-block; box-sizing: border-box; min-width: 28px; max-width: 100%; padding: 0 10px; border-radius: 15px; background: #fff; color: #191970;
  border: 1.5px solid rgba(0, 0, 0, 0.3); font-weight: 600; line-height: 27px; text-align: center; overflow-wrap: anywhere; }
.bfl-pill:empty::before { content: "…"; opacity: 0.6; }
.bfl-code .bfl-pill { font-family: ui-monospace, Consolas, monospace; font-weight: 500; }
.bfl-field .bfl-pill { background: rgba(255, 255, 255, 0.82); }
.bfl-empty .bfl-pill { background: transparent; border-style: dashed; color: inherit; font-weight: 400; }
.bfl-group { flex-wrap: wrap; border: 1.5px solid rgba(0, 0, 0, 0.28); border-radius: 24px; background: rgba(255, 255, 255, 0.3); padding: 0 6px; cursor: pointer; }
.bfl-row .bfl-group .bfl-group { background: rgba(255, 255, 255, 0.25); }
.bfl-code .bfl-row { background: var(--paper, #fdf6e7); color: var(--ink, #191970); border-left: 6px solid var(--kind); font-size: 15px; }
.bfl-code .bfl-row.bfl-hat { border-radius: 10px 10px 0 0; }
.bfl-row.bfl-empty-body { background: rgba(255, 255, 255, 0.55); color: var(--muted, #5a5f84); font-size: 15px; border-bottom-style: dashed; }
.bfl-empty-body .bfl-line { font-style: italic; }
.bfl-code .bfl-row.bfl-empty-body { background: rgba(0, 0, 0, 0.04); }
button.bfl-row { font: inherit; text-align: left; border-left: 0; border-top: 0; border-right: 0; padding: 0; }
.bfl-row.bfl-picked { outline: 4px solid var(--gold, #ffd700); outline-offset: -4px; }
.bfl-row.bfl-error { outline: 4px dashed #d32f2f; outline-offset: -4px; }
.bfl-note { padding: 18px 12px; font-size: 15px; color: var(--muted, #5a5f84); }

.bfp-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; margin-top: 6px; }
.bfp-choice[aria-pressed="true"] { background: var(--ink, #191970); color: var(--paper, #fdf6e7); }
.bfp-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; margin-top: 6px; }
.bfp-swatches .bfp-swatch { padding: 0; min-width: 44px; border-radius: 10px; border-color: rgba(0, 0, 0, 0.35); }
.bfp-swatches .bfp-swatch[aria-pressed="true"] { outline: 4px solid var(--ink, #191970); outline-offset: 1px; }
.bfp-text { display: block; box-sizing: border-box; width: 100%; margin-top: 6px; min-height: 44px; padding: 8px 10px; border: 1.5px solid var(--ink, #191970);
  border-radius: 10px; font: 16px var(--body, system-ui, sans-serif); }
`;

let styled = false;

function addListStyle() {
  addPhoneStyle();
  if (styled || typeof document === "undefined") return;
  styled = true;
  const style = document.createElement("style");
  style.id = "bf-list-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The page parts of the layout: a frame, a scroller (the page scrolls up and down) and the list of rows in it. */
export function makeListFrame(element) {
  addListStyle();
  const frame = make("div", "bfl-frame");
  const scroller = make("div", "bfl-scroll");
  const list = make("div", "bfl-list", undefined, { role: "list", "aria-label": "Your blocks" });
  scroller.append(list);
  frame.append(scroller);
  element.append(frame);
  return { frame, scroller, list };
}

const VALUE = Blockly.inputs.inputTypes.VALUE;

/**
 * Makes `workspace` (a plain Blockly workspace) a list of rows in `list`. `catalogue` is the catalogue index or null.
 * Gives {pick, picked, look, markError, clearErrors, closeSheet, render, stats, refresh, dispose}.
 * `onLook(look)` hears each change of the look, made by the host through look().
 */
export function attachList(workspace, { frame, scroller, list, catalogue = null, look = "blocks", onLook = () => {} }) {
  const recent = new Recent();
  const errors = new Map();          // block id -> message
  const stats = { renders: 0, lastMs: 0, maxMs: 0, rows: 0 };
  let current = look;
  let picked = null;
  let notice = "";
  let wrapping = false;
  let addList = null;
  let fieldSheet = null;             // the choice, colour or text sheet
  let wantReveal = null;
  let pending = null;
  let disposed = false;
  const tools = {};

  const bar = new ActionBar(frame);

  // -- fitting: room for the bar and the sheet at the foot ---------------------------------------------------------------

  const cover = () => Math.max(bar.height, sheets.root?.offsetHeight ?? 0, fieldSheet?.root.offsetHeight ?? 0) + 12;
  const fit = () => { list.style.paddingBottom = `${cover()}px`; };

  /** Brings what has the block's id (its row, or its chip) into the part of the page that no sheet or bar covers. */
  function revealNow() {
    const el = list.querySelector(`[data-block="${wantReveal}"]`);
    if (!el) return;
    wantReveal = null;
    fit();
    const r = el.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const bottom = s.bottom - cover();
    if (r.bottom > bottom) scroller.scrollTop += r.bottom - bottom;
    else if (r.top < s.top + 4) scroller.scrollTop -= s.top + 4 - r.top;
  }

  function reveal(block) {
    if (!block) return;
    wantReveal = block.id;
    revealNow();
  }

  // -- drawing the rows ----------------------------------------------------------------------------------------------------

  const wordEl = (text) => make("span", "bfl-word", text);

  /** The elements of a line's parts: words, and a chip for each field and value. */
  function partEls(parts) {
    return parts.map((part) => {
      if (part.type === "word") return wordEl(part.text);
      if (part.type === "field") {
        const chip = make("button", "bfl-chip bfl-field", undefined, {
          type: "button", "data-act": "field", "data-block": part.block.id, "data-field": part.name, "data-kind": part.kind,
        });
        chip.append(make("span", "bfl-pill", part.text));
        return chip;
      }
      if (!part.block) {
        const chip = make("button", "bfl-chip bfl-empty", undefined, {
          type: "button", "data-act": "empty", "data-owner": part.conn.getSourceBlock().id, "data-input": part.conn.getParentInput().name,
        });
        chip.append(make("span", "bfl-pill", part.text));
        return chip;
      }
      if (part.parts) {
        const group = make("span", "bfl-chip bfl-group", undefined, { role: "button", tabindex: "0", "data-act": "value", "data-block": part.block.id });
        group.append(...partEls(part.parts));
        return group;
      }
      const chip = make("button", "bfl-chip", undefined, { type: "button", "data-act": "value", "data-block": part.block.id });
      chip.append(make("span", "bfl-pill", part.text));
      return chip;
    });
  }

  function rowEl(row) {
    const rails = row.rails.map((colour) => {
      const rail = make("span", "bfl-rail");
      rail.style.setProperty("--rail", colour);
      return rail;
    });
    if (row.type === "empty") {
      const el = make("button", "bfl-row bfl-empty-body", undefined, {
        type: "button", "data-act": "body", "data-block": row.block.id, "data-input": row.conn.getParentInput().name,
      });
      el.append(...rails, make("span", "bfl-line", WORDS.empty));
      return el;
    }
    const el = make("div", `bfl-row${row.hat ? " bfl-hat" : ""}`, undefined, {
      role: "listitem", "data-block": row.block.id, "data-segment": String(row.segment), "aria-label": textOfParts(row.parts, row.look),
    });
    el.style.setProperty("--kind", row.colour);
    el.style.setProperty("--on", row.ink);
    const line = make("div", "bfl-line");
    line.append(...partEls(row.parts));
    el.append(...rails, line);
    return el;
  }

  function render() {
    const started = performance.now();
    const rows = describeProgram(workspace, current);
    const fragment = document.createDocumentFragment();
    for (const row of rows) fragment.append(rowEl(row));
    if (!rows.length) fragment.append(make("div", "bfl-note", WORDS.nothing));
    list.replaceChildren(fragment);
    list.classList.toggle("bfl-code", current === "code");
    applyMarks();
    if (picked) drawBar();               // what the picked block can do (the gear's buttons) follows what is in it
    fit();
    if (wantReveal) revealNow();
    stats.renders += 1;
    stats.rows = rows.length;
    stats.lastMs = performance.now() - started;
    stats.maxMs = Math.max(stats.maxMs, stats.lastMs);
  }

  /** Drawn again in the next turn, once, however many changes there were (an undo is several). */
  function renderSoon() {
    if (pending || disposed) return;
    pending = setTimeout(() => { pending = null; if (!disposed) render(); }, 0);
  }

  function applyMarks() {
    for (const el of list.querySelectorAll(".bfl-row")) {
      const id = el.dataset.block;
      el.classList.toggle("bfl-picked", !!picked && id === picked.id);
      el.classList.toggle("bfl-error", !!id && errors.has(id));
    }
  }

  // -- the picked block and the bar ---------------------------------------------------------------------------------------

  function pick(block) {
    wrapping = false;
    notice = "";
    picked = block && !block.isShadow() && !block.outputConnection ? block : null;
    applyMarks();
    drawBar();
    if (picked) reveal(picked);
  }

  function say(text) {
    notice = text;
    drawBar();
  }

  function drawBar() {
    const on = {
      add: () => openAddList({ kind: "end" }),
      below: () => { closeSheets(); openAddList(picked.nextConnection || firstBody(picked) ? { kind: "below", block: picked } : { kind: "end" }); },
      up: () => act(moveUp),
      down: () => act(moveDown),
      in: () => act(moveIn),
      out: () => act(moveOut),
      copy: () => act((block) => { pick(duplicate(workspace, block)); return null; }),
      delete: () => act((block) => { pick(null); remove(block); return null; }),
      wrap: () => { wrapping = true; drawBar(); },
      wrapWith: (type) => wrap(type),
      back: () => { wrapping = false; drawBar(); },
      gear: (id) => act((block) => applyGear(block, id)),
    };
    if (!picked) bar.show({ mode: "idle", info: notice || WORDS.idle }, on);
    else if (wrapping) bar.show({ mode: "wrap", info: WORDS.wrap }, on);
    else {
      bar.show({
        mode: "picked", info: notice || labelOf(BY_TYPE[picked.type.slice(3)] ?? { scratch: "" }),
        message: errors.get(picked.id), can: actionsFor(picked), gear: gearFor(picked),
      }, on);
    }
    fit();
  }

  /** Runs an action as one step to undo; an action says why it cannot (a sentence) or gives nothing. */
  function act(fn) {
    closeSheets();
    const block = picked;
    if (!block) return;
    const problem = inOneStep(() => fn(block));
    notice = typeof problem === "string" ? problem : "";
    drawBar();
    if (!problem && workspace.getBlockById(block.id)) wantReveal = block.id;     // once the rows are drawn again
  }

  function wrap(type) {
    const block = picked;
    if (!block) return;
    wrapping = false;
    inOneStep(() => wrapIn(workspace, block, type));
    drawBar();
    wantReveal = block.id;
  }

  // -- the block list ---------------------------------------------------------------------------------------------------------

  function closeAddList() {
    addList?.close();
    addList = null;
  }

  /** `where`: {kind: "below", block}, {kind: "inside", conn} or {kind: "end"}. */
  function openAddList(where) {
    closeSheets();
    const accept = where.kind === "end" ? (def) => def.kind === "statement" : (def) => def.kind === "statement" && !def.top;
    addList = openBlockList(frame, {
      rows: rowsFor(catalogue, accept),
      onChoose: (row) => { closeAddList(); addFromList(row.type, where); },
      onClose: closeAddList,
    });
  }

  function addFromList(type, where) {
    const added = inOneStep(() => addAt(workspace, type, where));
    if (added.problem) {
      say(added.problem);
      return;
    }
    pick(added.block);
    openFirstValue(added.block);
  }

  /** After a block is added, its first number or variable has the sheet open. */
  function openFirstValue(block) {
    for (const input of block.inputList) {
      if (input.type !== VALUE) continue;
      const value = input.connection?.targetBlock();
      if (value && (value.type === typeOf("number") || value.type === typeOf("variable"))) sheets.openValue(value);
      return;
    }
  }

  // -- the sheets: a tap on a chip -----------------------------------------------------------------------------------------------

  const sheets = createValueSheets(workspace, {
    host: frame, catalogue, recent,
    onOpen: () => { closeAddList(); closeFieldSheet(); },
    onClose: fit,
    reveal: (block) => { fit(); reveal(block); },
  });

  function closeFieldSheet() {
    if (!fieldSheet) return;
    fieldSheet.close();
    fieldSheet = null;
    Blockly.Events.setGroup(false);
    fit();
  }

  function closeSheets() {
    sheets.close();
    closeFieldSheet();
  }

  /** A sheet of our own (a choice, a colour, words): one step to undo, from when it opens to when it closes. */
  function openOwn(build, forBlock) {
    closeSheets();
    closeAddList();
    Blockly.Events.setGroup(true);
    fieldSheet = build();
    fit();
    requestAnimationFrame(() => reveal(forBlock));
  }

  const chooseField = (block, name) => (value) => { block.setFieldValue(value, name); closeFieldSheet(); };

  function openChoice(block, field) {
    const options = field.getOptions(false).filter(([, value]) => typeof value === "string")
      .map(([label, value]) => ({ value, label: typeof label === "string" ? label : String(value) }));
    openOwn(() => openChoiceSheet(frame, {
      title: field.name === "OP" ? "operator" : "choose", options, current: field.getValue(), onChoose: chooseField(block, field.name), onDone: closeFieldSheet,
    }), block);
  }

  function openText(block, field, multiline = false) {
    openOwn(() => openTextSheet(frame, {
      title: titleOfField(block, field), value: String(field.getValue()), multiline,
      onInput: (text) => { block.setFieldValue(text, field.name); }, onDone: closeFieldSheet,
    }), block);
  }

  const titleOfField = (block, field) => (field.name === "TEXT" ? "text" : field.name === "NAME" ? "name" : field.name === "PARAMS" ? "inputs" : field.name.toLowerCase());

  /** The name of a call (`f . delta time`): the catalogue's names for that place; where the catalogue knows none, the keyboard. */
  function openCatalogueName(block, field) {
    const scope = catalogue ? nameScope(block, catalogue) : null;
    if (!scope?.groups.length) {
      openText(block, field);
      return;
    }
    openOwn(() => openNameSheet(frame, {
      title: "name", scope, current: String(field.getValue()),
      onChoose: (entry) => { field.select(entry); closeFieldSheet(); },
      onUse: (text) => { block.setFieldValue(text, field.name); closeFieldSheet(); },
      onDone: closeFieldSheet,
    }), block);
  }

  /** A text value: the colour grid in a colour slot, the catalogue's words in a slot that lists some, else the keyboard. */
  function openTextValue(block) {
    const field = block.getField("TEXT");
    const words = catalogue ? choicesOf(block, catalogue) : null;
    if (catalogue && isColourSlot(block, catalogue)) {
      const options = gridColours(catalogue).map((c) => ({ value: c.name, label: c.name, hex: c.hex }));
      const here = String(field.getValue());
      if (!options.some((o) => o.value === here)) options.unshift({ value: here, label: here, hex: catalogue.raw.colors?.find((c) => c.name === here)?.hex ?? "#ffffff" });
      openOwn(() => openChoiceSheet(frame, { title: "colour", options, current: here, onChoose: chooseField(block, "TEXT"), onDone: closeFieldSheet }), block);
    } else if (words) {
      openOwn(() => openChoiceSheet(frame, {
        title: "choose", options: words.map((w) => ({ value: w, label: w })), current: String(field.getValue()), onChoose: chooseField(block, "TEXT"), onDone: closeFieldSheet,
      }), block);
    } else openText(block, field);
  }

  /** A tap on a value chip: the sheet that suits the value. */
  function tapValue(block) {
    if (block.isDeadOrDying()) return;
    if (block.type === typeOf("text")) openTextValue(block);
    else if (block.type === typeOf("boolean")) openChoice(block, block.getField("VALUE"));
    else if (block.type === typeOf("code_value")) openText(block, block.getField("TEXT"), true);
    else sheets.openValue(block);          // a number, a name, a sum, a measure: the slot sheet
  }

  /** A tap on a chip that is a field of a block (a name, a choice, a word). */
  function tapField(block, name, kind) {
    const field = block.getField(name);
    if (!field) return;
    if (kind === "name") sheets.openName(block, field);
    else if (kind === "catalogue") openCatalogueName(block, field);
    else if (kind === "choice") openChoice(block, field);
    else openText(block, field, kind === "code");
  }

  // -- taps ------------------------------------------------------------------------------------------------------------------------

  /** One tap, one meaning: a chip is the value or field in it, the rest of a row is the row (a tap on a picked row puts it down). */
  list.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-act]");
    const blockId = (chip ?? event.target.closest(".bfl-row"))?.dataset.block;
    const block = blockId ? workspace.getBlockById(blockId) : null;
    if (!chip) {
      if (block) { closeSheets(); pick(picked === block ? null : block); }
      return;
    }
    const { act: kind, input, owner, field } = chip.dataset;
    if (kind === "value" && block) tapValue(block);
    else if (kind === "field" && block) tapField(block, field, chip.dataset.kind);
    else if (kind === "empty") sheets.openEmpty(workspace.getBlockById(owner).getInput(input).connection);
    else if (kind === "body" && block) {
      closeSheets();
      pick(block);
      openAddList({ kind: "inside", conn: block.getInput(input).connection });
    }
  });

  workspace.addChangeListener((event) => {
    if (event.isUiEvent) return;
    if (picked && picked.isDeadOrDying()) pick(null);
    for (const id of errors.keys()) if (!workspace.getBlockById(id)) errors.delete(id);
    renderSoon();
  });

  // -- the error line ---------------------------------------------------------------------------------------------------------------

  /** Marks the block that wrote line `line` of the Python and keeps `message` for it (the bar shows it when the line is picked). Gives the block, or null. */
  function markError(line, message) {
    clearErrors();
    const block = blockAtLine(workspace, line);
    if (!block) return null;
    errors.set(block.id, message);
    applyMarks();
    if (picked === block) drawBar();
    return block;
  }

  function clearErrors() {
    errors.clear();
    applyMarks();
    drawBar();
  }

  // -- the look ----------------------------------------------------------------------------------------------------------------------

  render();
  drawBar();
  const stopKeyboard = keepAboveKeyboard(frame, (height) => {
    frame.style.setProperty("--bfh-keyboard", height ? `${height}px` : "0px");
    fit();
  });

  Object.assign(tools, {
    pick, markError, clearErrors, render, closeSheet: closeSheets,
    picked: () => picked,
    sheetOpen: () => sheets.isOpen() || !!fieldSheet,
    stats: () => ({ ...stats }),
    /** The labels of the calls were brought up to date (types.js): the rows are drawn again. */
    refresh: renderSoon,
    /** The look: "blocks" or "code". With a name, changes it and draws the rows again. */
    look(next) {
      if (next === undefined) return current;
      if (!LOOKS.includes(next)) throw new Error(`look must be "blocks" or "code", not ${next}`);
      if (next !== current) {
        current = next;
        render();
        onLook(current);
      }
      return current;
    },
    dispose() {
      disposed = true;
      clearTimeout(pending);
      stopKeyboard();
      closeSheets();
      closeAddList();
      bar.dispose();
    },
  });
  return tools;
}
