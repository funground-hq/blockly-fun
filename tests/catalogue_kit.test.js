// BF-6: kit blocks in the name list (Funground_Calls_Note.md, section 5), and the attribute block (BF-D-037) with a
// catalogue. A name with a kit block is marked "has its own block"; choosing it puts the kit block in the place of the
// general block, but only where the slots map one to one. The attribute block's list is the object's properties.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { NamePanel } from "../editor/catalogue/panel.js";
import { kitFor } from "../editor/catalogue/kit.js";
import { lookupEntry, refreshCall } from "../editor/catalogue/call_block.js";
import { FieldCatalogueName } from "../editor/catalogue/field.js";
import { TypeTracker } from "../editor/catalogue/types.js";
import { generator } from "../editor/generator/python.js";
import { completions } from "./catalogue_support.js";

const catalogue = createCatalogue(completions, { helpBase: "https://example.org/docs/" });
const F = { kind: "f" };
const klass = (name) => ({ kind: "class", name });

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

async function withWorkspaceAsync(settings, fn) {
  registerBlocks(settings);
  const workspace = new Blockly.Workspace();
  try {
    return await fn(workspace);
  } finally {
    workspace.dispose();
    registerBlocks({});
  }
}

const noIds = (json) => JSON.parse(JSON.stringify(json, (key, value) => (key === "id" ? undefined : value)));
const variable = (name) => ({ shadow: { type: typeOf("variable"), fields: { VAR: name } } });
const num = (n) => ({ type: typeOf("number"), fields: { NUM: String(n) } });
const text = (t) => ({ type: typeOf("text"), fields: { TEXT: t } });
const callJson = (type, name, object, args = [], inputs = {}) => ({
  type: typeOf(type), fields: { NAME: name }, extraState: { args }, inputs: { OBJ: variable(object), ...inputs },
});
const attributeJson = (name, object) => ({ type: typeOf("attribute"), fields: { NAME: name }, inputs: { OBJ: variable(object) } });

/** Choose `name` in the list of the block (as the field does) and give the Python of the whole workspace. */
function choose(block, name) {
  block.setFieldValue(name, "NAME");
  block.getField("NAME").context.onChoose(block, lookupEntry(block, catalogue));
}
const python = (workspace) => generator.workspaceToCode(workspace);

// ---------------------------------------------------------------------------------------------------------------
// The rows

test("a name with a kit block has one: library functions and the values of f, never a method", () => {
  for (const [owner, name, block] of [["f", "circle", "circle"], ["f", "no_stroke", "no_outline"], ["f", "stroke_width", "outline_width"],
    ["f", "text_size", "text_size"], ["f", "text_align", "text_align"], ["f", "key", "sketch_value"],
    ["f", "width", "sketch_value"], ["sound", "melody", "sound_melody"], ["sound", "tone", "sound_tone"],
    ["sound", "microphone", "sound_microphone"], ["camera", "open", "camera_open"], ["ml", "pose", "ml_pose"],
    ["ml", "teach", "ml_teach"]]) {
    const entry = owner === "f" ? (catalogue.member(F, name) ?? catalogue.property(F, name)) : catalogue.member({ kind: "library", name: owner }, name);
    assert.equal(kitFor(entry).def.type, block, `${owner}.${name}`);
  }
  assert.equal(kitFor(catalogue.member({ kind: "library", name: "ml" }, "person")), null, "no block for it: a call block");
  assert.equal(kitFor(catalogue.member(F, "translate")), null);
  assert.equal(kitFor(catalogue.member(klass("Sound"), "play")), null, "a method never has a kit block (BF-D-035)");
  assert.equal(kitFor(catalogue.member(klass("Slider"), "value")), null);
});

