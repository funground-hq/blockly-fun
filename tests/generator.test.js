// Blocks to Python, byte for byte (phase A). Every fixture is a program built with tests/dsl.js; its expected
// text is the file in contract/programs/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as Blockly from "blockly";

import { toPython } from "../editor/index.js";
import { registerBlocks, isName, typeOf } from "../editor/blocks/register.js";
import { BLOCKS } from "../editor/blocks/table.js";
import { generator } from "../editor/generator/python.js";
import { stmt as s, val as v, text as t, num as n, name as x, kw, program } from "./dsl.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PROGRAMS = path.join(here, "..", "contract", "programs");
const FIXTURES = path.join(here, "fixtures");
const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";

const names = fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
const expected = (name) => fs.readFileSync(path.join(PROGRAMS, name + ".py"), "utf8");
const fixture = async (name) => (await import(pathToFileURL(path.join(FIXTURES, name + ".js")))).default;

// What a program is given on standard input so that it finishes whatever the dice say.
const STDIN = {
  p01_guess_number: Array.from({ length: 20 }, (_, i) => i + 1).join("\n") + "\n",
  p02_times_table: "7\n",
  p03_quiz: "Paris\n8\nGreen\n",
  p04_shopping_list: "milk\neggs\ndone\n",
  p09_temperature: "20\n",
  p10_score_keeper: "y\nn\nn\nn\n",
  p11_rock_paper_scissors: "rock\n",
  p13_average_marks: "2\n50\n60\n",
  p15_mad_libs: "Mia\ncat\nfish\n3\n",
  p18_sum_to_n: "5\n",
  p20_vowel_counter: "education\n",
  p23_safe_number: "abc\n12\n",
  p26_ticket_price: "10\nno\n",
  p28_robot_talk: "Bob\nno\n",
  // a path over every square of the 5 x 5 board, so it meets the treasure wherever it is
  p30_treasure_hunt: "e n n n n n e s s s s e n n n n e s s s s e n n n n".split(" ").join("\n") + "\n",
};

// The program runs in CPython as written; only time.sleep is made instant so a test does not wait. A sketch (phase
// C+) runs with no window, and f.run() draws 30 frames and returns (funground's own max_frames), so it ends.
const RUNNER = [
  "import os, sys, time, inspect",
  "time.sleep = lambda seconds: None",
  "os.environ['FUNGROUND_HEADLESS'] = '1'",
  "try:",
  "    import funground, funground.api",
  "    def run(*, fps=None, max_frames=None):",
  "        funground.api.canvas_sketch().run_namespace(inspect.currentframe().f_back.f_globals, fps=fps, max_frames=30)",
  "    funground.run = run",
  "except ImportError:",
  "    pass",
  "source = open(sys.argv[1], encoding='utf-8').read()",
  "exec(compile(source, sys.argv[1], 'exec'), {'__name__': '__main__'})",
].join("\n");

function python(args, input) {
  return spawnSync(PYTHON, args, { input, encoding: "utf8", timeout: 30000 });
}

/** Python for a single value block, set into r. */
const expr = (node) => toPython(program(s.set("r", node)));
const body = (code) => code.replace(/^r = /, "").trimEnd();

test("there is a fixture for every program in contract/programs", () => {
  const programs = fs.readdirSync(PROGRAMS).filter((f) => f.endsWith(".py")).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(names, programs);
  assert.equal(names.length, 29);
});

test("the table has a block for every definition and no id twice", () => {
  const ids = BLOCKS.map((b) => b.type);
  assert.equal(new Set(ids).size, ids.length);
  registerBlocks({ words: "scratch", pythonLine: true });
  for (const id of ids) assert.ok(Blockly.Blocks[typeOf(id)], id);
});

