// Follow-up round: editable defaults (shadows) from the toolbox, the dropdown of names, the Python line.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { toPython } from "../editor/index.js";
import {
  registerBlocks, toolbox, toolboxBlock, typeOf, FieldName, NEW_NAME_OPTION,
} from "../editor/blocks/register.js";
import { BLOCKS } from "../editor/blocks/table.js";
import { generator } from "../editor/generator/python.js";
import { stmt as s, val as v, text as t, num as n, name as x, program } from "./dsl.js";

const SCRATCH = { words: "scratch", pythonLine: true };

function withWorkspace(settings, fn) {
  registerBlocks(settings);
  const workspace = new Blockly.Workspace();
  try {
    return fn(workspace);
  } finally {
    workspace.dispose();
    registerBlocks(SCRATCH);
  }
}

/** A block fresh from the toolbox, put on a workspace, and the Python it makes. */
function fromToolbox(id) {
  return withWorkspace(SCRATCH, (workspace) => {
    Blockly.serialization.blocks.append({ ...toolboxBlock(id), x: 0, y: 0 }, workspace);
    return generator.workspaceToCode(workspace);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Editable defaults

test("toolbox blocks make code at once, with their defaults", () => {
  assert.equal(fromToolbox("repeat"), "for _ in range(10):\n    pass\n");
  assert.equal(fromToolbox("if"), "if v == 0:\n    pass\n");
  assert.equal(fromToolbox("while"), "while v == 0:\n    pass\n");
  assert.equal(fromToolbox("until"), "while not v == 0:\n    pass\n");
  assert.equal(fromToolbox("count"), "for i in range(0, 10):\n    pass\n");
  assert.equal(fromToolbox("count_by"), "for i in range(0, 10, 1):\n    pass\n");
  assert.equal(fromToolbox("for_each"), "for item in list:\n    pass\n");
  assert.equal(fromToolbox("say"), "print(\"Hello!\")\n");
  assert.equal(fromToolbox("set"), "v = 0\n");
  assert.equal(fromToolbox("change"), "v += 1\n");
  assert.equal(fromToolbox("subtract"), "v -= 1\n");
  assert.equal(fromToolbox("wait"), "import time\n\ntime.sleep(1)\n");
  assert.equal(fromToolbox("add_to"), "list.append(\"thing\")\n");
  assert.equal(fromToolbox("set_item"), "list[0] = 0\n");
  assert.equal(fromToolbox("method"), "x.name()\n");
  assert.equal(fromToolbox("return"), "return 0\n");
  assert.equal(fromToolbox("def"), "def name():\n    pass\n");
});

test("toolbox value blocks have defaults too", () => {
  const value = (id) => withWorkspace(SCRATCH, (workspace) => {
    const block = Blockly.serialization.blocks.append(toolboxBlock(id), workspace);
    return generator.blockToCode(block)[0];
  });
  assert.equal(value("ask"), "input(\"What is your name? \")");
  assert.equal(value("randint"), "random.randint(1, 6)");
  assert.equal(value("arith"), "0 + 0");
  assert.equal(value("compare"), "v == 0");
  assert.equal(value("logic"), "v == 0 and v == 0");
  assert.equal(value("not"), "not v == 0");
  assert.equal(value("round"), "round(0)");
  assert.equal(value("list_of"), "[1, 2]");
  assert.equal(value("item_at"), "list[0]");
  assert.equal(value("length"), "len(\"Hello\")");
  assert.equal(value("contains"), "\"a\" in list");
  assert.equal(value("power"), "0 ** 2");
});

test("no toolbox block makes None, and every value slot has a block or a shadow with editable fields", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  const below = (b) => [b, ...b.getChildren(false).flatMap(below)];
  for (const def of BLOCKS) {
    const block = Blockly.serialization.blocks.append(toolboxBlock(def.type), workspace);
    const code = generator.blockToCode(block);
    assert.ok(!String(Array.isArray(code) ? code[0] : code).includes("None"), `${def.type}: ${code}`);
    for (const b of below(block)) {
      for (const input of b.inputList) {
        if (input.type !== Blockly.inputs.inputTypes.VALUE) continue;
        const target = input.connection.targetBlock();
        assert.ok(target, `${b.type}.${input.name} is empty`);
        if (target.isShadow()) {
          for (const field of target.inputList.flatMap((i) => i.fieldRow)) {
            if (field.name) assert.ok(field.EDITABLE, `${target.type}.${field.name}`);
          }
        }
      }
    }
  }
  workspace.dispose();
});

test("a condition is a real comparison, v = 0, whose name is chosen or typed; a shadow may not hold a real block", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  const block = Blockly.serialization.blocks.append(toolboxBlock("if"), workspace);
  const condition = block.getInputTargetBlock("IF0");
  assert.equal(condition.type, typeOf("compare"));
  assert.ok(!condition.isShadow());
  const left = condition.getInputTargetBlock("A");
  assert.ok(left.isShadow());
  assert.equal(left.type, typeOf("variable"));
  const field = left.getField("VAR");
  assert.ok(field instanceof FieldName, "the name is a dropdown of the names in use");
  assert.ok(field.acceptName("guess"), "a new name can be typed");
  assert.equal(generator.blockToCode(block), "if guess == 0:\n    pass\n");
  assert.ok(condition.getInputTargetBlock("B").isShadow());
  assert.throws(() => Blockly.serialization.blocks.append({
    type: typeOf("arith"),
    inputs: { A: { shadow: { type: typeOf("arith"), inputs: { A: { block: { type: typeOf("number") } } } } } },
  }, workspace), /shadow/);
  workspace.dispose();
});

test("the toolbox lists every block once, with its defaults", () => {
  const entries = toolbox().contents.flatMap((c) => c.contents);
  assert.equal(entries.length, BLOCKS.length);
  const repeat = entries.find((e) => e.type === typeOf("repeat"));
  assert.deepEqual(repeat.inputs.N, { shadow: { type: typeOf("number"), fields: { NUM: "10" } } });
});

test("covering a shadow with a real block makes the real block; taking it away brings the shadow back", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  const repeat = Blockly.serialization.blocks.append(toolboxBlock("repeat"), workspace);
  const slot = repeat.getInput("N").connection;
  const variable = workspace.newBlock(typeOf("variable"));
  variable.setFieldValue("times", "VAR");
  slot.connect(variable.outputConnection);
  assert.equal(generator.workspaceToCode(workspace).split("\n")[0], "for _ in range(times):");
  variable.dispose(false);
  assert.equal(generator.workspaceToCode(workspace).split("\n")[0], "for _ in range(10):");
  // typing over a shadow changes the code
  repeat.getInputTargetBlock("N").setFieldValue("3", "NUM");
  assert.equal(generator.workspaceToCode(workspace).split("\n")[0], "for _ in range(3):");
  // a comparison is edited or replaced like any block
  const check = Blockly.serialization.blocks.append(toolboxBlock("if"), workspace);
  check.getInputTargetBlock("IF0").getInputTargetBlock("B").setFieldValue("5", "NUM");
  check.getInputTargetBlock("IF0").setFieldValue("<", "OP");
  assert.ok(generator.workspaceToCode(workspace).includes("if v < 5:"));
  workspace.dispose();
});