test("the panel marks a row that has its own block, and only that row", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const panel = new NamePanel({
    document: dom.window.document, catalogue, scope: catalogue.scope(F), kitOf: kitFor, onChoose: () => {},
  });
  const marked = (name) => {
    panel.setQuery(name);
    const row = panel.rows.find((r) => r.entry.name === name);
    return !!row.element.querySelector(".bf-cat-kit");
  };
  assert.equal(marked("circle"), true);
  assert.equal(marked("text_align"), true, "marked even where the block is only marked, not put in");
  assert.equal(marked("translate"), false);
  panel.setQuery("circle");
  assert.equal(panel.rows.find((r) => r.entry.name === "circle").element.querySelector(".bf-cat-kit").textContent, "has its own block");
  // without a kitOf nothing is marked
  const plain = new NamePanel({ document: dom.window.document, catalogue, scope: catalogue.scope(F), onChoose: () => {} });
  assert.equal(plain.element.querySelector(".bf-cat-kit"), null);
});

// ---------------------------------------------------------------------------------------------------------------
// Choosing puts the kit block in

test("choosing a name with a kit block that fits puts the kit block in the place of the call block", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const stack = Blockly.serialization.blocks.append({
      type: typeOf("say"), extraState: { items: 1 }, inputs: { ARG0: { shadow: text("a") } },
      next: { block: { ...callJson("method", "name", "f"), next: { block: { type: typeOf("say"), extraState: { items: 1 }, inputs: { ARG0: { shadow: text("b") } } } } } },
    }, workspace);
    const call = stack.getNextBlock();
    call.setCommentText("my note");
    choose(call, "circle");
    assert.equal(call.disposed || call.isDeadOrDying?.() || !workspace.getBlockById(call.id), true, "the general block is gone");
    const kit = stack.getNextBlock();
    assert.equal(kit.type, typeOf("circle"));
    assert.equal(kit.getNextBlock().type, typeOf("say"), "the block after it stays after it");
    assert.equal(kit.getCommentText(), "my note");
    assert.equal(python(workspace), "import funground as f\n\nprint(\"a\")\n# my note\nf.circle(320, 200, 80)\nprint(\"b\")\nf.show()\n");
  });
});

test("the arguments already in the call move over, one to one", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const call = Blockly.serialization.blocks.append(
      callJson("method", "circle", "f", ["p", "p", "p"], { ARG0: { block: num(1) }, ARG1: { shadow: num(2) }, ARG2: { block: { ...callJson("method_value", "width", "g") } } }), workspace);
    choose(call, "circle");
    const kit = workspace.getTopBlocks(true)[0];
    assert.equal(kit.type, typeOf("circle"));
    assert.equal(python(workspace), "import funground as f\n\nf.circle(1, 2, g.width())\nf.show()\n");
  });
});

test("a value kit block takes the place of a value, inside its slot", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const set = Blockly.serialization.blocks.append({
      type: typeOf("set"), fields: { VAR: "body" },
      inputs: { VALUE: { block: callJson("method_value", "name", "ml") } },
    }, workspace);
    choose(set.getInputTargetBlock("VALUE"), "pose");
    assert.equal(set.getInputTargetBlock("VALUE").type, typeOf("ml_pose"));
    assert.equal(python(workspace), "from funground import ml\n\nbody = ml.pose(cam)\n");
  });
  withWorkspace({ catalogue }, (workspace) => {
    const set = Blockly.serialization.blocks.append({
      type: typeOf("set"), fields: { VAR: "m" },
      inputs: { VALUE: { block: callJson("method_value", "name", "sound") } },
    }, workspace);
    choose(set.getInputTargetBlock("VALUE"), "microphone");
    assert.equal(python(workspace), "from funground import sound\n\nm = sound.microphone()\n");
  });
});

