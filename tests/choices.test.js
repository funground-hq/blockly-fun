// BF-15 round 4 (BF-D-051), the values audit: a text in a slot whose choices the catalogue lists (a text style is "normal",
// "bold", "italic" or "bold_italic") is a dropdown of those words, not a box to type in. It is the same text, so the saved JSON
// and the Python do not change. It is done once, from the catalogue's `options`, for every call; no block is a special case.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { generator } from "../editor/generator/python.js";
import { EditorTracker } from "../editor/editors/index.js";
import { ColourNameField } from "../editor/editors/fields.js";
import { positionalParams } from "../editor/catalogue/slots.js";
import { completions } from "./catalogue_support.js";

const catalogue = createCatalogue(completions);

function withEditors(fn, { editors = true } = {}) {
  registerBlocks({ catalogue: completions });
  const workspace = new Blockly.Workspace();
  const tracker = editors ? new EditorTracker(workspace, catalogue) : null;
  try {
    return fn(workspace, tracker);
  } finally {
    tracker?.dispose();
    workspace.dispose();
    registerBlocks({});
  }
}

const noIds = (json) => JSON.parse(JSON.stringify(json, (key, value) => (key === "id" ? undefined : value)));
const saved = (workspace) => noIds(Blockly.serialization.workspaces.save(workspace));
const variable = (name) => ({ shadow: { type: typeOf("variable"), fields: { VAR: name } } });
const text = (t) => ({ shadow: { type: typeOf("text"), fields: { TEXT: t } } });
const call = (name, args, object = "f") => ({
  type: typeOf("method"), fields: { NAME: name }, extraState: { args: args.map(() => "p") },
  inputs: { OBJ: variable(object), ...Object.fromEntries(args.map((arg, i) => ["ARG" + i, arg])) },
});
const add = (workspace, json) => Blockly.serialization.blocks.append(json, workspace);
const argField = (block, i = 0) => block.getInputTargetBlock("ARG" + i).getField("TEXT");
const wordsOf = (field) => field.getOptions(true).map((o) => o[1]);

test("a text style is a dropdown of the four styles, and the value is the same text", () => {
  withEditors((workspace, editors) => {
    const style = add(workspace, call("text_style", [text("bold")]));
    editors.update();
    const field = argField(style);
    assert.ok(field instanceof Blockly.FieldDropdown, "a dropdown, not a text box");
    assert.deepEqual(wordsOf(field), ["normal", "bold", "italic", "bold_italic"]);
    assert.equal(field.getValue(), "bold");
    field.setValue("italic");
    assert.match(generator.workspaceToCode(workspace), /f\.text_style\("italic"\)/);
  });
});

test("the saved JSON and the Python are those of the plain block", () => {
  const program = [call("text_style", [text("bold_italic")]), call("blend_mode", [text("multiply")]), call("cursor", [text("hand")])];
  const run = (editors) => withEditors((workspace, tracker) => {
    for (const json of program) add(workspace, json);
    tracker?.update();
    return { json: saved(workspace), python: generator.workspaceToCode(workspace) };
  }, { editors });
  assert.deepEqual(run(true), run(false));
});

test("a word that is not in the list keeps its plain box, so a program is never changed or refused", () => {
  withEditors((workspace, editors) => {
    const style = add(workspace, call("text_style", [text("Bold")]));
    const empty = add(workspace, call("text_style", [text("")]));
    editors.update();
    assert.ok(!(argField(style) instanceof Blockly.FieldDropdown), "Bold is not bold");
    assert.ok(!(argField(empty) instanceof Blockly.FieldDropdown));
    assert.equal(argField(style).getValue(), "Bold");
    // typed to a word in the list, it becomes a dropdown (the slot is looked at again after a change)
    argField(style).setValue("italic");
    editors.update();
    assert.ok(argField(style) instanceof Blockly.FieldDropdown);
  });
});

test("a slot with no list of choices stays a text box, and a colour slot is still the grid of colours", () => {
  withEditors((workspace, editors) => {
    const words = add(workspace, call("text", [text("hello"), { shadow: { type: typeOf("number"), fields: { NUM: "1" } } }]));
    const fill = add(workspace, call("fill", [text("tomato")]));
    editors.update();
    assert.ok(!(argField(words) instanceof Blockly.FieldDropdown), "free text");
    assert.ok(argField(fill) instanceof ColourNameField, "a colour is a colour, not one of a list of words");
  });
});

test("the second slot too, and a keyword argument: text_align has a list for each of its two", () => {
  withEditors((workspace, editors) => {
    const align = add(workspace, call("text_align", [text("center"), text("baseline")]));
    editors.update();
    assert.deepEqual(wordsOf(argField(align, 0)), ["left", "center", "right", "justify"]);
    assert.deepEqual(wordsOf(argField(align, 1)), ["top", "center", "baseline", "bottom"]);
    const keyword = add(workspace, {
      type: typeOf("method"), fields: { NAME: "text_align", KW1: "vertical" }, extraState: { args: ["p", "k"] },
      inputs: { OBJ: variable("f"), ARG0: text("left"), ARG1: text("bottom") },
    });
    keyword.getField("KW1").setValue("vertical");
    editors.update();
    assert.deepEqual(wordsOf(argField(keyword, 1)), ["top", "center", "baseline", "bottom"]);
  });
});

