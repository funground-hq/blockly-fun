// BF-3: the editors of slots (Funground_Calls_Note.md, section 6; BF-D-002, BF-D-029).
//
// The invariant: a number in a degrees slot, a text in a colour slot and the Python code block take another field, and
// nothing else changes: the same value, the same saved JSON, the same Python.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { generator } from "../editor/generator/python.js";
import { EditorTracker } from "../editor/editors/index.js";
import { ColourNameField } from "../editor/editors/fields.js";
import { FieldAngle, FieldColour, FieldGridDropdown, FieldMultilineInput, FieldSlider } from "../editor/editors/plugins.js";
import { templateOf } from "../editor/editors/slots.js";
import { SNIPPETS } from "./snippets.js";
import { completions, convertAll } from "./catalogue_support.js";

const catalogue = createCatalogue(completions);

/** A workspace with the editors kept true, for the length of fn; the plain registration comes back after. */
function withEditors(fn, { editors = true } = {}) {
  registerBlocks({ catalogue: completions });
  const workspace = new Blockly.Workspace();
  const tracker = editors ? new EditorTracker(workspace, catalogue) : null;
  const done = () => {
    tracker?.dispose();
    workspace.dispose();
    registerBlocks({});
  };
  let result;
  try {
    result = fn(workspace, tracker);
  } catch (error) {
    done();
    throw error;
  }
  if (result && typeof result.then === "function") return result.finally(done);   // a test that waits for frames
  done();
  return result;
}

const noIds = (json) => JSON.parse(JSON.stringify(json, (key, value) => (key === "id" ? undefined : value)));
const saved = (workspace) => noIds(Blockly.serialization.workspaces.save(workspace));
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

const variable = (name) => ({ shadow: { type: typeOf("variable"), fields: { VAR: name } } });
const num = (n) => ({ shadow: { type: typeOf("number"), fields: { NUM: n } } });
const text = (t) => ({ shadow: { type: typeOf("text"), fields: { TEXT: t } } });
const call = (name, args, object = "f") => ({
  type: typeOf("method"), fields: { NAME: name }, extraState: { args: args.map(() => "p") },
  inputs: { OBJ: variable(object), ...Object.fromEntries(args.map((arg, i) => ["ARG" + i, arg])) },
});

const add = (workspace, json) => Blockly.serialization.blocks.append(json, workspace);
const argBlock = (call_, i = 0) => call_.getInputTargetBlock("ARG" + i);
const fieldOf = (block, name) => block.getField(name);
const isPlainNumber = (field) => field instanceof Blockly.FieldTextInput && !(field instanceof Blockly.FieldNumber);

// ---------------------------------------------------------------------------------------------------------------
// Degrees: a dial

test("a number in a degrees slot gets the dial; clockwise from the right, as the canvas turns", () => {
  withEditors((workspace, editors) => {
    const rotate = add(workspace, call("rotate", [num("45")]));
    assert.ok(isPlainNumber(fieldOf(argBlock(rotate), "NUM")), "plain until the editors are worked out");
    editors.update();
    const field = fieldOf(argBlock(rotate), "NUM");
    assert.ok(field instanceof FieldAngle);
    assert.equal(field.clockwise, true);
    assert.equal(field.offset, 0, "zero at 3 o'clock");
    assert.equal(field.getValue(), "45", "the value is still the text");
    assert.equal(field.getText(), "45");
  });
});

test("the swap and its undo: out of the slot is the plain field again, back in is the dial", () => {
  withEditors((workspace, editors) => {
    const rotate = add(workspace, call("rotate", [num("90")]));
    const number = argBlock(rotate);
    editors.update();
    assert.ok(fieldOf(number, "NUM") instanceof FieldAngle);
    number.unplug();
    editors.update();
    assert.ok(isPlainNumber(fieldOf(number, "NUM")), "unplugged: plain");
    assert.equal(fieldOf(number, "NUM").getValue(), "90");
    rotate.getInput("ARG0").connection.connect(number.outputConnection);
    editors.update();
    assert.ok(fieldOf(number, "NUM") instanceof FieldAngle, "plugged in again: the dial");
    assert.equal(fieldOf(number, "NUM").getValue(), "90");
  });
});