test("the swap is one step to undo", async () => {
  await withWorkspaceAsync({ catalogue }, async (workspace) => {
    const call = Blockly.serialization.blocks.append(callJson("method", "name", "f"), workspace);
    await new Promise((resolve) => setTimeout(resolve, 5));
    workspace.clearUndo();
    choose(call, "no_fill");
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(workspace.getTopBlocks(true)[0].type, typeOf("no_fill"));
    workspace.undo(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const back = workspace.getTopBlocks(true);
    assert.deepEqual(back.map((b) => b.type), [typeOf("method")]);
    assert.equal(back[0].getFieldValue("NAME"), "no_fill", "the general block is back as it was before the swap");
  });
});

test("where the slots do not map one to one, the row is only marked and the call block is built as for any name", () => {
  withWorkspace({ catalogue }, (workspace) => {
    // text_align: a dropdown where the call has an argument
    const align = Blockly.serialization.blocks.append(callJson("method", "name", "f"), workspace);
    choose(align, "text_align");
    assert.equal(align.type, typeOf("method"));
    assert.equal(python(workspace).split("\n").at(-2), "f.text_align(\"left\")");
  });
  withWorkspace({ catalogue }, (workspace) => {
    // a keyword argument, or a different number of arguments, would be lost
    const keyword = Blockly.serialization.blocks.append(callJson("method", "circle", "f", ["k"], { ARG0: { block: num(7) } }), workspace);
    keyword.getField("KW0").setValue("extra");
    choose(keyword, "circle");
    assert.equal(keyword.type, typeOf("method"));
    const two = Blockly.serialization.blocks.append(callJson("method", "circle", "f", ["p", "p"], { ARG0: { block: num(1) }, ARG1: { block: num(2) } }), workspace);
    choose(two, "circle");
    assert.equal(two.type, typeOf("method"));
  });
  withWorkspace({ catalogue }, (workspace) => {
    // a value kit block cannot be a statement, and a statement kit block cannot be a value
    const statement = Blockly.serialization.blocks.append(callJson("method", "name", "sound"), workspace);
    choose(statement, "melody");
    assert.equal(statement.type, typeOf("method"));
    const value = Blockly.serialization.blocks.append(callJson("method_value", "name", "f"), workspace);
    choose(value, "circle");
    assert.equal(value.type, typeOf("method_value"));
    // the object is not the bare name the kit stands for
    const other = Blockly.serialization.blocks.append(callJson("method", "name", "g"), workspace);
    other.setFieldValue("circle", "NAME");
    other.getField("NAME").context.onChoose(other, catalogue.member(F, "circle"));
    assert.equal(other.type, typeOf("method"));
  });
});

test("a name of a method keeps the call block; ml.teach fits with its two slots", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const teach = Blockly.serialization.blocks.append(callJson("method", "name", "ml"), workspace);
    choose(teach, "teach");
    assert.equal(workspace.getTopBlocks(true)[0].type, typeOf("ml_teach"));
    assert.equal(python(workspace), "from funground import ml\n\nml.teach(\"thumbs up\", cam)\n");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The attribute block

test("an attribute list holds properties and values, never methods", () => {
  const names = (type, properties = true) => catalogue.scope(type, { properties }).groups.flatMap((g) => g.entries.map((e) => e.name));
  assert.ok(names(klass("Body")).includes("nose"));
  assert.ok(names(klass("Camera")).includes("width"));
  assert.ok(!names(klass("Camera")).includes("picture"), "picture() is a method");
  assert.ok(names(klass("Camera"), false).includes("picture") && !names(klass("Camera"), false).includes("width"), "a call list is the other way round");
  assert.ok(names(F).includes("key") && names(F).includes("mouse_x") && !names(F).includes("circle"));
  assert.deepEqual(names({ kind: "library", name: "sound" }), [], "a library has functions only");
  const unknown = catalogue.scope(null, { properties: true });
  assert.equal(unknown.known, false);
  assert.ok(unknown.groups.some((g) => g.title === "Body" && g.entries.some((e) => e.name === "nose")));
  assert.ok(!unknown.groups.some((g) => g.entries.some((e) => e.raw.kind === "method")));
});

test("the attribute block makes object.name, has no gear, and saves nothing but its name and object", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(attributeJson("nose", "body"), workspace);
    assert.ok(block.getField("NAME") instanceof FieldCatalogueName);
    assert.equal(block.saveExtraState(), null);
    assert.equal(block.mutator, undefined);
    assert.equal(generator.blockToCode(block)[0], "body.nose");
    assert.deepEqual(noIds(Blockly.serialization.blocks.save(block)),
      { type: typeOf("attribute"), fields: { NAME: "nose" }, inputs: { OBJ: { shadow: { type: typeOf("variable"), fields: { VAR: "body" } } } } });
  });
  withWorkspace({}, (workspace) => {
    const block = Blockly.serialization.blocks.append(attributeJson("nose", "body"), workspace);
    assert.ok(!(block.getField("NAME") instanceof FieldCatalogueName), "without a catalogue a plain text field");
    assert.equal(generator.blockToCode(block)[0], "body.nose");
  });
});