test("the drawing blocks of a kit get the same: the choices of a template's slot", () => {
  // no kit block of the drawing set has a text slot with choices (text_align's own block is a dropdown already), so the rule is
  // tried on the kit slots that are text: they stay text boxes
  withEditors((workspace, editors) => {
    const write = add(workspace, { type: typeOf("write"), inputs: { TEXT: text("hello"), X: { shadow: { type: typeOf("number"), fields: { NUM: "1" } } }, Y: { shadow: { type: typeOf("number"), fields: { NUM: "2" } } } } });
    editors.update();
    assert.ok(!(write.getInputTargetBlock("TEXT").getField("TEXT") instanceof Blockly.FieldDropdown));
  });
});

test("every parameter of funground's catalogue that lists its choices gets the dropdown, for each of its functions", () => {
  const found = [];
  for (const entry of catalogue.raw.names ?? []) {
    if (!entry.options) continue;
    const parsed = catalogue.member({ kind: "f" }, entry.name);
    if (!parsed) continue;
    const params = positionalParams(parsed);
    for (const [name, choices] of Object.entries(entry.options)) {
      const position = params.findIndex((p) => p.name === name);
      assert.ok(position >= 0, `${entry.name}: ${name} is a positional parameter`);
      withEditors((workspace, editors) => {
        const args = params.map((p, i) => text(i === position ? choices[0].word : "x"));
        const block = add(workspace, call(entry.name, args.slice(0, position + 1)));
        editors.update();
        const field = argField(block, position);
        assert.ok(field instanceof Blockly.FieldDropdown, `${entry.name}(${name}) is a dropdown`);
        assert.deepEqual(wordsOf(field), choices.map((c) => c.word), `${entry.name}(${name})'s words`);
        found.push(`${entry.name}.${name}`);
      });
    }
  }
  // the fixture lists these (text_align twice, text_style, key_down, stroke_cap, blend_mode, cursor, filter, stroke_join, apply_filter)
  assert.deepEqual(found.sort(), [
    "apply_filter.kind", "blend_mode.mode", "cursor.kind", "filter.kind", "key_down.key", "stroke_cap.cap", "stroke_join.join",
    "text_align.horizontal", "text_align.vertical", "text_style.style",
  ]);
});

test("a parameter typed as a group of words (CONSTANTS.MODE) is a dropdown of the group's words, from the catalogue's own list", () => {
  const found = [];
  for (const entry of catalogue.raw.names ?? []) {
    if (entry.kind !== "function") continue;
    const parsed = catalogue.member({ kind: "f" }, entry.name);
    for (const match of (entry.detail ?? "").matchAll(/(?:^|[(,])\s*(\w+):\s*CONSTANTS\.(\w+)(?:\s*\|\s*None)?\s*(?=[,)=])/g)) {
      const [, name, group] = match;
      if (entry.options?.[name]) continue;                  // listed with meanings: the test above
      const params = positionalParams(parsed);
      const position = params.findIndex((p) => p.name === name);
      if (position < 0) continue;
      const words = catalogue.constantWords(group);
      assert.ok(words?.length, `${group} has words`);
      withEditors((workspace, editors) => {
        const block = add(workspace, call(entry.name, params.slice(0, position + 1).map((p, i) => text(i === position ? words[0] : "x"))));
        editors.update();
        assert.ok(argField(block, position) instanceof Blockly.FieldDropdown, `${entry.name}(${name}: ${group})`);
        assert.deepEqual(wordsOf(argField(block, position)), words);
      });
      found.push(`${entry.name}.${name}`);
    }
  }
  assert.deepEqual(found.sort(), ["arc.mode", "color_mode.mode", "ellipse_mode.mode", "image_mode.mode", "load_font.provider", "rect_mode.mode", "save.text"]);
  assert.deepEqual(catalogue.constantWords("MODE"), ["corner", "corners", "center", "radius"]);
  assert.equal(catalogue.constantWords("NOPE"), null);
});

test("a parameter that also takes a number or any text (int | CONSTANTS.PAGE | str) is not a list of choices", () => {
  withEditors((workspace, editors) => {
    const size = add(workspace, call("size", [text("A4")]));
    const page = add(workspace, call("page_size", [text("A4")]));
    editors.update();
    assert.ok(!(argField(size) instanceof Blockly.FieldDropdown), "f.size(width): a number, a page name or any text");
    assert.ok(!(argField(page) instanceof Blockly.FieldDropdown), "f.page_size(name): a page name or any text");
  });
});