test("shadows are saved and loaded in the workspace JSON, and make the same Python", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  Blockly.serialization.blocks.append({ ...toolboxBlock("repeat"), x: 0, y: 0 }, workspace);
  const saved = Blockly.serialization.workspaces.save(workspace);
  workspace.dispose();
  assert.ok(JSON.stringify(saved).includes("\"shadow\""));
  assert.equal(toPython(saved), "for _ in range(10):\n    pass\n");
});

// ---------------------------------------------------------------------------------------------------------------
// The dropdown of names

const optionsOf = (block, field = "VAR") => block.getField(field).getOptions(false);

test("names: the options are the names used in the program, sorted, and new name", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(program(
    [s.set("zebra", n(1)), s.count("i", null, 3, [s.change("total", 1)]), s.forEach("item", x("list"), [])],
    [s.def("f", "b, a", [s.ret(x("c"))])]), workspace);
  const set = workspace.getBlocksByType(typeOf("set"))[0];
  const options = optionsOf(set);
  assert.deepEqual(options.slice(0, -1).map((o) => o[0]), ["a", "b", "c", "i", "item", "list", "total", "zebra"]);
  assert.equal(options.at(-1)[0], NEW_NAME_OPTION);
  assert.ok(set.getField("VAR") instanceof FieldName);
  // the same list from every name field, and for a block still in the toolbox (it asks the main workspace)
  assert.deepEqual(optionsOf(workspace.getBlocksByType(typeOf("variable"))[0]), options);
  workspace.dispose();
});

test("names: an empty workspace lists the field's own name; a new block's name joins the list", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock(typeOf("set"));
  assert.deepEqual(optionsOf(block).slice(0, -1), [["v", "v"]]);
  block.setFieldValue("score", "VAR");
  const other = workspace.newBlock(typeOf("change"));
  assert.deepEqual(optionsOf(other).slice(0, -1).map((o) => o[0]), ["score", "v"]);
  workspace.dispose();
});

test("names: the JSON keeps the name as plain text", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  const json = program(s.set("score", n(0)));
  Blockly.serialization.workspaces.load(json, workspace);
  const saved = Blockly.serialization.workspaces.save(workspace).blocks.blocks[0];
  assert.deepEqual({ ...saved.fields }, { VAR: "score" });
  assert.equal(toPython(json), "score = 0\n");
  workspace.dispose();
});

