// BF-D-053, spike B: what a row says (editor/phone/rows.js) and the moves both spikes share (editor/phone/moves.js). Headless (no page): the
// rows are plain data from a Blockly workspace with no page, and the page itself is checked by tools/spike_b_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as Blockly from "blockly";

import { registerBlocks, registeredSettings, toolboxBlock, typeOf } from "../editor/blocks/register.js";
import { BLOCKS } from "../editor/blocks/table.js";
import { generator, headerLines } from "../editor/generator/python.js";
import { describeProgram, inkFor, LOOKS, segmentsOf, textOfParts } from "../editor/phone/rows.js";
import {
  actionsFor, addAt, duplicate, moveDown, moveIn, moveOut, moveUp, remove, takeOut, wrapIn, MOVE_WORDS,
} from "../editor/phone/moves.js";
import { blockAtLine } from "../editor/phone/lines.js";
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

const lines = (workspace, look) => describeProgram(workspace, look).map((r) => `${"  ".repeat(r.depth)}${r.type === "line" ? textOfParts(r.parts, r.look) : "(empty)"}`);
const first = (workspace, type) => workspace.getBlocksByType(typeOf(type), false)[0];
const python = (workspace) => generator.workspaceToCode(workspace);

// ---------------------------------------------------------------------------------------------------------------
// The words of a row (the Blocks look)

test("the Blocks look has the words of the blocks, one row for each line, a body one step in", () => {
  withWorkspace(timeBased, (workspace) => {
    assert.deepEqual(lines(workspace, "blocks"), [
      "set x to 0",
      "when the sketch starts",
      "  canvas size 640 by 400",
      "every frame",
      "  background \"white\"",
      "  fill colour \"seagreen\"",
      "  circle at x x y (height ÷ 2) size 80",
      "  change x by (150 × (f . delta_time))",
      "  if (x > width) then",
      "    set x to 0",
    ]);
  });
});

test("a line's parts: words, a chip for a field, a chip for a value, a chip with chips in it for a sum", () => {
  withWorkspace(timeBased, (workspace) => {
    const circle = describeProgram(workspace).find((r) => r.block.type === typeOf("circle"));
    assert.deepEqual(circle.parts.map((p) => p.type), ["word", "slot", "word", "slot", "word", "slot"]);
    const [, x0, , y0, , d0] = circle.parts;
    assert.equal(x0.text, "x");                           // a leaf: a variable
    assert.equal(x0.block.type, typeOf("variable"));
    assert.equal(y0.parts.map((p) => p.type).join(), "slot,field,slot");     // height ÷ 2: two chips and the operator, a chip too
    assert.equal(y0.parts[1].kind, "choice");
    assert.equal(y0.parts[1].text, "÷");
    assert.equal(d0.text, "80");
    assert.equal(d0.conn.getParentInput().name, "D");
    const set = describeProgram(workspace)[0];
    assert.equal(set.parts[1].kind, "name");              // the name in "set x to 0" is a field: the variables sheet
    assert.equal(set.parts[1].text, "x");
  });
});

test("rows know their depth, the colours of the blocks they are in, and whether they are a hat", () => {
  withWorkspace(timeBased, (workspace) => {
    const rows = describeProgram(workspace).filter((r) => r.type === "line");
    const frame = rows.find((r) => r.block.type === typeOf("sketch_frame"));
    const inside = rows.find((r) => r.block.type === typeOf("background"));
    const nested = rows.filter((r) => r.block.type === typeOf("set"))[1];
    assert.equal(frame.hat, true);
    assert.equal(frame.depth, 0);
    assert.deepEqual(inside.rails, [frame.colour]);
    assert.equal(nested.depth, 2);
    assert.equal(nested.rails.length, 2);
    assert.equal(nested.rails[0], frame.colour);
    assert.equal(rows[0].hat, false);
  });
});

test("an if with else if and else is a row for each part, each with its own body; an empty body is a row that can be tapped", () => {
  const program1 = program([s.if([[v.gt(x("a"), 1), [s.say(t("big"))]], [v.lt(x("a"), 0), []]], [s.say(t("small"))])]);
  withWorkspace(program1, (workspace) => {
    assert.deepEqual(lines(workspace, "blocks"), [
      "if (a > 1) then", "  say \"big\"", "else if (a < 0) then", "  (empty)", "else", "  say \"small\"",
    ]);
    assert.deepEqual(lines(workspace, "code"), ["if a > 1:", "  print(\"big\")", "elif a < 0:", "  (empty)", "else:", "  print(\"small\")"]);
    const empty = describeProgram(workspace).find((r) => r.type === "empty");
    assert.equal(empty.conn.getParentInput().name, "DO1");
    assert.equal(empty.block.type, typeOf("if"));
  });
});

test("Python code blocks are one line: the words and the first line of the text", () => {
  withWorkspace(program([s.code("import math\nprint(math.pi)\n")]), (workspace) => {
    const [row] = describeProgram(workspace);
    assert.equal(row.parts[0].text, "Python code:");
    assert.equal(row.parts[1].kind, "code");
    assert.equal(row.parts[1].text, "import math…");
    assert.equal(describeProgram(workspace, "code").length, 1);
  });
});