for (const name of names) {
  test(`${name}: the expected file is Python`, () => {
    const result = python(["-I", "-c", "import ast,sys;ast.parse(open(sys.argv[1],encoding='utf-8').read())",
      path.join(PROGRAMS, name + ".py")]);
    assert.equal(result.status, 0, result.stderr);
  });

  test(`${name}: blocks make the expected Python, byte for byte`, async () => {
    assert.equal(toPython(await fixture(name)), expected(name));
  });

  test(`${name}: the Python runs in CPython`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bf-run-"));
    const file = path.join(dir, name + ".py");
    try {
      fs.writeFileSync(file, toPython(await fixture(name)), "utf8");
      const result = python(["-I", "-c", RUNNER, file], STDIN[name] ?? "");
      assert.equal(result.status, 0, result.stderr);
    } finally {
      fs.unlinkSync(file);
      fs.rmdirSync(dir);
    }
  });

  test(`${name}: contract file has LF line ends and one final newline`, () => {
    const text = expected(name);
    assert.ok(!text.includes("\r"));
    assert.ok(text.endsWith("\n") && !text.endsWith("\n\n"));
  });
}

test("settings: Scratch or Python words, Python line on or off, the same Python", async () => {
  for (const name of names) {
    const json = await fixture(name);
    const texts = new Set();
    for (const words of ["scratch", "python"]) {
      for (const pythonLine of [true, false]) {
        registerBlocks({ words, pythonLine });
        texts.add(toPython(json));
      }
    }
    assert.equal(texts.size, 1, name);
  }
  registerBlocks({ words: "scratch", pythonLine: true });
});

test("settings: a saved workspace loads under the other settings and makes the same Python", async () => {
  const json = await fixture("p14_star_pattern");
  registerBlocks({ words: "scratch", pythonLine: true });
  const workspace = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(json, workspace);
  const saved = Blockly.serialization.workspaces.save(workspace);
  workspace.dispose();
  const before = toPython(saved);
  registerBlocks({ words: "python", pythonLine: false });
  assert.equal(toPython(saved), before);
  assert.equal(before, expected("p14_star_pattern"));
  registerBlocks({ words: "scratch", pythonLine: true });
});

test("the Python line is a row of its own only when it is on", () => {
  const labels = (pythonLine, words) => {
    registerBlocks({ words, pythonLine });
    const workspace = new Blockly.Workspace();
    const block = workspace.newBlock(typeOf("repeat"));
    const found = block.inputList.flatMap((i) => i.fieldRow).map((f) => f.getText());
    workspace.dispose();
    return found.join("|");
  };
  assert.ok(labels(true, "scratch").includes("for _ in range(N):"));
  assert.ok(!labels(false, "scratch").includes("for _ in range"));
  assert.ok(labels(false, "scratch").includes("repeat"));
  assert.ok(labels(false, "python").includes("for _ in range("));
  registerBlocks({ words: "scratch", pythonLine: true });
});

