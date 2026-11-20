// BF-D-053: the parts of the phone layout: what the slot sheet offers, an operator wrapping a slot, where a new variable
// goes, the phone's scope of blocks, the block list's search, and which block wrote which line. All pure or headless (no page);
// the page itself is checked by tools/phone_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { toPython } from "../editor/index.js";
import { registerBlocks, typeOf, registeredSettings } from "../editor/blocks/register.js";
import { BLOCKS } from "../editor/blocks/table.js";
import { generator } from "../editor/generator/python.js";
import {
  OPERATORS, Recent, offerFor, padPress, padValue, sliderFor, sketchValues, startPad, variablesInScope, wrapInOperator,
} from "../editor/phone/slots.js";
import { addVariable, checkName, variablePlace } from "../editor/phone/variables.js";
import { BASICS, LEFT_OUT, PER_KIND, labelOf, matching, phoneScope, rankOfBlock, rowsFor } from "../editor/phone/blocklist.js";
import { actionsFor } from "../editor/phone/moves.js";
import { blockLines, matchLines } from "../editor/phone/lines.js";
import { stmt as s, val as v, text as t, name as x, program } from "./dsl.js";
import timeBased from "./phone_fixtures/time_based.js";

function withWorkspace(json, fn) {
  if (!registeredSettings()) registerBlocks();
  const workspace = new Blockly.Workspace();
  try {
    if (json) Blockly.serialization.workspaces.load(json, workspace);
    return fn(workspace);
  } finally {
    workspace.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// What the sheet offers

test("a number slot offers a slider, the pad, the variables, the four operators, a new variable and the last numbers", () => {
  const scope = variablesInScope({ globals: ["x"] });
  const offer = offerFor({ kind: "number", value: 80, range: { low: 0, high: 640, step: 1 }, scope, recent: [60, 120] });
  assert.deepEqual(offer.slider, { low: 0, high: 640, step: 1 });
  assert.equal(offer.pad, true);
  assert.deepEqual(offer.operators.map((o) => o.op), ["+", "-", "*", "/"]);
  assert.equal(offer.newVariable, true);
  assert.deepEqual(offer.recent, [60, 120]);
  assert.equal(offer.keyboard, false);
  assert.equal(offer.variables[0].name, "x");
});

test("another value (a variable, a sum) has no slider; the name of a variable has only the variables and a new one; text opens the keyboard", () => {
  const expression = offerFor({ kind: "expression", scope: [] });
  assert.equal(expression.slider, null);
  assert.equal(expression.pad, true);
  const name = offerFor({ kind: "name", scope: [{ name: "x" }] });
  assert.equal(name.pad, false);
  assert.deepEqual(name.operators, []);
  assert.equal(name.newVariable, true);
  const word = offerFor({ kind: "text" });
  assert.equal(word.keyboard, true);
  assert.equal(word.pad, false);
  assert.equal(word.newVariable, false);
});

test("the slider is the catalogue's range, else a range around the value", () => {
  assert.deepEqual(sliderFor(80, { low: 0, high: 640, step: 1 }), { low: 0, high: 640, step: 1 });
  assert.deepEqual(sliderFor(5), { low: 0, high: 10, step: 1 });
  assert.deepEqual(sliderFor(80), { low: 0, high: 100, step: 1 });
  assert.deepEqual(sliderFor(250), { low: 0, high: 1000, step: 1 });
  assert.deepEqual(sliderFor(-30), { low: -100, high: 100, step: 1 });
  assert.deepEqual(sliderFor(0.5), { low: 0, high: 10, step: 0.1 });
  assert.deepEqual(sliderFor(3, { low: 5, high: 5, step: 1 }), { low: 0, high: 10, step: 1 });   // a range that is not one is not used
});

test("the variables in scope: loops first, then parameters, then what the program sets, then the sketch's values; a name once", () => {
  const list = variablesInScope({ loops: ["i"], params: ["size", "i"], globals: ["x", "speed", "x", "for"] });
  assert.deepEqual(list.filter((e) => e.group !== "sketch").map((e) => `${e.group}:${e.name}`), ["loop:i", "param:size", "global:speed", "global:x"]);
  const sketch = list.filter((e) => e.group === "sketch").map((e) => e.name);
  assert.deepEqual(sketch.slice(0, 2), ["width", "height"]);
  assert.equal(sketch.length, sketchValues().length);
});

test("the recent numbers are the last few, newest first, with no number twice", () => {
  const recent = new Recent(3);
  for (const n of [1, 2, 3, 2, 4]) recent.add(n);
  recent.add(NaN);
  assert.deepEqual(recent.list(), [4, 2, 3]);
});

// ---------------------------------------------------------------------------------------------------------------
// An operator wraps the slot

test("choosing an operator turns the slot into [old] op [ ], with the right side empty (0)", () => {
  const old = { type: "bf_variable", fields: { VAR: "x" } };
  const wrapped = wrapInOperator("+", old);
  assert.equal(wrapped.type, "bf_arith");
  assert.equal(wrapped.fields.OP, "+");
  assert.deepEqual(wrapped.inputs.A.block, old);
  assert.equal(wrapped.inputs.B.shadow.fields.NUM, "0");
  assert.throws(() => wrapInOperator("%", old), /not an operator/);
  // and it is real blocks that make real Python, for each operator
  for (const { op } of OPERATORS) {
    const code = toPython({ blocks: { languageVersion: 0, blocks: [{ type: "bf_set", fields: { VAR: "r" }, inputs: { VALUE: { block: wrapInOperator(op, old) } } }] } });
    assert.equal(code.trim(), `r = x ${op} 0`);
  }
});

test("the number pad: the first digit starts a new number, then digits add; back, sign and a point work; half a number is no number", () => {
  let state = startPad(80);
  assert.equal(state.text, "80");
  for (const key of ["1", "2", "0"]) state = padPress(state, key);
  assert.equal(state.text, "120");
  assert.equal(padValue(state.text), 120);
  state = padPress(state, "back");
  assert.equal(state.text, "12");
  state = padPress(state, "-");
  assert.equal(state.text, "-12");
  state = padPress(state, "-");
  assert.equal(state.text, "12");
  state = padPress(startPad(5), ".");
  assert.equal(state.text, "0.");
  assert.equal(padValue(state.text), null);
  state = padPress(state, "5");
  assert.equal(padValue(state.text), 0.5);
  assert.equal(padPress(padPress(startPad(0), "0"), "7").text, "7");      // no leading zero
  assert.equal(padPress({ text: "1.5", fresh: false }, ".").text, "1.5");  // one point only
  assert.equal(padValue(""), null);
  assert.equal(padValue("-"), null);
});

// ---------------------------------------------------------------------------------------------------------------
// A new variable

test("a new variable goes at the end of the first top-level stack when it is before every hat and def", () => {
  assert.deepEqual(variablePlace([{ kind: "module" }, { kind: "hat" }]), { action: "append", index: 0 });
  assert.deepEqual(variablePlace([{ kind: "header" }, { kind: "module" }, { kind: "def" }]), { action: "append", index: 1 });
});

test("with no top-level stack before the hats and defs it is a stack of its own, after the header and before the rest", () => {
  assert.deepEqual(variablePlace([{ kind: "hat" }, { kind: "hat" }]), { action: "new", index: 0 });
  assert.deepEqual(variablePlace([{ kind: "header" }, { kind: "def" }]), { action: "new", index: 1 });
  assert.deepEqual(variablePlace([{ kind: "hat" }, { kind: "module" }]), { action: "new", index: 0 });   // a module stack after a hat is not "the top"
  assert.deepEqual(variablePlace([]), { action: "new", index: 0 });
});

test("a name for a new variable must be a Python name that is not taken", () => {
  assert.deepEqual(checkName(" speed "), { ok: true, name: "speed" });
  assert.equal(checkName("").ok, false);
  assert.equal(checkName("3d").ok, false);
  assert.equal(checkName("for").ok, false);
  assert.match(checkName("x", ["x"]).message, /already/);
});

test("addVariable puts `name = 0` after x = 0, before the hats (the Time-based example)", () => {
  withWorkspace(timeBased, (workspace) => {
    const block = addVariable(workspace, "speed");
    assert.equal(block.type, typeOf("set"));
    const code = generator.workspaceToCode(workspace);
    assert.match(code, /^import funground as f\n\nx = 0\nspeed = 0\n\n\ndef setup\(\):/);
  });
});

test("addVariable makes a stack of its own above the hats when the program has no top-level code", () => {
  const sketch = program(s.sketchFrame([s.circle(1, 2, 3)]));
  withWorkspace(sketch, (workspace) => {
    addVariable(workspace, "speed");
    const code = generator.workspaceToCode(workspace);
    assert.match(code, /import funground as f\n\nspeed = 0\n+def draw\(\):/);
  });
});

test("addVariable adds nothing when the program already sets the name at the top", () => {
  withWorkspace(timeBased, (workspace) => {
    assert.equal(addVariable(workspace, "x"), null);
    assert.equal(workspace.getTopBlocks(false).length, 3);
  });
});

test("addVariable keeps a header (a docstring) above the imports", () => {
  const withHeader = program([s.code('"""A sketch."""')], s.sketchFrame([s.circle(1, 2, 3)]));
  withWorkspace(withHeader, (workspace) => {
    addVariable(workspace, "speed");
    const code = generator.workspaceToCode(workspace);
    assert.ok(code.startsWith('"""A sketch."""\nimport funground as f'), code);
    assert.ok(code.indexOf("speed = 0") < code.indexOf("def draw"));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The block list

const fakeRank = (def) => ({ circle: 138, fill: 201, background: 150, rectangle: 100, line: 60, write: 50 })[def.type] ?? 0;

test("the phone's scope is the top PER_KIND blocks of each kind by rank, and the basics; the general call blocks are left out", () => {
  const scope = phoneScope(BLOCKS, fakeRank);
  const types = scope.map((d) => d.type);
  for (const basic of BASICS) assert.ok(types.includes(basic), basic);
  for (const left of LEFT_OUT) assert.ok(!types.includes(left), left);
  const perKind = Object.groupBy(scope.filter((d) => !BASICS.includes(d.type)), (d) => d.cat);
  for (const list of Object.values(perKind)) assert.ok(list.length <= PER_KIND);
  // the most used first
  const ranks = scope.map(fakeRank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
  assert.ok(scope.length < BLOCKS.length);
  assert.ok(types.includes("circle"));
});

test("the cut: a kind with more blocks than the cut keeps the most used", () => {
  const blocks = Array.from({ length: 12 }, (_, i) => ({ type: `b${i}`, cat: "shapes", scratch: `b${i}` }));
  const scope = phoneScope(blocks, (def) => Number(def.type.slice(1)), { perKind: 3, basics: [] });
  assert.deepEqual(scope.map((d) => d.type), ["b11", "b10", "b9"]);
});

test("a row says a block's words, with each slot as ... and each choice as its first word", () => {
  const def = (type) => BLOCKS.find((b) => b.type === type);
  assert.equal(labelOf(def("circle")), "circle at x … y … size …");
  assert.equal(labelOf(def("set")), "set … to …");
  assert.equal(labelOf(def("arith")), "… + …");
  assert.equal(labelOf(def("repeat")), "repeat … times");
});

test("the list is the scope as rows, most used first; a search finds by the first word, then any word; a kind narrows it", () => {
  const rows = rowsFor(null, (def) => def.kind === "statement" && !def.top);
  assert.ok(rows.length > 10);
  assert.equal(rows[0].type, "repeat");                 // the basics stand first when the catalogue has no ranks
  assert.ok(rows.every((r) => r.colour && r.kindName));
  assert.deepEqual(matching(rows, "circle").map((r) => r.type), ["circle"]);
  assert.ok(matching(rows, "size").map((r) => r.type).includes("canvas_size"));
  assert.ok(matching(rows, "", "shapes").every((r) => r.kind === "shapes"));
  assert.deepEqual(matching(rows, "zzz"), []);
});

test("a rank comes from the catalogue for a kit block, else from the basics", () => {
  const catalogue = { functions: new Map([["circle", { rank: 138 }]]), values: new Map(), libraries: new Map() };
  assert.equal(rankOfBlock(BLOCKS.find((b) => b.type === "circle"), catalogue), 138);
  assert.equal(rankOfBlock(BLOCKS.find((b) => b.type === "circle"), null), 0);
  assert.ok(rankOfBlock(BLOCKS.find((b) => b.type === "set"), catalogue) > 138);
});

// ---------------------------------------------------------------------------------------------------------------
// Lines and blocks

test("matchLines finds each block's first line in order, and gives 0 for one that is not there", () => {
  const lines = ["import x", "", "def draw():", "    a()", "    a()", "    b()"];
  assert.deepEqual(matchLines(lines, ["def draw():", "a()", "a()", "b()", "zzz"]), [3, 4, 5, 6, 0]);
});

test("blockLines says which block wrote which line of the Time-based example", () => {
  withWorkspace(timeBased, (workspace) => {
    const code = generator.workspaceToCode(workspace).split("\n");
    const found = blockLines(workspace);
    const lineOf = (type) => found.find((l) => l.block.type === typeOf(type))?.line;
    assert.equal(code[lineOf("circle") - 1].trim(), "f.circle(x, f.height / 2, 80)");
    assert.equal(code[lineOf("fill") - 1].trim(), 'f.fill("seagreen")');
    assert.equal(code[lineOf("if") - 1].trim(), "if x > f.width:");
    assert.equal(code[lineOf("sketch_frame") - 1].trim(), "def draw():");
  });
});

test("what can be done with a picked block: ends and C blocks differ", () => {
  withWorkspace(timeBased, (workspace) => {
    const block = (type) => workspace.getBlocksByType(typeOf(type), false)[0];
    const background = actionsFor(block("background"));
    assert.equal(background.up, false);                // the first line inside draw: it could leave only above a hat, and a hat has no top
    assert.equal(background.down, true);
    assert.equal(background.out, false);               // a hat has nothing after it to go out to
    assert.equal(background.in, false);                // nothing above it
    const change = actionsFor(block("change"));
    assert.equal(change.in, false);                    // the circle above it has no inside
    assert.equal(change.up, true);
    const fill = actionsFor(block("fill"));
    assert.equal(fill.copy, true);
    const hat = actionsFor(block("sketch_frame"));
    assert.equal(hat.wrap, false);
    assert.equal(hat.copy, false);
  });
});