test("the events alone move the editors, and a move back (what undo does) brings the first one back", async () => {
  await withEditors(async (workspace) => {
    const rotate = add(workspace, call("rotate", [num("90")]));
    const circle = add(workspace, call("circle", [num("1"), num("2"), num("3")]));
    const number = argBlock(rotate);
    await tick();                          // the editors are worked out in the next frame, with no update() call
    assert.ok(fieldOf(number, "NUM") instanceof FieldAngle);
    circle.getInput("ARG2").connection.connect(number.outputConnection);   // a pixels slot: no dial
    await tick();
    assert.equal(number.getParent().id, circle.id);
    assert.ok(isPlainNumber(fieldOf(number, "NUM")));
    rotate.getInput("ARG0").connection.connect(number.outputConnection);   // undo puts it back like this
    await tick();
    assert.equal(number.getParent().id, rotate.id);
    assert.ok(fieldOf(number, "NUM") instanceof FieldAngle, "the dial is back");
    assert.equal(fieldOf(number, "NUM").getValue(), "90");
  });
});

test("a swap is not an edit: it fires no event", async () => {
  await withEditors(async (workspace, editors) => {
    add(workspace, call("rotate", [num("45")]));
    await tick();
    const events = [];
    workspace.addChangeListener((event) => events.push(event.type));
    editors.update();
    await tick();
    assert.deepEqual(events, []);
  });
});

test("the value is never changed: a number the dial would change keeps the plain field", () => {
  withEditors((workspace, editors) => {
    const cases = { "45": true, "45.0": true, "0": true, "359": true, "-30": false, "450": false, "22.5": false, "360": false, ".5": false };
    const blocks = Object.keys(cases).map((value) => [value, add(workspace, call("rotate", [num(value)]))]);
    editors.update();
    for (const [value, block] of blocks) {
      const field = fieldOf(argBlock(block), "NUM");
      assert.equal(field instanceof FieldAngle, cases[value], `${value}: dial or not`);
      assert.equal(field.getValue(), value, `${value}: the text is as it was`);
    }
  });
});

test("the dial keeps what is typed and sets whole numbers as text", () => {
  withEditors((workspace, editors) => {
    const rotate = add(workspace, call("rotate", [num("45")]));
    editors.update();
    const field = fieldOf(argBlock(rotate), "NUM");
    field.setValue(90);                    // what dragging the dial does: a number
    assert.strictEqual(field.getValue(), "90");
    field.setValue("120.0");               // what typing does
    assert.strictEqual(field.getValue(), "120.0");
    assert.match(generator.workspaceToCode(workspace), /f\.rotate\(120\.0\)/);
    field.setValue("500");                 // wrapped by the dial, still text
    assert.strictEqual(field.getValue(), "140");
  });
});

