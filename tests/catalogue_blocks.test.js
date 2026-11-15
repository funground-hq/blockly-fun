// BF-2: the catalogue on the two general call blocks (Funground_Calls_Note.md, sections 5 and 7).
//
// The invariant: with a catalogue the blocks make the same Python and save the same JSON as without one. Labels,
// tooltips and the list are only how a block is shown.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { FieldCatalogueName } from "../editor/catalogue/field.js";
import { refreshCall, lookupEntry } from "../editor/catalogue/call_block.js";
import { TypeTracker } from "../editor/catalogue/types.js";
import { generator } from "../editor/generator/python.js";
import { SNIPPETS } from "./snippets.js";
import { completions, convertAll } from "./catalogue_support.js";

const catalogue = createCatalogue(completions, { helpBase: "https://example.org/docs/" });

/** A workspace with these settings, for the length of fn; the plain registration comes back after. */
function withWorkspace(settings, fn) {
  registerBlocks(settings);
  const workspace = new Blockly.Workspace();
  try {
    return fn(workspace);
  } finally {
    workspace.dispose();
    registerBlocks({});
  }
}

const noIds = (json) => JSON.parse(JSON.stringify(json, (key, value) => (key === "id" ? undefined : value)));
const saved = (workspace) => noIds(Blockly.serialization.workspaces.save(workspace));

const variable = (name) => ({ shadow: { type: typeOf("variable"), fields: { VAR: name } } });
const methodJson = (name, object = "f", args = [], inputs = {}) => ({
  type: typeOf("method"), fields: { NAME: name }, extraState: { args },
  inputs: { OBJ: variable(object), ...inputs },
});

// ---------------------------------------------------------------------------------------------------------------
// The invariant

const converted = convertAll(SNIPPETS);

test("every snippet: the same Python and the same saved JSON with and without a catalogue", () => {
  const run = (settings) => withWorkspace(settings, (workspace) => converted.map((result) => {
    assert.ok(result.ok, result.message);
    Blockly.serialization.workspaces.load(result.workspace, workspace);
    return { python: generator.workspaceToCode(workspace), json: saved(workspace) };
  }));
  const plain = run({});
  const withCatalogue = run({ catalogue });
  const wordsPython = run({ catalogue, words: "python" });
  plain.forEach((one, i) => {
    assert.equal(withCatalogue[i].python, one.python, `snippet ${i}: Python`);
    assert.deepEqual(withCatalogue[i].json, one.json, `snippet ${i}: JSON`);
    assert.equal(wordsPython[i].python, one.python, `snippet ${i}: Python, with Python words`);
  });
});

test("a call block from the toolbox has no catalogue behaviour without a catalogue", () => {
  withWorkspace({}, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("text_align"), workspace);
    assert.ok(!(block.getField("NAME") instanceof FieldCatalogueName));
    assert.equal(block.bfSlotLabels, undefined);
    assert.ok(!block.bfCatalogue);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Choosing a name

/** What choosing `name` from the list does to a fresh call block, then the Python and the JSON. */
function chosen(name, object = "f") {
  return withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("name", object), workspace);
    const field = block.getField("NAME");
    assert.ok(field instanceof FieldCatalogueName);
    field.setValue(name);
    field.context.onChoose(block, lookupEntry(block, catalogue));
    return { python: generator.workspaceToCode(workspace), json: saved(workspace) };
  });
}

/** The same block as it is today with that name typed, and the slots filled by hand. */
function typed(name, values, object = "f") {
  return withWorkspace({}, (workspace) => {
    const inputs = Object.fromEntries(values.map((v, i) => ["ARG" + i, { shadow: v }]));
    Blockly.serialization.blocks.append(methodJson(name, object, values.map(() => "p"), inputs), workspace);
    return { python: generator.workspaceToCode(workspace), json: saved(workspace) };
  });
}

const num = (n) => ({ type: typeOf("number"), fields: { NUM: String(n) } });
const text = (t) => ({ type: typeOf("text"), fields: { TEXT: t } });

test("choosing a name builds its required slots, with values that run", () => {
  assert.match(chosen("text_align").python, /f\.text_align\("left"\)\n$/);
  assert.match(chosen("circle").python, /f\.circle\(100, 100, 100\)\n$/);
  assert.match(chosen("fill").python, /f\.fill\("tomato"\)\n$/);
  assert.match(chosen("no_stroke").python, /f\.no_stroke\(\)\n$/);
  assert.match(chosen("load_image").python, /f\.load_image\(None\)\n$/, "an empty slot makes None, which Python accepts");
});

test("choosing a name gives exactly what the same block is today with that name typed", () => {
  for (const [name, values] of [["text_align", [text("left")]], ["circle", [num(100), num(100), num(100)]], ["fill", [text("tomato")]]]) {
    assert.deepEqual(chosen(name), typed(name, values), name);
  }
});