test("precedence: brackets only where Python needs them", () => {
  const a = x("a"), b = x("b"), c = x("c");
  assert.equal(body(expr(v.mul(v.add(a, b), c))), "(a + b) * c");
  assert.equal(body(expr(v.add(a, v.mul(b, c)))), "a + b * c");
  assert.equal(body(expr(v.sub(a, v.sub(b, c)))), "a - (b - c)");
  assert.equal(body(expr(v.sub(v.sub(a, b), c))), "a - b - c");
  assert.equal(body(expr(v.div(a, v.mul(b, c)))), "a / (b * c)");
  assert.equal(body(expr(v.div(v.div(a, b), c))), "a / b / c");
  assert.equal(body(expr(v.div(a, v.div(b, c)))), "a / (b / c)");
  assert.equal(body(expr(v.pow(a, v.pow(b, c)))), "a ** b ** c");
  assert.equal(body(expr(v.pow(v.pow(a, b), c))), "(a ** b) ** c");
  assert.equal(body(expr(v.neg(v.pow(x("x"), 2)))), "-x ** 2");
  assert.equal(body(expr(v.pow(v.neg(x("x")), 2))), "(-x) ** 2");
  assert.equal(body(expr(v.pow(n(-2), 2))), "(-2) ** 2");
  assert.equal(body(expr(v.pow(2, v.neg(x("x"))))), "2 ** -x");
  assert.equal(body(expr(v.neg(v.add(a, b)))), "-(a + b)");
  assert.equal(body(expr(v.not(v.and(a, b)))), "not (a and b)");
  assert.equal(body(expr(v.and(v.not(a), b))), "not a and b");
  assert.equal(body(expr(v.not(v.eq(a, b)))), "not a == b");
  assert.equal(body(expr(v.eq(v.not(a), b))), "(not a) == b");
  assert.equal(body(expr(v.or(a, v.and(b, c)))), "a or b and c");
  assert.equal(body(expr(v.and(v.or(a, b), c))), "(a or b) and c");
  assert.equal(body(expr(v.and(a, v.and(b, c)))), "a and (b and c)");
  assert.equal(body(expr(v.eq(v.eq(a, b), c))), "(a == b) == c");
  assert.equal(body(expr(v.lt(v.add(a, 1), v.mul(b, 2)))), "a + 1 < b * 2");
  assert.equal(body(expr(v.method(v.add(a, b), "lower"))), "(a + b).lower()");
  assert.equal(body(expr(v.itemAt(0, v.add(a, b)))), "(a + b)[0]");
  assert.equal(body(expr(v.contains(v.listOf(a, b), v.add(c, 1)))), "c + 1 in [a, b]");
  assert.equal(body(expr(v.floordiv(v.add(a, b), 2))), "(a + b) // 2");
  assert.equal(body(expr(v.mod(a, v.add(b, 1)))), "a % (b + 1)");
  assert.equal(body(expr(v.mul(v.neg(a), b))), "-a * b");
  assert.equal(body(expr(v.round(v.add(a, b)))), "round(a + b)");
});

test("an empty slot makes None, never nothing", () => {
  assert.equal(toPython(program(s.set("r", null))), "r = None\n");
  assert.equal(toPython(program(s.say(null))), "print(None)\n");
});

test("strings: double quotes, escaped", () => {
  assert.equal(body(expr(t("plain"))), "\"plain\"");
  assert.equal(body(expr(t("it's"))), "\"it's\"");
  assert.equal(body(expr(t("say \"hi\""))), "\"say \\\"hi\\\"\"");
  assert.equal(body(expr(t("back\\slash"))), "\"back\\\\slash\"");
  assert.equal(body(expr(t("two\nlines\ttab"))), "\"two\\nlines\\ttab\"");
  assert.equal(body(expr(t("bell\u0007"))), "\"bell\\x07\"");
  assert.equal(body(expr(t("caf\u00e9 \u2713"))), "\"caf\u00e9 \u2713\"");
  assert.equal(body(expr(t(""))), "\"\"");
});

test("keyword arguments: k=v, no spaces", () => {
  assert.equal(toPython(program(s.call("print", t("*"), kw("end", t(""))))), "print(\"*\", end=\"\")\n");
  assert.equal(
    toPython(program(s.method(x("data"), "sort", kw("key", x("len")), kw("reverse", v.bool(true))))),
    "data.sort(key=len, reverse=True)\n");
  assert.equal(body(expr(v.call("f", 1, x("b"), kw("k", v.add(1, 2))))), "f(1, b, k=1 + 2)");
  assert.equal(body(expr(v.call("f"))), "f()");
});

test("imports: once each, in the order math, random, time, only when used", () => {
  assert.equal(toPython(program(s.say(t("hi")))), "print(\"hi\")\n");
  assert.equal(
    toPython(program(s.wait(1), s.set("a", v.randint(1, 2)), s.set("b", v.sqrt(4)), s.set("c", v.randint(3, 4)))),
    "import math\nimport random\nimport time\n\ntime.sleep(1)\na = random.randint(1, 2)\nb = math.sqrt(4)\nc = random.randint(3, 4)\n");
  assert.equal(toPython(program(s.method(x("time"), "sleep", 1))), "import time\n\ntime.sleep(1)\n");
  assert.equal(toPython(program(s.set("r", v.method(x("math"), "floor", 2.5)))), "import math\n\nr = math.floor(2.5)\n");
  assert.equal(
    toPython(program(s.set("a", v.method(x("random"), "random")), s.set("b", v.randint(1, 2)))),
    "import random\n\na = random.random()\nb = random.randint(1, 2)\n");
  // an object that is not one of the three modules brings no import
  assert.equal(toPython(program(s.method(x("robot"), "random"))), "robot.random()\n");
  assert.equal(toPython(program(s.set("random", n(1)))), "random = 1\n");
});

