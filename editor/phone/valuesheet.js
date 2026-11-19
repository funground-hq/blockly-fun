// What happens when a value is tapped (BF-D-053, both spikes): the slot sheet (sheet.js) opened for a value block in a slot, and what
// each choice in it does to the blocks. Spike A calls it from Blockly's own click, spike B from a chip in a row. It does not know
// which: it is given the workspace, the page part to open over and the catalogue, and it works on Blockly blocks.
//
// A sheet session is one step to undo (an event group opened with the sheet and closed with it).

import * as Blockly from "blockly";
import { toolboxBlock, typeOf } from "../blocks/register.js";
import { numberEditor, slotParam } from "../editors/slots.js";
import { openBlockList, rowsFor } from "./blocklist.js";
import { openSheet } from "./sheet.js";
import { variablesInScope, wrapInOperator } from "./slots.js";
import { addVariable, checkName, moduleNames, topStacks } from "./variables.js";

const STATEMENT = Blockly.inputs.inputTypes.STATEMENT;

const textOf = (block) => (block.type === typeOf("variable") ? block.getFieldValue("VAR")
  : block.type === typeOf("sketch_value") ? block.getFieldValue("WHAT") : "an expression");

/**
 * `host` is the element the sheet opens in; `recent` a Recent (slots.js); `onOpen()` is called before a sheet opens (the caller closes what
 * it has open), `onClose()` after one closes, `reveal(block)` brings the block into the part of the page the sheet does not cover.
 * Gives {openValue, openEmpty, openName, close, isOpen, root}.
 */