test("an empty slot is a chip with no block (it can still be tapped)", () => {
  withWorkspace({ blocks: { languageVersion: 0, blocks: [{ type: "bf_set", fields: { VAR: "a" } }] } }, (workspace) => {
    const [row] = describeProgram(workspace);
    const slot = row.parts.find((p) => p.type === "slot");
    assert.equal(slot.block, null);
    assert.equal(slot.text, "empty");
    assert.equal(slot.conn.getParentInput().name, "VALUE");
  });
});

test("text on a coloured row is black or white, whichever reads", () => {
  assert.equal(inkFor("#FFBF00"), "#191970");
  assert.equal(inkFor("#5E5E5E"), "#ffffff");
  assert.equal(inkFor("#FFFFFF"), "#191970");
  assert.equal(inkFor("#000000"), "#ffffff");
});

test("an unknown look is refused", () => {
  withWorkspace(timeBased, (workspace) => {
    assert.deepEqual(LOOKS, ["blocks", "code"]);
    assert.throws(() => describeProgram(workspace, "pictures"), /look must be/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The Code look is the generator's line

test("the Code look has the generator's line, with the values as chips", () => {
  withWorkspace(timeBased, (workspace) => {
    assert.deepEqual(lines(workspace, "code"), [
      "x = 0", "def setup():", "  f.size(640, 400)", "def draw():", "  f.background(\"white\")", "  f.fill(\"seagreen\")",
      "  f.circle(x, f.height / 2, 80)", "  x += 150 * f.delta_time", "  if x > f.width:", "    x = 0",
    ]);
    const circle = describeProgram(workspace, "code").find((r) => r.block.type === typeOf("circle"));
    const chips = circle.parts.filter((p) => p.type === "slot");
    assert.deepEqual(chips.map((c) => c.text), ["x", "f.height / 2", "80"]);       // one chip for each slot; a sum is one chip
    assert.equal(chips.every((c) => !c.parts && c.block), true);
  });
});

const normal = (text) => text.replace(/\s+/g, " ").trim();

/** Every row of the Code look says what the generator writes for that line (the header lines of its block). */
function sameAsGenerator(workspace, label) {
  for (const row of describeProgram(workspace, "code")) {
    if (row.type !== "line") continue;
    const written = normal(headerLines(row.block)[row.segment]);
    const shown = normal(textOfParts(row.parts, "code"));
    // Python code of several lines is one row: its first line and "…"
    if (shown.endsWith("…")) assert.ok(written.startsWith(shown.slice(0, -1)), `${label}: ${row.block.type}`);
    else assert.equal(shown, written, `${label}: ${row.block.type}`);
  }
}

test("the Code look matches the generator's line for every example program", async () => {
  const dir = fileURLToPath(new URL("./fixtures/", import.meta.url));
  const names = readdirSync(dir).filter((f) => /^p\d+_.*\.js$/.test(f));
  assert.ok(names.length > 20);
  for (const name of names) {
    const json = (await import(pathToFileURL(dir + name).href)).default;
    withWorkspace(json, (workspace) => sameAsGenerator(workspace, name));
  }
  withWorkspace(timeBased, (workspace) => sameAsGenerator(workspace, "time_based"));
});

test("the Code look matches the generator's line for every statement block, as the toolbox makes it", () => {
  withWorkspace(null, (workspace) => {
    const types = BLOCKS.filter((b) => b.kind === "statement").map((b) => b.type);
    for (const type of types) {
      const block = Blockly.serialization.blocks.append(toolboxBlock(type), workspace);
      sameAsGenerator(workspace, type);
      assert.ok(segmentsOf(block, "blocks").length >= 1, type);
      block.dispose(false);
    }
  });
});

test("calls with arguments, keywords and a gear: the Code look and the Blocks look both read them", () => {
  const calls = program([
    s.say(t("a"), t("b")),
    s.call("print", t("x"), { keyword: "end", value: t("") }),
    s.method(x("f"), "circle", 1, 2, 3),
  ]);
  withWorkspace(calls, (workspace) => {
    assert.deepEqual(lines(workspace, "code"), ["print(\"a\", \"b\")", "print(\"x\", end=\"\")", "f.circle(1, 2, 3)"]);
    const blocks = lines(workspace, "blocks");
    assert.equal(blocks.length, 3);
    assert.match(blocks[0], /^say "a" and "b"$/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The moves both spikes share

test("up, down, in, out move one line and the Python follows", () => {
  withWorkspace(timeBased, (workspace) => {
    const circle = first(workspace, "circle");
    assert.equal(moveUp(circle), null);
    assert.match(python(workspace), /f\.circle\(x, f\.height \/ 2, 80\)\n {4}f\.fill\("seagreen"\)/);
    assert.equal(moveDown(circle), null);
    assert.match(python(workspace), /f\.fill\("seagreen"\)\n {4}f\.circle/);
    const change = first(workspace, "change");
    assert.equal(moveDown(change), null);              // below the if
    assert.equal(moveIn(change), null);                // into the if above it
    assert.match(python(workspace), /if x > f\.width:\n {8}x = 0\n {8}x \+= 150 \* f\.delta_time/);
    assert.equal(moveOut(change), null);
    assert.match(python(workspace), /if x > f\.width:\n {8}x = 0\n {4}x \+= 150 \* f\.delta_time/);
    assert.equal(moveOut(change), MOVE_WORDS.notInside);
  });
});

test("a move that cannot be done says why, and changes nothing", () => {
  withWorkspace(timeBased, (workspace) => {
    const before = python(workspace);
    assert.equal(moveUp(first(workspace, "set")), MOVE_WORDS.first);
    assert.equal(moveIn(first(workspace, "background")), MOVE_WORDS.noRoom);
    assert.equal(python(workspace), before);
  });
});

test("the first block of a stack can be taken out: what is under it keeps its place, and a hat can be deleted", () => {
  withWorkspace(program([s.set("a", 1), s.set("b", 2)], [s.set("c", 3)]), (workspace) => {
    const a = workspace.getBlocksByType(typeOf("set"), false).find((b) => b.getFieldValue("VAR") === "a");
    remove(a);
    assert.match(python(workspace), /^b = 2\nc = 3\n/);          // b stayed above c, where the stack was
  });
  withWorkspace(timeBased, (workspace) => {
    remove(first(workspace, "sketch_start"));
    assert.doesNotMatch(python(workspace), /def setup/);
    assert.match(python(workspace), /def draw\(\)/);
  });
});

test("copy puts a copy right under, wrap puts the block in a new C, delete takes it away", () => {
  withWorkspace(timeBased, (workspace) => {
    const fill = first(workspace, "fill");
    const copy = duplicate(workspace, fill);
    assert.equal(copy.previousConnection.targetBlock(), fill);
    assert.equal(python(workspace).split("f.fill(\"seagreen\")").length, 3);
    remove(copy);
    assert.equal(python(workspace).split("f.fill(\"seagreen\")").length, 2);
    wrapIn(workspace, first(workspace, "circle"), "repeat");
    assert.match(python(workspace), /for _ in range\(10\):\n {8}f\.circle\(x, f\.height \/ 2, 80\)\n {4}x \+= 150/);
  });
});

test("a block added where it was meant to go goes there once; one that cannot go there is not added", () => {
  withWorkspace(timeBased, (workspace) => {
    const before = workspace.getAllBlocks(false).length;
    const added = addAt(workspace, "circle", { kind: "below", block: first(workspace, "fill") });
    assert.ok(added.block);
    assert.match(python(workspace), /f\.fill\("seagreen"\)\n {4}f\.circle\(320, 200, 80\)\n {4}f\.circle\(x,/);
    assert.equal(workspace.getAllBlocks(false).length - before, 4);          // the circle and its three numbers
    const refused = addAt(workspace, "sketch_start", { kind: "below", block: first(workspace, "fill") });
    assert.equal(refused.problem, MOVE_WORDS.cannot);
    assert.equal(workspace.getAllBlocks(false).length - before, 4);
  });
});

test("a hat added to a sketch goes after the last stack; the end of the sketch takes a statement", () => {
  withWorkspace(timeBased, (workspace) => {
    assert.ok(addAt(workspace, "key_pressed", { kind: "end" }).block);
    assert.match(python(workspace), /def draw\(\):[\s\S]*def key_pressed\(\):/);
    assert.ok(addAt(workspace, "no_fill", { kind: "end" }).block);               // the end of the "every frame" hat
    assert.match(python(workspace), /if x > f\.width:\n {8}x = 0\n {4}f\.no_fill\(\)\n/);
  });
  withWorkspace(null, (workspace) => {
    assert.ok(addAt(workspace, "sketch_frame", { kind: "end" }).block);
    assert.ok(addAt(workspace, "background", { kind: "below", block: first(workspace, "sketch_frame") }).block);
    assert.match(python(workspace), /def draw\(\):\n {4}f\.background\("white"\)/);
  });
});

test("what can be done with a block is the same for both spikes (a hat can be deleted but not copied)", () => {
  withWorkspace(timeBased, (workspace) => {
    const hat = actionsFor(first(workspace, "sketch_frame"));
    assert.equal(hat.delete, true);
    assert.equal(hat.copy, false);
    takeOut(first(workspace, "fill"));                 // taken out and left hanging: nothing is lost
    assert.equal(workspace.getBlocksByType(typeOf("fill"), false).length, 1);
  });
});

test("the error line: the block that wrote line 7 of the Python, or the last line before it", () => {
  withWorkspace(timeBased, (workspace) => {
    const code = python(workspace).split("\n");
    const at = code.findIndex((l) => l.includes("f.circle(")) + 1;
    assert.equal(blockAtLine(workspace, at).type, typeOf("circle"));
    assert.equal(blockAtLine(workspace, 9999)?.type, typeOf("set"));         // past the end: the last line that has a block
  });
});