test("imports of funground's libraries: after the modules and `import funground as f`, one line each, alphabetical", () => {
  assert.equal(toPython(program(s.method(x("sound"), "melody", t("c d e")))),
    "from funground import sound\n\nsound.melody(\"c d e\")\n");
  assert.equal(
    toPython(program(s.method(x("sound"), "beep"), s.set("a", v.method(x("ml"), "go")), s.set("b", v.randint(1, 2)),
      s.method(x("camera"), "photo"), s.method(x("sangeet"), "play"))),
    "import random\n\nfrom funground import camera\nfrom funground import ml\nfrom funground import sangeet\n" +
    "from funground import sound\n\nsound.beep()\na = ml.go()\nb = random.randint(1, 2)\ncamera.photo()\nsangeet.play()\n");
  // after the modules and `import funground as f`, the sketch's own ending kept
  assert.equal(
    toPython(program(s.set("x", v.randint(1, 2)), s.method(x("sound"), "beep"), s.circle(1, 2, 3))),
    "import random\n\nimport funground as f\nfrom funground import sound\n\nx = random.randint(1, 2)\nsound.beep()\n" +
    "f.circle(1, 2, 3)\nf.show()\n");
  // a name the program does not call as a library, or already imports in Python code, brings no line
  assert.equal(toPython(program(s.set("sound", n(1)))), "sound = 1\n");
  assert.equal(toPython(program(s.method(x("robot"), "sound"))), "robot.sound()\n");
  for (const line of ["from funground import sound", "from funground import ml, sound", "from funground import sound as s",
    "from funground import (ml,\n    sound)", "from funground import sound  # play", "from funground import *"]) {
    assert.equal(toPython(program(s.code(line), s.method(x("sound"), "beep"))), `${line}\nsound.beep()\n`, line);
  }
  assert.equal(toPython(program(s.code("from funground import ml"), s.method(x("sound"), "beep"))),
    "from funground import sound\n\nfrom funground import ml\nsound.beep()\n");
});

test("a header, the first stack of comments and a docstring, is written above the imports (BF-7)", () => {
  const roll = () => s.set("x", v.randint(1, 6));
  assert.equal(toPython(program([s.code('"""A."""')], [roll()])), '"""A."""\nimport random\n\nx = random.randint(1, 6)\n');
  assert.equal(toPython(program([s.code("# A."), s.code("# B.").blank(1)], [roll().blank(1)])),
    "# A.\n\n# B.\nimport random\n\n\nx = random.randint(1, 6)\n");
  assert.equal(toPython(program([s.code("# A."), s.code('"""B."""'), s.code("# C.")], [roll()])),
    '# A.\n"""B."""\n# C.\nimport random\n\nx = random.randint(1, 6)\n');
  assert.equal(toPython(program([s.code('"""A."""')], [s.method(x("sound"), "beep")])),
    '"""A."""\nfrom funground import sound\n\nsound.beep()\n');
  // with no import to write the code follows the header as it stands
  assert.equal(toPython(program([s.code('"""A."""')], [s.set("x", n(1)).blank(1)])), '"""A."""\n\nx = 1\n');
  // a first stack that holds anything else starts the program, the imports above it
  assert.equal(toPython(program([s.code("# A."), roll()])), "import random\n\n# A.\nx = random.randint(1, 6)\n");
  assert.equal(toPython(program([s.code('"A" "B"')], [roll()])),
    'import random\n\n"A" "B"\nx = random.randint(1, 6)\n');
  // a string that is a call is not a docstring
  assert.equal(toPython(program([s.code('"{}".format(random.random())')], [roll()])),
    'import random\n\n"{}".format(random.random())\nx = random.randint(1, 6)\n');
});