test("an arrow key on the dial adds a step to the number, not to the text", () => {
  withEditors((workspace, editors) => {
    const rotate = add(workspace, call("rotate", [num("45")]));
    editors.update();
    const field = fieldOf(argBlock(rotate), "NUM");
    field.bfArithmetic = true;
    assert.strictEqual(field.getValue() + 1, 46);
    field.bfArithmetic = false;
    assert.strictEqual(field.getValue(), "45");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// A range: a slider

test("a number in a range slot gets a slider with the catalogue's low, high and step", () => {
  withEditors((workspace, editors) => {
    const lerp = add(workspace, call("lerp_color", [text("red"), text("blue"), num("0.5")]));
    const opacity = add(workspace, call("opacity", [num("128")]));
    editors.update();
    const half = fieldOf(argBlock(lerp, 2), "NUM");
    assert.ok(half instanceof FieldSlider);
    assert.deepEqual([half.getMin(), half.getMax(), half.getPrecision()], [0, 1, 0.01]);
    assert.equal(half.getValue(), "0.5");
    const amount = fieldOf(argBlock(opacity), "NUM");
    assert.ok(amount instanceof FieldSlider);
    assert.deepEqual([amount.getMin(), amount.getMax(), amount.getPrecision()], [0, 255, 1]);
  });
});

test("a slider never changes the value either: out of range, or finer than a step, stays plain", () => {
  withEditors((workspace, editors) => {
    const out = add(workspace, call("opacity", [num("300")]));
    const fine = add(workspace, call("lerp_color", [text("red"), text("blue"), num("0.123")]));
    const ok = add(workspace, call("lerp_color", [text("red"), text("blue"), num("0.50")]));
    editors.update();
    assert.ok(isPlainNumber(fieldOf(argBlock(out), "NUM")));
    assert.ok(isPlainNumber(fieldOf(argBlock(fine, 2), "NUM")));
    assert.equal(fieldOf(argBlock(fine, 2), "NUM").getValue(), "0.123");
    assert.ok(fieldOf(argBlock(ok, 2), "NUM") instanceof FieldSlider);
    assert.equal(fieldOf(argBlock(ok, 2), "NUM").getValue(), "0.50", "the text is kept, not made 0.5");
  });
});

test("a slider moved as the plugin moves it sets text", () => {
  withEditors((workspace, editors) => {
    const opacity = add(workspace, call("opacity", [num("128")]));
    editors.update();
    const field = fieldOf(argBlock(opacity), "NUM");
    field.setEditorValue_("200", false);
    assert.strictEqual(field.getValue(), "200");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Colours: a grid of names

test("a text in a colour slot gets the grid of colour names, and its value is the text", () => {
  withEditors((workspace, editors) => {
    const fill = add(workspace, call("fill", [text("tomato")]));
    const plain = add(workspace, call("text", [text("hi"), num("1"), num("2")]));
    editors.update();
    const field = fieldOf(argBlock(fill), "TEXT");
    assert.ok(field instanceof ColourNameField);
    assert.ok(field instanceof FieldGridDropdown);
    assert.strictEqual(field.getValue(), "tomato");
    assert.equal(field.getText(), "tomato");
    const names = field.getOptions(true).map((o) => o[1]);
    assert.ok(names.includes("gold") && names.includes("tomato"));
    assert.ok(!names.some((n) => /\d$/.test(n)), "without the numbered shades");
    assert.ok(!(fieldOf(argBlock(plain), "TEXT") instanceof ColourNameField), "a message is not a colour");
  });
});

test("a colour name that is not in the grid shows as typed, and so does a picked hex", () => {
  withEditors((workspace, editors) => {
    const blocks = ["antiquewhite2", "mycolour", "#ff6347"].map((name) => add(workspace, call("fill", [text(name)])));
    editors.update();
    for (const [i, name] of ["antiquewhite2", "mycolour", "#ff6347"].entries()) {
      const field = fieldOf(argBlock(blocks[i]), "TEXT");
      assert.ok(field instanceof ColourNameField, name);
      assert.strictEqual(field.getValue(), name);
      assert.equal(field.getText(), name);
    }
    const field = fieldOf(argBlock(blocks[1]), "TEXT");
    field.setValue("gold");
    field.setValue("mycolour");           // undo goes back to a name the grid does not list
    assert.strictEqual(field.getValue(), "mycolour");
  });
});

test("More colours is a way to field-colour's squares, not a value; a hex from there is written as text", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  const had = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  try {
    withEditors((workspace, editors) => {
      const fill = add(workspace, call("fill", [text("tomato")]));
      editors.update();
      const field = fieldOf(argBlock(fill), "TEXT");
      const names = field.getOptions(false);
      assert.equal(names.at(-1)[2], "More colours");
      assert.ok(names[0][0] instanceof dom.window.HTMLElement, "a square");
      assert.equal(names[0][0].title, names[0][1], "with its name");
      field.setValue(names.at(-1)[1]);
      assert.strictEqual(field.getValue(), "tomato", "choosing More colours changes nothing");
      assert.equal(field.bfState.page, "picker");
      const squares = field.getOptions(false);
      assert.equal(squares.length, new FieldColour("#ffffff").getOptions(false).length + 1, "field-colour's squares and a way back");
      assert.match(squares[0][1], /^#[0-9a-f]{6}$/);
      field.setValue("#ff6347");
      assert.strictEqual(field.getValue(), "#ff6347");
      assert.match(generator.workspaceToCode(workspace), /f\.fill\("#ff6347"\)/);
      assert.equal(saved(workspace).blocks.blocks[0].inputs.ARG0.shadow.fields.TEXT, "#ff6347");
    });
  } finally {
    Object.assign(globalThis, had);
    if (had.document === undefined) delete globalThis.document;
    if (had.HTMLElement === undefined) delete globalThis.HTMLElement;
  }
});

// ---------------------------------------------------------------------------------------------------------------
// The blocks of a kit

test("the drawing blocks: the Python template says which function, and the slots are its {NAMES}", () => {
  assert.deepEqual(templateOf(typeOf("fill")), { owner: "f", name: "fill", slots: { COLOR: { position: 0 } } });
  assert.deepEqual(templateOf(typeOf("rectangle")).slots, { X: { position: 0 }, Y: { position: 1 }, W: { position: 2 }, H: { position: 3 } });
  assert.equal(templateOf(typeOf("say")), null, "print is not a call on a library");
  assert.equal(templateOf(typeOf("number")), null);
});

test("the drawing blocks' colour slots get the grid; their message and numbers do not", () => {
  withEditors((workspace, editors) => {
    const fill = add(workspace, { type: typeOf("fill"), inputs: { COLOR: text("tomato") } });
    const outline = add(workspace, { type: typeOf("outline"), inputs: { COLOR: text("gold") } });
    const background = add(workspace, { type: typeOf("background"), inputs: { COLOR: text("teal") } });
    const write = add(workspace, { type: typeOf("write"), inputs: { TEXT: text("hello"), X: num("1"), Y: num("2") } });
    const circle = add(workspace, { type: typeOf("circle"), inputs: { X: num("1"), Y: num("2"), D: num("3") } });
    editors.update();
    for (const block of [fill, outline, background]) {
      assert.ok(fieldOf(block.getInputTargetBlock("COLOR"), "TEXT") instanceof ColourNameField, block.type);
    }
    assert.ok(!(fieldOf(write.getInputTargetBlock("TEXT"), "TEXT") instanceof ColourNameField));
    assert.ok(isPlainNumber(fieldOf(circle.getInputTargetBlock("D"), "NUM")));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The call's name changes

test("changing the name of a call changes the editors of its slots", () => {
  withEditors((workspace, editors) => {
    const block = add(workspace, call("rotate", [num("45")]));
    editors.update();
    assert.ok(fieldOf(argBlock(block), "NUM") instanceof FieldAngle);
    block.getField("NAME").setValue("circle");
    editors.update();
    assert.ok(isPlainNumber(fieldOf(argBlock(block), "NUM")), "circle's first slot is pixels");
    block.getField("NAME").setValue("shear_x");
    editors.update();
    assert.ok(fieldOf(argBlock(block), "NUM") instanceof FieldAngle, "shear_x is degrees too");
    assert.equal(fieldOf(argBlock(block), "NUM").getValue(), "45");
  });
});

test("a keyword argument takes the editor of its parameter", () => {
  withEditors((workspace, editors) => {
    const block = add(workspace, {
      type: typeOf("method"), fields: { NAME: "text", KW1: "color" }, extraState: { args: ["p", "k"] },
      inputs: { OBJ: variable("f"), ARG0: text("hi"), ARG1: text("tomato") },
    });
    block.getField("KW1").setValue("color");
    editors.update();
    assert.ok(!(fieldOf(argBlock(block, 0), "TEXT") instanceof ColourNameField), "message");
    assert.ok(fieldOf(argBlock(block, 1), "TEXT") instanceof ColourNameField, "color=");
  });
});

test("a name the catalogue does not know, or an object it cannot place, has no editors", () => {
  withEditors((workspace, editors) => {
    const unknown = add(workspace, call("my_rotate", [num("45")]));
    const own = add(workspace, call("rotate", [num("45")], "player"));   // what `player` is is not known
    editors.update();
    assert.ok(isPlainNumber(fieldOf(argBlock(unknown), "NUM")));
    // an unknown object with a name only one class has would be found; rotate is funground's, so not here
    assert.ok(isPlainNumber(fieldOf(argBlock(own), "NUM")));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Several lines of Python

test("the Python code block takes several lines; its text, JSON and Python are as they were", () => {
  const source = "for i in range(3):\n    print(i)\n";
  const before = withEditors((workspace) => {
    add(workspace, { type: typeOf("code"), fields: { TEXT: source } });
    return { json: saved(workspace), python: generator.workspaceToCode(workspace) };
  }, { editors: false });
  withEditors((workspace, editors) => {
    const block = add(workspace, { type: typeOf("code"), fields: { TEXT: source } });
    editors.update();
    assert.ok(fieldOf(block, "TEXT") instanceof FieldMultilineInput);
    assert.strictEqual(fieldOf(block, "TEXT").getValue(), source);
    assert.deepEqual(saved(workspace), before.json);
    assert.equal(generator.workspaceToCode(workspace), before.python);
    fieldOf(block, "TEXT").setValue("x = 1\ny = 2");
    assert.match(generator.workspaceToCode(workspace), /x = 1\ny = 2/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The invariant

test("with the editors on, JSON and Python are those of the plain blocks", () => {
  const program = [
    call("rotate", [num("45")]), call("rotate", [num("-30")]), call("opacity", [num("128")]),
    call("lerp_color", [text("red"), text("#ff6347"), num("0.5")]), call("fill", [text("tomato")]),
    { type: typeOf("fill"), inputs: { COLOR: text("mycolour") } }, { type: typeOf("code"), fields: { TEXT: "a = 1\nb = 2" } },
  ];
  const run = (editors) => withEditors((workspace, tracker) => {
    for (const json of program) add(workspace, json);
    tracker?.update();
    return { json: saved(workspace), python: generator.workspaceToCode(workspace) };
  }, { editors });
  const plain = run(false);
  const on = run(true);
  assert.deepEqual(on.json, plain.json);
  assert.equal(on.python, plain.python);
  // and the editors really are on in that run
  withEditors((workspace, tracker) => {
    for (const json of program) add(workspace, json);
    tracker.update();
    assert.ok(tracker.swaps >= 6, `swaps: ${tracker.swaps}`);
  });
});

test("without a catalogue nothing swaps: the blocks keep their plain fields", () => {
  registerBlocks({});
  const workspace = new Blockly.Workspace();
  try {
    const block = add(workspace, call("rotate", [num("45")]));
    assert.ok(isPlainNumber(fieldOf(argBlock(block), "NUM")));
    assert.equal(workspace.bfEditors, undefined);
  } finally {
    workspace.dispose();
  }
});

const converted = convertAll(SNIPPETS);

test("every snippet: the same Python and the same JSON with the editors on", () => {
  const run = (editors) => withEditors((workspace, tracker) => converted.map((result) => {
    assert.ok(result.ok, result.message);
    Blockly.serialization.workspaces.load(result.workspace, workspace);
    tracker?.update();
    const out = { python: generator.workspaceToCode(workspace), json: saved(workspace) };
    workspace.clear();
    return out;
  }), { editors });
  const plain = run(false);
  const on = run(true);
  plain.forEach((one, i) => {
    assert.equal(on[i].python, one.python, `snippet ${i}: Python`);
    assert.deepEqual(on[i].json, one.json, `snippet ${i}: JSON`);
  });
});

test("a sketch read from Python gets its editors, and writes the same Python", () => {
  const source = "import funground as f\n\n\ndef draw():\n    f.background(\"gold\")\n    f.fill(\"#ff6347\")\n    f.rotate(30)\n    f.opacity(100)\n    f.circle(100, 100, 50)\n\n\nf.run()\n";
  const [result] = convertAll([source]);
  assert.ok(result.ok, result.message);
  withEditors((workspace, editors) => {
    Blockly.serialization.workspaces.load(result.workspace, workspace);
    const before = generator.workspaceToCode(workspace);
    editors.update();
    assert.equal(generator.workspaceToCode(workspace), before);
    assert.ok(editors.swaps >= 4, `swaps: ${editors.swaps}`);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// When

test("many events make one pass, in the next frame", async () => {
  await withEditors(async (workspace, editors) => {
    let passes = 0;
    const update = editors.update.bind(editors);
    editors.update = () => { passes++; update(); };
    const rotate = add(workspace, call("rotate", [num("45")]));
    await tick();
    const before = passes;
    for (let i = 0; i < 10; i++) argBlock(rotate).setFieldValue(String(i), "NUM");
    await tick(120);
    assert.equal(passes - before, 1);
    assert.ok(fieldOf(argBlock(rotate), "NUM") instanceof FieldAngle, "a moved block gets its editor from the events alone");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The demo loads the plugins as classic scripts

test("the plugins' own scripts give the names the editors use, with Blockly as a classic script (the demo)", () => {
  const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
  const run = (path) => dom.window.eval(readFileSync(path, "utf8"));
  run("node_modules/blockly/blockly_compressed.js");
  const plugins = ["field-angle", "field-colour", "field-grid-dropdown", "field-multilineinput", "field-slider"];
  for (const name of plugins) run(`node_modules/@blockly/${name}/dist/index.js`);
  const shim = readFileSync("demo/blockly-plugins.js", "utf8");
  for (const name of ["FieldAngle", "FieldColour", "FieldGridDropdown", "FieldMultilineInput", "FieldSlider"]) {
    assert.equal(typeof dom.window[name], "function", `window.${name}`);
    assert.ok(shim.includes(name), `the shim gives ${name}`);
  }
  assert.ok(Object.getPrototypeOf(dom.window.FieldAngle) === dom.window.Blockly.FieldNumber, "built on the page's Blockly");
});