test("optional arguments are not added, and slots the learner filled stay", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(
      methodJson("text_align", "f", ["p", "k"], { ARG0: { block: text("right") }, ARG1: { block: text("top") } }), workspace);
    block.getField("KW1").setValue("vertical");
    const field = block.getField("NAME");
    field.context.onChoose(block, lookupEntry(block, catalogue));
    assert.equal(generator.workspaceToCode(workspace).split("\n").at(-2), "f.text_align(\"right\", vertical=\"top\")");
    assert.deepEqual(block.bfState.args, ["p", "k"]);
  });
  withWorkspace({ catalogue }, (workspace) => {
    // a keyword argument moves along when a positional slot is added before it
    const block = Blockly.serialization.blocks.append(
      methodJson("circle", "f", ["k"], { ARG0: { block: num(7) } }), workspace);
    block.getField("KW0").setValue("extra");
    block.getField("NAME").context.onChoose(block, lookupEntry(block, catalogue));
    assert.equal(generator.workspaceToCode(workspace).split("\n").at(-2), "f.circle(100, 100, 100, extra=7)");
  });
});

test("a learner may type any name: the list never refuses it", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("my_own_thing", "f"), workspace);
    assert.equal(generator.workspaceToCode(workspace).split("\n").at(-2), "f.my_own_thing()");
    assert.equal(lookupEntry(block, catalogue), null);
    assert.equal(block.getField("NAME").getText(), "my_own_thing", "an unknown name shows as typed");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Labels, tooltip, help

test("labels: the slots say their parameter, the name says its words, none of it is saved", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("circle", "f", ["p", "p", "p"]), workspace);
    refreshCall(block);
    assert.deepEqual(block.bfSlotLabels.map((s) => s.field.getValue()), ["x", "y", "diameter"]);
    assert.equal(block.getField("NAME").getText(), "circle");
    const align = Blockly.serialization.blocks.append(methodJson("text_align", "f", ["p"]), workspace);
    refreshCall(align);
    assert.equal(align.getField("NAME").getText(), "text align", "underscores to spaces");
    assert.equal(align.getField("NAME").getValue(), "text_align", "the value is the real name");
    assert.equal(align.bfSlotLabels[0].field.getValue(), "horizontal");
    assert.equal(JSON.stringify(Blockly.serialization.blocks.save(align)).includes("horizontal"), false);
  });
});

test("labels: an unknown name keeps the plain words, and Python words keep Python", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("my_own_thing", "f", ["p", "p"]), workspace);
    refreshCall(block);
    assert.deepEqual(block.bfSlotLabels.map((s) => s.field.getValue()), ["with", ","]);
  });
  withWorkspace({ catalogue, words: "python" }, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("text_align", "f", ["p"]), workspace);
    refreshCall(block);
    assert.equal(block.getField("NAME").getText(), "text_align");
    assert.equal(block.bfSlotLabels, undefined, "Python words keep Python: no slot labels");
  });
});

test("tooltip is the signature and the plain sentence; Help is the reference entry", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("text_align", "f", ["p"]), workspace);
    refreshCall(block);
    const tip = block.tooltip();
    assert.match(tip, /^text_align\(horizontal, vertical=None\)\n/);
    assert.ok(tip.length > "text_align(horizontal, vertical=None)\n".length);
    assert.equal(block.helpUrl, "https://example.org/docs/reference/API.md#fn-text_align");
  });
  withWorkspace({ catalogue: createCatalogue(completions) }, (workspace) => {
    const block = Blockly.serialization.blocks.append(methodJson("text_align", "f", ["p"]), workspace);
    refreshCall(block);
    assert.ok(!block.helpUrl, "no helpBase, no Help");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The object's type reaches the block

test("a call on a variable uses the variable's class: its list, its labels", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const set = Blockly.serialization.blocks.append({
      type: typeOf("set"), fields: { VAR: "picker" },
      inputs: { VALUE: { block: { ...methodJson("create_slider", "f", ["p", "p"], { ARG0: { shadow: num(0) }, ARG1: { shadow: num(10) } }), type: typeOf("method_value") } } },
    }, workspace);
    const call = Blockly.serialization.blocks.append(methodJson("text", "picker"), workspace);
    workspace.bfTypes = new TypeTracker(workspace, catalogue);
    assert.deepEqual(workspace.bfTypes.objectType(call), { kind: "class", name: "Slider" });
    assert.equal(lookupEntry(call, catalogue, true).owner.name, "Slider");
    refreshCall(call);
    assert.match(call.tooltip(), /^text\(\)/);
    workspace.bfTypes.dispose();
    set.dispose();
  });
});

test("types are worked out at most once per frame, however many change events come", async () => {
  registerBlocks({ catalogue });
  const workspace = new Blockly.Workspace();
  try {
    let refreshed = 0;
    const tracker = new TypeTracker(workspace, catalogue, () => { refreshed++; });
    tracker.update();
    const before = tracker.updates;
    for (let i = 0; i < 20; i++) Blockly.serialization.blocks.append(methodJson("circle", "f"), workspace);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(tracker.updates - before, 1, "one walk for twenty changes");
    assert.equal(refreshed, 1);
    tracker.dispose();
  } finally {
    workspace.dispose();
    registerBlocks({});
  }
});