test("a general call that equals a named block's form makes the same text", () => {
  const same = (named, general) => assert.equal(toPython(program(s.set("r", named))), toPython(program(s.set("r", general))));
  same(v.round(x("a")), v.call("round", x("a")));
  same(v.length(x("a")), v.call("len", x("a")));
  same(v.int(x("a")), v.call("int", x("a")));
  same(v.abs(x("a")), v.call("abs", x("a")));
  same(v.randint(1, 6), v.method(x("random"), "randint", 1, 6));
  same(v.sqrt(x("a")), v.method(x("math"), "sqrt", x("a")));
  assert.equal(toPython(program(s.wait(2))), toPython(program(s.method(x("time"), "sleep", 2))));
  assert.equal(toPython(program(s.addTo(1, x("L")))), toPython(program(s.method(x("L"), "append", 1))));
  assert.equal(toPython(program(s.say(x("a"), x("b")))), toPython(program(s.call("print", x("a"), x("b")))));
});

test("the top level keeps the order of the stacks on the page: top to bottom, then left to right", () => {
  const json = program([s.say(t("one"))], [s.say(t("two"))], [s.say(t("three"))], [s.say(t("four"))]);
  const [, second, third, fourth] = json.blocks.blocks;
  second.y = 300;
  third.y = 100;
  fourth.y = 100;
  fourth.x = 200; // beside "three", to its right
  assert.equal(toPython(json), "print(\"one\")\nprint(\"three\")\nprint(\"four\")\nprint(\"two\")\n");
  fourth.x = -50; // now to its left
  assert.equal(toPython(json), "print(\"one\")\nprint(\"four\")\nprint(\"three\")\nprint(\"two\")\n");
});

test("each def is a stack of its own and the code between functions stays between them", () => {
  const json = program(
    [s.set("a", n(1))],
    [s.def("f", "", [s.ret(n(1))]).blank(1)],
    [s.set("b", n(2)).blank(1)],
    [s.def("g", "", [s.ret(n(2))]).blank(1)]);
  assert.equal(toPython(json),
    "a = 1\n\ndef f():\n    return 1\n\nb = 2\n\ndef g():\n    return 2\n");
});

test("blank lines and comments", () => {
  assert.equal(toPython(program([s.set("a", n(1)).blank(2), s.set("b", n(2))])), "a = 1\nb = 2\n");
  assert.equal(toPython(program([s.set("a", n(1)), s.set("b", n(2)).blank(2)])), "a = 1\n\n\nb = 2\n");
  assert.equal(toPython(program([s.set("a", n(1)).comment("first\nsecond")])), "# first\n# second\na = 1\n");
  assert.equal(toPython(program([s.set("a", n(1)).comment("first\n\nthird")])), "# first\n#\n# third\na = 1\n");
  assert.equal(toPython(program([s.set("a", n(1)).comment("note", { trailing: true })])), "a = 1  # note\n");
  assert.equal(
    toPython(program([s.repeat(2, [s.say(n(1)).blank(1).comment("inside")]).comment("loop", { trailing: true })])),
    "for _ in range(2):  # loop\n\n    # inside\n    print(1)\n");
  assert.equal(
    toPython(program([s.set("a", n(1)), s.set("b", n(2)).blank(1).comment("own line"), s.set("c", n(3))])),
    "a = 1\n\n# own line\nb = 2\nc = 3\n");
});