test("the attribute block knows its property by the object's type: the name as spoken, the tooltip and Help", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const set = Blockly.serialization.blocks.append({
      type: typeOf("set"), fields: { VAR: "body" },
      inputs: { VALUE: { block: { type: typeOf("ml_pose"), inputs: { SRC: variable("cam") } } } },
    }, workspace);
    const eye = Blockly.serialization.blocks.append(attributeJson("left_eye", "body"), workspace);
    const x = Blockly.serialization.blocks.append({
      type: typeOf("attribute"), fields: { NAME: "x" },
      inputs: { OBJ: { block: attributeJson("nose", "body") } },
    }, workspace);
    workspace.bfTypes = new TypeTracker(workspace, catalogue);
    assert.deepEqual(workspace.bfTypes.objectType(eye), klass("Body"), "ml.pose(cam) is a Body: the kit block gives its type");
    assert.deepEqual(workspace.bfTypes.objectType(x), klass("Vector"), "body.nose is a Vector");
    refreshCall(eye);
    assert.equal(eye.getField("NAME").getText(), "left eye");
    assert.equal(eye.getField("NAME").getValue(), "left_eye");
    assert.equal(lookupEntry(eye, catalogue, true).owner.name, "Body");
    assert.ok(eye.tooltip().startsWith("left_eye"));
    workspace.bfTypes.dispose();
    set.dispose();
  });
});

test("an attribute of an unknown object is looked up only if one class has a property of that name", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const block = Blockly.serialization.blocks.append(attributeJson("nose", "thing"), workspace);
    assert.equal(lookupEntry(block, catalogue)?.owner.name, "Body", "only Body has a property nose");
    block.setFieldValue("score", "NAME");
    assert.equal(lookupEntry(block, catalogue), null, "score is a property of several classes: no guess");
    block.setFieldValue("picture", "NAME");
    assert.equal(lookupEntry(block, catalogue), null, "picture is a method, not an attribute");
  });
});

test("choosing an attribute row that is a sketch value puts the sketch value in", () => {
  withWorkspace({ catalogue }, (workspace) => {
    const set = Blockly.serialization.blocks.append({
      type: typeOf("set"), fields: { VAR: "k" }, inputs: { VALUE: { block: attributeJson("name", "f") } },
    }, workspace);
    const attribute = set.getInputTargetBlock("VALUE");
    attribute.setFieldValue("key", "NAME");
    attribute.getField("NAME").context.onChoose(attribute, catalogue.property(F, "key"));
    const value = set.getInputTargetBlock("VALUE");
    assert.equal(value.type, typeOf("sketch_value"));
    assert.equal(value.getFieldValue("WHAT"), "key");
    assert.equal(python(workspace), "import funground as f\n\nk = f.key\nf.show()\n");
  });
  withWorkspace({ catalogue }, (workspace) => {
    // an attribute with no kit block is left as it is; there are no slots to build
    const set = Blockly.serialization.blocks.append({
      type: typeOf("set"), fields: { VAR: "k" }, inputs: { VALUE: { block: attributeJson("name", "f") } },
    }, workspace);
    const attribute = set.getInputTargetBlock("VALUE");
    attribute.setFieldValue("ground", "NAME");
    attribute.getField("NAME").context.onChoose(attribute, catalogue.property(F, "ground"));
    assert.equal(set.getInputTargetBlock("VALUE").type, typeOf("attribute"));
    assert.equal(python(workspace), "k = f.ground\n");
  });
});