test("names: a name Python cannot use is refused and the old value stays", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  const alerts = [];
  Blockly.dialog.setAlert((message) => alerts.push(message));
  const block = workspace.newBlock(typeOf("set"));
  const field = block.getField("VAR");
  field.setValue("score");
  for (const bad of ["for", "2fast", "a b", "", "x.y", "None"]) {
    field.setValue(bad);
    assert.equal(field.getValue(), "score", bad);
  }
  assert.equal(field.acceptName("class"), false);
  assert.equal(field.acceptName("1st"), false);
  assert.equal(field.getValue(), "score");
  assert.equal(alerts.length, 2);
  assert.ok(alerts[0].includes("\"class\" is not a name Python can use"));
  assert.equal(field.acceptName("  lives "), true);
  assert.equal(field.getValue(), "lives");
  // the prompt: the typed answer is taken, a cancelled one is not
  const answers = ["total", null];
  Blockly.dialog.setPrompt((message, fallback, callback) => callback(answers.shift()));
  field.askForName();
  assert.equal(field.getValue(), "total");
  field.askForName();
  assert.equal(field.getValue(), "total");
  Blockly.dialog.setAlert();
  Blockly.dialog.setPrompt();
  workspace.dispose();
});

test("names: function names and parameters stay typed text", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  const def = workspace.newBlock(typeOf("def"));
  assert.ok(!(def.getField("NAME") instanceof FieldName));
  assert.ok(!(def.getField("PARAMS") instanceof FieldName));
  workspace.dispose();
});

// ---------------------------------------------------------------------------------------------------------------
// The Python line

const lineRows = (block) => block.inputList.filter((i) => i.name.startsWith("PYLINE"));
const lines = (block) => lineRows(block).map((i) => i.fieldRow[0].lineText());

test("the Python line shows the block's own first line, with its real values", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(program(
    [s.repeat(3, [s.say(t("Hello,"), x("name"))]),
      s.if([[v.gt(x("a"), 1), []], [x("b"), []]], []),
      s.say(t("a very long text that goes on and on and on and on"), x("name")),
      s.set("total", v.add(x("total"), 1))],
    [s.def("f", "a, b", [])]), workspace);
  const by = (type) => workspace.getBlocksByType(typeOf(type))[0];
  assert.deepEqual(lines(by("repeat")), ["for _ in range(3):"]);
  assert.deepEqual(lines(by("say")).length, 1);
  assert.deepEqual(lines(by("if")), ["if a > 1:", "elif b:", "else:"]);
  assert.deepEqual(lines(by("set")), ["total = total + 1"]);
  assert.deepEqual(lines(by("def")), ["def f(a, b):"]);
  const inner = workspace.getBlocksByType(typeOf("say")).find((b) => b.getInputTargetBlock("ARG1")?.getFieldValue("VAR") === "name"
    && b.getInputTargetBlock("ARG0").getFieldValue("TEXT") === "Hello,");
  assert.deepEqual(lines(inner), ["print(\"Hello,\", name)"]);
  const long = workspace.getBlocksByType(typeOf("say")).find((b) => b.getInputTargetBlock("ARG0").getFieldValue("TEXT").startsWith("a very"));
  assert.equal(lines(long)[0].length, 40);
  assert.ok(lines(long)[0].endsWith("…"));
  // it follows the values
  by("repeat").getInputTargetBlock("N").setFieldValue("9", "NUM");
  assert.deepEqual(lines(by("repeat")), ["for _ in range(9):"]);
  // the line is only a view: the Python is not touched
  assert.ok(!generator.workspaceToCode(workspace).includes("…"));
  workspace.dispose();
});

test("a value block has no Python line, a statement has one", () => {
  registerBlocks(SCRATCH);
  const workspace = new Blockly.Workspace();
  for (const def of BLOCKS) {
    const block = workspace.newBlock(typeOf(def.type));
    const expected = def.kind === "statement" && def.line !== null && def.line !== undefined;
    assert.equal(lineRows(block).length > 0, expected, def.type);
  }
  workspace.dispose();
});

test("with Python words there is no Python line at all, whatever the setting", () => {
  for (const pythonLine of [true, false]) {
    const settings = registerBlocks({ words: "python", pythonLine });
    assert.equal(settings.pythonLine, false);
    const workspace = new Blockly.Workspace();
    for (const def of BLOCKS) assert.equal(lineRows(workspace.newBlock(typeOf(def.type))).length, 0, def.type);
    workspace.dispose();
  }
  registerBlocks(SCRATCH);
});

test("with the line off, there are no line rows either", () => {
  withWorkspace({ words: "scratch", pythonLine: false }, (workspace) => {
    for (const def of BLOCKS) assert.equal(lineRows(workspace.newBlock(typeOf(def.type))).length, 0, def.type);
  });
});

test("the Python is the same in every setting, for a program with shadows too", () => {
  const sample = withWorkspace(SCRATCH, (workspace) => {
    ["repeat", "if", "say", "set"].forEach((id, i) => Blockly.serialization.blocks.append({ ...toolboxBlock(id), x: 0, y: i * 100 }, workspace));
    return Blockly.serialization.workspaces.save(workspace);
  });
  const texts = new Set();
  for (const words of ["scratch", "python"]) for (const pythonLine of [true, false]) {
    registerBlocks({ words, pythonLine });
    texts.add(toPython(sample));
  }
  registerBlocks(SCRATCH);
  assert.equal(texts.size, 1);
});