test("loops and bodies", () => {
  assert.equal(toPython(program(s.repeat(3, [s.say(n(1))]))), "for _ in range(3):\n    print(1)\n");
  assert.equal(toPython(program(s.count("i", null, 5, [s.say(x("i"))]))), "for i in range(5):\n    print(i)\n");
  assert.equal(toPython(program(s.count("i", 2, 5, [s.say(x("i"))]))), "for i in range(2, 5):\n    print(i)\n");
  assert.equal(toPython(program(s.countBy("i", 0, 10, 2, [s.say(x("i"))]))), "for i in range(0, 10, 2):\n    print(i)\n");
  assert.equal(toPython(program(s.forEach("c", x("word"), [s.say(x("c"))]))), "for c in word:\n    print(c)\n");
  assert.equal(toPython(program(s.while(v.bool(true), [s.break()]))), "while True:\n    break\n");
  assert.equal(
    toPython(program(s.until(v.or(x("a"), x("b")), [s.continue()]))), "while not (a or b):\n    continue\n");
  assert.equal(toPython(program(s.until(x("a"), [s.continue()]))), "while not a:\n    continue\n");
  assert.equal(
    toPython(program(s.repeat(2, [s.repeat(3, [s.say(n(1))]), s.say(n(2))]))),
    "for _ in range(2):\n    for _ in range(3):\n        print(1)\n    print(2)\n");
  assert.equal(
    toPython(program(s.if([[x("a"), [s.say(n(1))]], [x("b"), [s.say(n(2))]]], [s.say(n(3))]))),
    "if a:\n    print(1)\nelif b:\n    print(2)\nelse:\n    print(3)\n");
});

test("an empty body is pass, and nothing crashes", () => {
  assert.equal(toPython(program(s.repeat(2, []))), "for _ in range(2):\n    pass\n");
  assert.equal(toPython(program(s.if([[x("a"), []]], []))), "if a:\n    pass\nelse:\n    pass\n");
  assert.equal(toPython(program(s.def("f", "a, b", []))), "def f(a, b):\n    pass\n");
  assert.equal(toPython(program(s.forever([]))), "while True:\n    pass\n");
  assert.equal(toPython({ blocks: { languageVersion: 0, blocks: [] } }), "");
  assert.equal(toPython({}), "");
});

test("lists, functions and return", () => {
  assert.equal(body(expr(v.emptyList())), "[]");
  assert.equal(body(expr(v.listOf(1, 2, 3))), "[1, 2, 3]");
  assert.equal(toPython(program(s.setItem(x("i"), x("L"), n(0)))), "L[i] = 0\n");
  assert.equal(toPython(program(s.removeItem(0, x("L")))), "L.pop(0)\n");
  assert.equal(toPython(program(s.def("add", "a,b", [s.ret(v.add(x("a"), x("b")))]))), "def add(a, b):\n    return a + b\n");
  assert.equal(toPython(program(s.def("f", "", [s.ret(null)]))), "def f():\n    return\n");
});

test("Python code blocks hold their text exactly", () => {
  const source = "try:\n    a = 1\nexcept ValueError:\n    pass";
  assert.equal(toPython(program(s.code(source))), source + "\n");
  assert.equal(toPython(program(s.repeat(1, [s.code(source)]))),
    "for _ in range(1):\n    try:\n        a = 1\n    except ValueError:\n        pass\n");
  assert.equal(body(expr(v.code("x if y else z"))), "x if y else z");
  assert.equal(body(expr(v.add(v.code("x if y else z"), 1))), "(x if y else z) + 1");
  assert.equal(body(expr(v.add(v.code("f\"{a}\""), t("b")))), "f\"{a}\" + \"b\"");
  assert.equal(body(expr(v.add(v.code("'single'"), t("b")))), "'single' + \"b\"");
});

test("names: Python names only", () => {
  for (const ok of ["a", "_", "total_2", "Name", "\u00e9t\u00e9"]) assert.ok(isName(ok), ok);
  for (const bad of ["", "2a", "a b", "for", "None", "class", "a-b", "x.y"]) assert.ok(!isName(bad), bad);
  registerBlocks({ words: "scratch", pythonLine: true });
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock(typeOf("set"));
  block.setFieldValue("for", "VAR");
  assert.equal(block.getFieldValue("VAR"), "v");
  block.setFieldValue("total", "VAR");
  assert.equal(block.getFieldValue("VAR"), "total");
  const def = workspace.newBlock(typeOf("def"));
  def.setFieldValue("a,b ,c", "PARAMS");
  assert.equal(def.getFieldValue("PARAMS"), "a, b, c");
  def.setFieldValue("a, 1", "PARAMS");
  assert.equal(def.getFieldValue("PARAMS"), "a, b, c");
  workspace.dispose();
});

