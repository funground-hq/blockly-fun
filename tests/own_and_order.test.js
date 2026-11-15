// Phase B, editor side: the precedence a Python code block carries, calls of the learner's own blocks, and the
// defaults a slot added in the gear gets.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { toPython } from "../editor/index.js";
import { registerBlocks, typeOf, toolboxBlock, forgetOrderOnEdit } from "../editor/blocks/register.js";
import { generator } from "../editor/generator/python.js";
import { stmt as s, val as v, text as t, name as x, program } from "./dsl.js";

/** Python for a single value block, set into r. */
const expr = (node) => toPython(program(s.set("r", node)));
const body = (code) => code.replace(/^r = /, "").trimEnd();

test("a Python code value block knows its precedence", () => {
  const a = x("a");
  assert.equal(body(expr(v.add(a, v.code("x[1:2]", "CALL")))), "a + x[1:2]");
  assert.equal(body(expr(v.add(v.code("x if c else y", "CONDITIONAL"), 1))), "(x if c else y) + 1");
  assert.equal(body(expr(v.mul(v.code("x << 2", "SHIFT"), 3))), "(x << 2) * 3");
  assert.equal(body(expr(v.add(v.code("x << 2", "SHIFT"), 3))), "(x << 2) + 3");
  assert.equal(body(expr(v.add(v.code("lambda: 1", "LOWEST"), 3))), "(lambda: 1) + 3");
  assert.equal(body(expr(v.add(v.code("a | b", "BITWISE_OR"), 3))), "(a | b) + 3");
  assert.equal(body(expr(v.add(v.code("await f()", "AWAIT"), 3))), "await f() + 3");
  assert.equal(body(expr(v.code("x if c else y", "CONDITIONAL"))), "x if c else y");
  assert.equal(body(expr(v.add(v.code("anything", "NOT_AN_ORDER"), 1))), "(anything) + 1");
  // without an order the look of the text decides, as before
  assert.equal(body(expr(v.add(v.code("x[1:2]"), 1))), "(x[1:2]) + 1");
  assert.equal(body(expr(v.add(v.code("name.attr"), 1))), "name.attr + 1");
});

test("the order is saved and loaded; a block made in the editor has none", () => {
  registerBlocks({ words: "scratch", pythonLine: true });
  const workspace = new Blockly.Workspace();
  const json = program(s.set("r", v.add(x("a"), v.code("x if c else y", "CONDITIONAL"))));
  Blockly.serialization.workspaces.load(json, workspace);
  const saved = Blockly.serialization.workspaces.save(workspace);
  const code = workspace.getBlocksByType(typeOf("code_value"))[0];
  assert.deepEqual(code.saveExtraState(), { order: "CONDITIONAL" });
  assert.deepEqual(saved.blocks.blocks[0].inputs.VALUE.block.inputs.B.block.extraState, { order: "CONDITIONAL" });
  assert.equal(toPython(saved), "r = a + (x if c else y)\n");
  assert.equal(workspace.newBlock(typeOf("code_value")).saveExtraState(), null);
  assert.equal(workspace.newBlock(typeOf("code")).saveExtraState(), null);
  workspace.dispose();
});

test("calling your own block: a name and a count, positional arguments, an empty slot is None", () => {
  assert.equal(toPython(program(s.own("greet", t("Mia"), 3))), "greet(\"Mia\", 3)\n");
  assert.equal(toPython(program(s.own("hello"))), "hello()\n");
  assert.equal(toPython(program(s.own("greet", t("Mia"), null))), "greet(\"Mia\", None)\n");
  assert.equal(body(expr(v.own("square", 5))), "square(5)");
  assert.equal(body(expr(v.add(v.own("square", 5), 1))), "square(5) + 1");
  assert.equal(body(expr(v.itemAt(0, v.own("make_list")))), "make_list()[0]");
  assert.equal(body(expr(v.pow(v.own("f", 1), 2))), "f(1) ** 2");
  assert.equal(body(expr(v.own("f", v.add(1, 2), x("b")))), "f(1 + 2, b)");
});

/** Opens the gear of a block, adds one more part of this kind at the end, and closes it. */
function grow(workspace, block, kind) {
  const root = block.decompose(workspace);
  let last = root.getInputTargetBlock("STACK");
  while (last && last.getNextBlock()) last = last.getNextBlock();
  const extra = workspace.newBlock(typeOf("m_" + kind));
  (last ? last.nextConnection : root.getInput("STACK").connection).connect(extra.previousConnection);
  block.compose(root);
}

test("slots added in the gear get the toolbox's defaults", () => {
  registerBlocks({ words: "scratch", pythonLine: false });
  const workspace = new Blockly.Workspace();
  const added = (json, kind) => {
    const block = Blockly.serialization.blocks.append(json, workspace);
    grow(workspace, block, kind);
    return block;
  };
  const say = added(toolboxBlock("say"), "item");
  assert.equal(generator.blockToCode(say), "print(\"Hello!\", \"\")\n");
  assert.ok(say.getInputTargetBlock("ARG1").isShadow());
  assert.equal(generator.blockToCode(added(toolboxBlock("list_of"), "item"))[0], "[1, 2, 0]");
  assert.equal(generator.blockToCode(added(toolboxBlock("call"), "pos")), "name(0)\n");
  assert.equal(generator.blockToCode(added(toolboxBlock("method_value"), "pos"))[0], "x.name(0)");

  const check = added(toolboxBlock("if"), "elif");
  assert.equal(generator.blockToCode(check), "if v == 0:\n    pass\nelif v == 0:\n    pass\n");
  assert.equal(check.getInputTargetBlock("IF1").type, typeOf("compare"));
  assert.ok(!check.getInputTargetBlock("IF1").isShadow());

  // a child that is kept stays, and only the new slot is filled
  const kept = Blockly.serialization.blocks.append(s.say(t("a"), t("b")).json, workspace);
  grow(workspace, kept, "item");
  assert.equal(generator.blockToCode(kept), "print(\"a\", \"b\", \"\")\n");
  workspace.dispose();
  registerBlocks({ words: "scratch", pythonLine: true });
});

test("loading JSON adds no default: the JSON gives the children", () => {
  registerBlocks({ words: "scratch", pythonLine: true });
  const say = { type: typeOf("say"), extraState: { items: 2 }, inputs: { ARG0: { block: t("Hello!").json } } };
  assert.equal(toPython({ blocks: { blocks: [say] } }), "print(\"Hello!\", None)\n");
  const check = { type: typeOf("if"), extraState: { elifs: 1, else: false }, inputs: { IF0: { block: x("a").json } } };
  assert.equal(toPython({ blocks: { blocks: [check] } }), "if a:\n    pass\nelif None:\n    pass\n");
});

test("a Python code value forgets its order once its text is edited", async () => {
  registerBlocks({ words: "scratch", pythonLine: true });
  const workspace = new Blockly.Workspace();
  forgetOrderOnEdit(workspace);
  const block = Blockly.serialization.blocks.append(
    { type: "bf_code_value", fields: { TEXT: "x[1:2]" }, extraState: { order: "CALL" } }, workspace);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(block.bfOrder, "CALL", "loading is not an edit");
  block.setFieldValue("a if b else c", "TEXT");
  await new Promise((resolve) => setTimeout(resolve, 10)); // Blockly fires its events on a timer
  assert.equal(block.bfOrder, undefined);
  workspace.dispose();
});
