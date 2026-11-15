// Phase B: the round-trip contract (Architecture section 5), Python's to_blocks against the JS generator.
//
//   1. blocks -> Python -> blocks gives the same blocks (positions, shadow-or-block and derived data aside);
//   2. Python in the plain style -> blocks -> Python gives the same text, byte for byte;
//   3. outside the subset nothing is lost: the same program (ast) and every comment, the rest still blocks.
//
// Python is run once for all programs (python -m blockly_fun), with BF_PYTHON or the playground venv.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toPython } from "../editor/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";
const PACKAGE = join(ROOT, "python");

/** convert() for each source, in one Python process. */
function convertAll(sources) {
  const script = `import sys; sys.path.insert(0, ${JSON.stringify(PACKAGE)}); from blockly_fun.__main__ import main; main()`;
  const result = spawnSync(PYTHON, ["-I", "-c", script], {
    input: JSON.stringify({ sources }), encoding: "utf8", timeout: 60000, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`to_blocks failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

/** Python's view of a program, comments aside: ast.dump of each, in one process. */
function astDumps(sources) {
  const script = "import ast, json, sys; print(json.dumps([ast.dump(ast.parse(s)) for s in json.load(sys.stdin)]))";
  const result = spawnSync(PYTHON, ["-I", "-c", script], { input: JSON.stringify(sources), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

/** The comments of a program, in order, as the generator writes them back ("#x" is read as "# x"). */
function comments(source) {
  const script = "import io, json, sys, tokenize\n" +
    "src = sys.stdin.read()\n" +
    "out = [t.string for t in tokenize.generate_tokens(io.StringIO(src).readline) if t.type == tokenize.COMMENT]\n" +
    "print(json.dumps(out))";
  const result = spawnSync(PYTHON, ["-I", "-c", script], { input: source, encoding: "utf8" });
  return JSON.parse(result.stdout).map((c) => c.replace(/^#\s?/, ""));
}

/**
 * Blocks as the contract compares them: no positions, a shadow is the same as a block, a comment is its text,
 * no blank lines on a program's first block (the generator writes none), no derived precedence on code values.
 */
function normalise(workspace) {
  const block = (b) => {
    const out = { type: b.type };
    if (b.fields && Object.keys(b.fields).length) out.fields = b.fields;
    const extra = { ...(b.extraState || {}) };
    delete extra.order;
    if (extra.blank === 0) delete extra.blank;
    if (extra.trailing === false) delete extra.trailing;
    if (Object.keys(extra).length) out.extraState = extra;
    if (b.icons && b.icons.comment) out.comment = b.icons.comment.text;
    const inputs = {};
    for (const [name, value] of Object.entries(b.inputs || {})) {
      const inner = value.block || value.shadow;
      if (inner) inputs[name] = block(inner);
    }
    if (Object.keys(inputs).length) out.inputs = inputs;
    if (b.next && b.next.block) out.next = block(b.next.block);
    return out;
  };
  const tops = (workspace.blocks ? workspace.blocks.blocks : [])
    .slice().sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0)).map(block);
  if (tops[0] && tops[0].extraState) {
    delete tops[0].extraState.blank;
    if (!Object.keys(tops[0].extraState).length) delete tops[0].extraState;
  }
  return tops;
}

const PROGRAMS = join(ROOT, "contract", "programs");
const OUTSIDE = join(ROOT, "contract", "outside");
const names = readdirSync(PROGRAMS).filter((f) => f.endsWith(".py")).map((f) => f.slice(0, -3)).sort();
const outsideNames = readdirSync(OUTSIDE).filter((f) => f.endsWith(".py")).sort();
const fixtures = Object.fromEntries(await Promise.all(names.map(async (name) =>
  [name, (await import(`./fixtures/${name}.js`)).default])));

// The texts: each contract program, the Python its fixture's blocks make (the same text, the generator tests say),
// and each program outside the subset.
const programTexts = names.map((n) => readFileSync(join(PROGRAMS, n + ".py"), "utf8").replace(/\r\n/g, "\n"));
const outsideTexts = outsideNames.map((f) => readFileSync(join(OUTSIDE, f), "utf8").replace(/\r\n/g, "\n"));
const converted = convertAll([...programTexts, ...outsideTexts]);
const programResults = converted.slice(0, names.length);
const outsideResults = converted.slice(names.length);

names.forEach((name, i) => {
  test(`${name}: property 1, blocks -> Python -> blocks gives the same blocks`, () => {
    const result = programResults[i];
    assert.ok(result.ok, result.message);
    assert.deepEqual(normalise(result.workspace), normalise(fixtures[name]));
  });

  test(`${name}: property 2, Python -> blocks -> Python gives the same text`, () => {
    assert.equal(toPython(programResults[i].workspace), programTexts[i]);
  });
});

const outsideRegenerated = outsideResults.map((r) => (r.ok ? toPython(r.workspace) : null));
const outsideAst = astDumps([...outsideTexts, ...outsideRegenerated.map((t) => t ?? "")]);

outsideNames.forEach((file, i) => {
  test(`${file}: property 3, outside the subset nothing is lost`, () => {
    const result = outsideResults[i];
    assert.ok(result.ok, result.message);
    assert.ok(result.raw > 0, "a program outside the subset has at least one Python code block");
    assert.equal(outsideAst[outsideTexts.length + i], outsideAst[i], "the same program, as Python reads it");
    assert.deepEqual(comments(outsideRegenerated[i]), comments(outsideTexts[i]), "every comment, in order");
    // text in the plain style comes back exactly; a file named *_tidy.py is not in it, and is tidied (BF-D-012)
    if (!file.endsWith("_tidy.py")) assert.equal(outsideRegenerated[i], outsideTexts[i]);
  });
});

test("text that is not Python yet is refused with the line that stops it", () => {
  const [result] = convertAll(["x = 1\nif x > 0\n    print(x)\n"]);
  assert.equal(result.ok, false);
  assert.equal(result.line, 2);
  assert.match(result.message, /^Line 2 is not finished Python yet/);
});

// Small programs in the plain style, each aimed at one rule: Python -> blocks -> Python gives the same text.
const SNIPPETS = [
  "x = -5\ny = 2 ** -1\nz = (-2) ** 2\nw = -2 ** 2\n",
  "a = (b + c) * d\ne = f - (g - h)\ni = not (j and k)\nl = not m == n\n",
  "x = a[1:2] + 1\ny = (p if q else r) + 1\nz = (a | b) * 2\nw = a is None\n",
  "x = [n * 2 for n in y]\nprint((1, 2))\npairs = 1, 2\n",
  "x = None\nprint(None)\n\n\ndef f():\n    return None\n",
  "def f():\n    return\n",
  "if a:\n    pass\nelif b:\n    print(1)\nelse:\n    pass\n",
  "if a:\n    pass\nelse:\n    if b:\n        pass\n",
  "while True:\n    pass  # later\n",
  "for i in range(1, 10, 2):\n    print(i)\nfor _ in range(3):\n    print(\"hi\")\nfor i in range(0, 4):\n    pass\n",
  "items.append(3)\nitems.pop(0)\nitems.pop()\nitems[0] = items[1]\n",
  "import math\n\nx = math.pi\n",
  "import random\n\nx = random.choice(y)\n",
  "import random\nimport time\n\nx = random.randint(1, 6)\ntime.sleep(1)\n",
  "# alone\n\n# above\nx = 1  # after\n# own\ny = 2\n",
  "while True:\n    try:\n        x = int(input())\n        break\n    except ValueError:  # not a number\n        pass\n",
  "@cache\ndef f(n):\n    return n\n",
  "def f(a, b):\n    def g():\n        pass\n    return a\n\nprint(f(1, 2))\nf(1, b=2)\n",
  "print(\"a\", end=\"\")\nprint(*items)\nx = sum(n for n in y)\n",
  "x = \"it's \\\"quoted\\\"\\n\"\ny = f\"{x}!\"\n",
  "for i in x:\n    y = i\n    # done\nz = 1\n",
  "x = [\n    1,  # one\n    2,\n]\n",
  "if a:\n    pass\nelse:  # otherwise\n    pass\n",
  "x = a and b and c\ny = a or b and c\nz = (a or b) and c\n",
  "x = 0xff + 1_000\ny = 1.50\n",
  "",
  "# only a comment\n",
];

const snippetResults = convertAll(SNIPPETS);
SNIPPETS.forEach((source, i) => {
  test(`snippet ${i}: ${JSON.stringify(source.split("\n")[0])} comes back as written`, () => {
    assert.ok(snippetResults[i].ok, snippetResults[i].message);
    assert.equal(toPython(snippetResults[i].workspace), source);
  });
});