test("the gear: items can be added, taken away and moved, and children follow", () => {
  registerBlocks({ words: "scratch", pythonLine: false });
  const workspace = new Blockly.Workspace();
  const json = program(s.say(t("a"), t("b"), t("c")), s.call("f", t("p"), kw("k", t("q")), t("r")));
  Blockly.serialization.workspaces.load(json, workspace);
  const [say, call] = workspace.getTopBlocks(true);

  const mutate = (block, edit) => {
    const root = block.decompose(workspace);
    const parts = [];
    for (let p = root.getInputTargetBlock("STACK"); p; p = p.getNextBlock()) parts.push(p);
    edit(root, parts);
    block.compose(root);
  };

  mutate(say, (root, parts) => parts[1].unplug(true)); // take the middle one away
  assert.equal(generator.blockToCode(say), "print(\"a\", \"c\")\n");
  mutate(say, (root) => {
    const extra = workspace.newBlock(typeOf("m_item"));
    let last = root.getInputTargetBlock("STACK");
    while (last.getNextBlock()) last = last.getNextBlock();
    last.nextConnection.connect(extra.previousConnection);
  });
  assert.equal(generator.blockToCode(say), "print(\"a\", \"c\", \"\")\n");

  // the first argument goes; the keyword one would now come first, and Python wants it last
  mutate(call, (root, parts) => parts[0].unplug(true));
  assert.equal(generator.blockToCode(call), "f(\"r\", k=\"q\")\n");
  assert.deepEqual(call.saveExtraState(), { args: ["p", "k"] });
  assert.equal(call.getFieldValue("KW1"), "k");
  workspace.dispose();
  registerBlocks({ words: "scratch", pythonLine: true });
});

// ---------------------------------------------------------------------------------------------------------------
// BF-6: the drawing kit's second part, the events kit, the sound, camera and ml kits, and the attribute block

/** One block as JSON: its fields, its value inputs (blocks or dsl nodes), its statement bodies (arrays) and extraState. */
const blk = (type, { fields, inputs = {}, body = {}, extra } = {}) => {
  const wired = {};
  const json = (node) => node.json ?? node;
  for (const [slot, value] of Object.entries(inputs)) wired[slot] = { block: json(typeof value === "number" ? n(value) : value) };
  for (const [slot, statements] of Object.entries(body)) {
    const blocks = statements.map(json);
    blocks.forEach((b, i) => { if (blocks[i + 1]) b.next = { block: blocks[i + 1] }; });
    wired[slot] = { block: blocks[0] };
  }
  return {
    type: "bf_" + type, ...(fields ? { fields } : {}), ...(extra ? { extraState: extra } : {}),
    ...(Object.keys(wired).length ? { inputs: wired } : {}),
  };
};
const attr = (object, name) => blk("attribute", { fields: { NAME: name }, inputs: { OBJ: object } });
const lib = (type, inputs) => blk(type, { inputs });

test("the drawing kit's second part: five blocks, and the import and ending a sketch needs", () => {
  assert.equal(
    toPython(program(blk("no_outline"), blk("no_fill"), blk("outline_width", { inputs: { N: 3 } }),
      blk("text_size", { inputs: { N: 24 } }), blk("text_align", { fields: { ALIGN: "right" } }))),
    "import funground as f\n\nf.no_stroke()\nf.no_fill()\nf.stroke_width(3)\nf.text_size(24)\nf.text_align(\"right\")\nf.show()\n");
  assert.equal(toPython(program(blk("outline_width"))), "import funground as f\n\nf.stroke_width(None)\nf.show()\n", "an empty slot makes None");
});

test("the events kit: two hats with the global rule, f.key, and a program with one ends with f.run()", () => {
  const code = toPython(program(
    s.set("score", n(0)),
    blk("key_pressed", { body: { DO: [s.change("score", n(1)), s.set("last", blk("sketch_value", { fields: { WHAT: "key" } }))] } }),
    blk("mouse_pressed", { body: { DO: [s.circle(n(1), n(2), n(3))] } })));
  assert.equal(code,
    "import funground as f\n\nscore = 0\ndef key_pressed():\n    global score\n    score += 1\n    last = f.key\n" +
    "def mouse_pressed():\n    f.circle(1, 2, 3)\n\n\nf.run()\n");
  // a hat that sets nothing the program uses elsewhere has no global line; without a hat of the loop, f.show()
  assert.equal(toPython(program(blk("mouse_pressed", { body: { DO: [s.circle(n(1), n(2), n(3))] } }))),
    "import funground as f\n\ndef mouse_pressed():\n    f.circle(1, 2, 3)\n\n\nf.run()\n");
});