export function createValueSheets(workspace, { host, catalogue, recent, onOpen = () => {}, onClose = () => {}, reveal = () => {} }) {
  let sheet = null;
  let target = null;                 // the value block the sheet is about (null for an empty slot)
  let slot = null;                   // the input's connection it is in: the place a new value goes
  let startValue = null;
  let list = null;                   // "Other blocks"

  function closeList() {
    list?.close();
    list = null;
  }

  function close() {
    closeList();
    if (!sheet) return;
    if (target && !target.isDeadOrDying() && target.type === typeOf("number")) {
      const n = Number(target.getFieldValue("NUM"));
      if (n !== startValue) recent.add(n);
    }
    sheet.close();
    sheet = null;
    target = null;
    slot = null;
    Blockly.Events.setGroup(false);
    onClose();
  }

  /** The words of the slot a value is in: the catalogue's parameter, else the label before it in its block ("size"), else "value". */
  function titleFor(block) {
    const input = slot?.getParentInput();
    const label = [...(input?.fieldRow ?? [])].reverse().map((f) => String(f.getValue?.() ?? "").trim()).find((t) => /\p{L}/u.test(t));
    const param = block && catalogue ? slotParam(block, catalogue)?.param?.name : null;
    return param ?? label ?? "value";
  }

  /** The variables the value can use: the loops it is inside of, the block it is in, the names the program sets, the sketch's values. */
  function scopeFor(from) {
    const loops = [];
    const params = [];
    let child = from;
    for (let p = from.getParent(); p; child = p, p = p.getParent()) {
      const inBody = p.getInputWithBlock(child)?.type === STATEMENT;
      if (inBody && [typeOf("count"), typeOf("count_by"), typeOf("for_each")].includes(p.type)) loops.push(p.getFieldValue("VAR"));
      if (inBody && p.type === typeOf("def")) params.push(...p.getFieldValue("PARAMS").split(",").map((n) => n.trim()).filter(Boolean));
    }
    const globals = workspace.getAllBlocks(false)
      .filter((b) => [typeOf("set"), typeOf("change"), typeOf("subtract")].includes(b.type)).map((b) => b.getFieldValue("VAR"));
    return variablesInScope({ loops, params, globals: [...globals, ...moduleNames(topStacks(workspace))] });
  }

  function specFor() {
    const block = target;
    const number = block?.type === typeOf("number");
    const value = number ? Number(block.getFieldValue("NUM")) : null;
    const editor = number && catalogue ? numberEditor(block, catalogue) : { key: "plain" };
    const range = editor.key === "angle" ? { low: 0, high: 360, step: 1 } : editor.low !== undefined ? { low: editor.low, high: editor.high, step: editor.step } : null;
    return {
      title: titleFor(block),
      kind: number ? "number" : "expression",
      value: Number.isFinite(value) ? value : null,
      valueText: block ? textOf(block) : "empty",
      range,
      variables: scopeFor(block ?? slot.getSourceBlock()),
      recent: recent.list(),
      on: {
        number: setNumber,
        variable: setVariable,
        operator: setOperator,
        newName: newVariable,
        more: openValueList,
        done: close,
      },
    };
  }

  /** The value block in the slot is replaced by one made from `state` (the old one goes; a shadow under it comes back if the new one goes). */
  function replace(state) {
    if (!slot) return null;
    const old = target;
    const block = Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
    if (old && !old.isShadow()) old.dispose(false);
    slot.connect(block.outputConnection);
    target = block;
    return block;
  }

  function setNumber(n) {
    if (target?.type === typeOf("number")) target.setFieldValue(String(n), "NUM");
    else {
      replace({ type: typeOf("number"), fields: { NUM: String(n) } });
      sheet.update(specFor());
    }
  }

  function setVariable(entry) {
    const sketch = entry.group === "sketch";
    const type = typeOf(sketch ? "sketch_value" : "variable");
    const field = sketch ? "WHAT" : "VAR";
    if (target?.type === type) target.setFieldValue(entry.name, field);
    else replace({ type, fields: { [field]: entry.name } });
    sheet.update(specFor());
  }

  /** [old] op [ ]: the slot becomes a sum, the old block its left side, and the sheet goes on to the right side. */
  function setOperator(op) {
    if (!target) return;
    const old = Blockly.serialization.blocks.save(target, { addCoordinates: false, addNextBlocks: false, saveIds: false });
    const arith = replace(wrapInOperator(op, old));
    if (!arith) return;
    target = arith.getInputTargetBlock("B");
    slot = arith.getInput("B").connection;
    startValue = null;
    sheet.update(specFor());
  }

  function newVariable(text) {
    const names = workspace.getAllBlocks(false).filter((b) => b.type === typeOf("set")).map((b) => b.getFieldValue("VAR"));
    const answer = checkName(text, names);
    if (!answer.ok) return answer;
    addVariable(workspace, answer.name);
    setVariable({ name: answer.name, group: "global" });
    return answer;
  }

  function begin(block, connection) {
    close();
    onOpen();
    Blockly.Events.setGroup(true);
    target = block;
    slot = connection;
    const spec = specFor();
    startValue = spec.value;
    sheet = openSheet(host, spec);
    requestAnimationFrame(() => reveal(block ?? connection.getSourceBlock()));
  }

  /** "Other blocks" in the sheet: the list of values; the one chosen goes into the slot. */
  function openValueList() {
    const keep = target;
    const keepSlot = slot;
    closeList();
    list = openBlockList(host, {
      rows: rowsFor(catalogue, (def) => def.kind === "value"),
      onChoose: (row) => {
        closeList();
        if (!sheet || (keep && keep.isDeadOrDying())) return;
        target = keep;
        slot = keepSlot;
        const block = replace(toolboxBlock(row.type));
        if (block) sheet.update(specFor());
      },
      onClose: closeList,
    });
  }

  /** A tap on a value block in a slot: the sheet opens for it. A new tap while a sheet is open ends that sheet's step. */
  function openValue(block) {
    begin(block, block.outputConnection.targetConnection);
  }

  /** A tap on an empty slot (a value input with nothing in it): the sheet opens for it, and what is chosen goes in. */
  function openEmpty(connection) {
    begin(null, connection);
  }

  /** A tap on the name of a variable in a statement (set [x] to ...): the variables, and a new one. */
  function openName(block, field) {
    close();
    onOpen();
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
        done: close,
      },
    });
    sheet = openSheet(host, spec());
    requestAnimationFrame(() => reveal(block));
  }

  return {
    openValue, openEmpty, openName, close,
    isOpen: () => !!sheet,
    get root() { return sheet?.root ?? null; },
  };
}
