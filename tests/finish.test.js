// A text field's editor that closes says the field's value once more (editor/blocks/finish.js): after Escape put the old
// value back with no event, the Python must follow the block, not the half-typed text.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { generator } from "../editor/generator/python.js";

registerBlocks({});

test("closing a text field's editor fires one intermediate change with the value it now has", async () => {
  const workspace = new Blockly.Workspace();
  try {
    const call = workspace.newBlock(typeOf("call"));
    call.setFieldValue("rotate", "NAME");
    const seen = [];
    workspace.addChangeListener((event) => seen.push(event));
    const field = call.getField("NAME");
    // what typing does: intermediate changes, which already rewrite the Python
    Blockly.Events.fire(new (Blockly.Events.get(Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE))(call, "NAME", "rotate", "circ"));
    // what Escape does: the old value, with no event; then the editor closes
    field.setValue("rotate", false);
    field.onFinishEditing_(field.getValue());
    await new Promise((resolve) => setTimeout(resolve, 10));     // Blockly fires events on the next tick
    const last = seen.at(-1);
    assert.equal(last.type, Blockly.Events.BLOCK_FIELD_INTERMEDIATE_CHANGE);
    assert.equal(last.blockId, call.id);
    assert.equal(last.newValue, "rotate");
    assert.match(generator.workspaceToCode(workspace), /rotate\(\)/);
  } finally {
    workspace.dispose();
  }
});

test("a field on no block, or with events off, fires nothing", () => {
  const workspace = new Blockly.Workspace();
  try {
    const block = workspace.newBlock(typeOf("number"));
    const field = block.getField("NUM");
    let fired = 0;
    workspace.addChangeListener(() => fired++);
    Blockly.Events.disable();
    try {
      field.onFinishEditing_(field.getValue());
    } finally {
      Blockly.Events.enable();
    }
    assert.equal(fired, 0);
  } finally {
    workspace.dispose();
  }
});