test("the sound, camera and ml kits: library values and one statement, each with its import", () => {
  assert.equal(toPython(program(
    s.set("cam", blk("camera_open")),
    s.set("body", lib("ml_pose", { SRC: x("cam") })),
    blk("ml_teach", { inputs: { NAME: t("fist"), SRC: x("cam") } }),
    s.set("song", lib("sound_melody", { TEXT: t("C D E") })),
    s.set("a", blk("sound_note", { inputs: { NOTE: t("C4"), SECONDS: 1 } })),
    s.set("b", blk("sound_tone", { inputs: { HZ: 440, SECONDS: 1 } })),
    s.set("mic", blk("sound_microphone")),
    s.set("h", lib("ml_hand", { SRC: x("cam") })), s.set("g", lib("ml_guess", { SRC: x("cam") })),
    s.set("w", lib("ml_words", { SRC: x("mic") })), s.set("d", lib("ml_sound", { SRC: x("mic") })))),
  "from funground import camera\nfrom funground import ml\nfrom funground import sound\n\n" +
  "cam = camera.open()\nbody = ml.pose(cam)\nml.teach(\"fist\", cam)\nsong = sound.melody(\"C D E\")\na = sound.note(\"C4\", 1)\n" +
  "b = sound.tone(440, 1)\nmic = sound.microphone()\nh = ml.hand(cam)\ng = ml.guess(cam)\nw = ml.words(mic)\nd = ml.sound(mic)\n");
  // a kit value is a call, so it takes brackets where Python wants them, and a method of it needs none
  assert.equal(expr(v.method(blk("sound_tone", { inputs: { HZ: 440, SECONDS: 1 } }), "play")),
    "from funground import sound\n\nr = sound.tone(440, 1).play()\n");
  // already imported in Python code: no second import
  assert.equal(toPython(program(s.code("from funground import sound"), s.set("m", blk("sound_microphone")))),
    "from funground import sound\nm = sound.microphone()\n");
});

test("the attribute block: object.name, chains, whole numbers, and the import a module's attribute needs", () => {
  assert.equal(body(expr(attr(attr(x("body"), "nose"), "x"))), "body.nose.x");
  assert.equal(body(expr(v.add(attr(x("body"), "score"), 1))), "body.score + 1");
  assert.equal(toPython(program(s.method(attr(x("snap"), "size"), "count", n(1)))), "snap.size.count(1)\n");
  assert.equal(body(expr(attr(v.method(x("cam"), "picture"), "width"))), "cam.picture().width");
  assert.equal(body(expr(attr(v.add(x("a"), x("b")), "real"))), "(a + b).real", "brackets where the object needs them");
  assert.equal(body(expr(attr(attr(x("a"), "b"), "c"))), "a.b.c");
  // `1.real` is not Python; the generator brackets a whole number, for an attribute and for a call
  assert.equal(body(expr(attr(n(1), "real"))), "(1).real");
  assert.equal(body(expr(v.method(n(1), "bit_length"))), "(1).bit_length()");
  assert.equal(body(expr(attr(n(1.5), "real"))), "1.5.real");
  assert.equal(body(expr(attr(v.neg(n(1)), "real"))), "(-x).real".replace("x", "1"));
  // a module or funground library named as the object is imported for the program, as for a call
  assert.equal(toPython(program(s.set("p", attr(x("math"), "pi")))), "import math\n\np = math.pi\n");
  assert.equal(toPython(program(s.set("p", attr(x("sound"), "something")))), "from funground import sound\n\np = sound.something\n");
  assert.equal(toPython(program(s.set("p", attr(x("robot"), "arm")))), "p = robot.arm\n");
});
