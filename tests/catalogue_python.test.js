// BF-9 and BF-12 (BF-D-040, BF-D-044): Python's own names in the name lists.
//   - python.json, the checked-in catalogue of Python's built-ins and the methods of its main types;
//   - the type rule giving Python's own types (`d = {}` is a dict) and the lists that come of it;
//   - the bare call's list: Python's built-ins, and the names the sketch imports.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import * as Blockly from "blockly";

import { registerBlocks, typeOf } from "../editor/blocks/register.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { NamePanel } from "../editor/catalogue/panel.js";
import { FieldCatalogueName } from "../editor/catalogue/field.js";
import { searchScope } from "../editor/catalogue/search.js";
import { importsInText } from "../editor/catalogue/imports.js";
import { importsOf, lookupEntry, tooltipOf } from "../editor/catalogue/call_block.js";
import { TypeTracker, literalType } from "../editor/catalogue/types.js";
import { generator } from "../editor/generator/python.js";
import { completions, convertAll } from "./catalogue_support.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";
const FILE = join(ROOT, "editor", "catalogue", "python.json");
const python = JSON.parse(readFileSync(FILE, "utf8"));
const catalogue = createCatalogue(completions, { helpBase: "https://example.org/docs/" });
const names = (entries) => entries.map((e) => e.name);

// ---------------------------------------------------------------------------------------------------------------
// python.json

test("python.json: the header, the names, the types and their methods", () => {
  assert.match(python.python, /^3\.\d+$/, "the Python version it was made with");
  assert.match(python.made_by, /make_python_catalogue/);
  const byName = new Map(python.names.map((e) => [e.name, e]));
  for (const name of ["print", "len", "range", "input", "int", "str", "sorted", "enumerate", "zip", "round", "min", "max"]) {
    assert.ok(byName.has(name), name);
  }
  assert.ok(!byName.has("ValueError") && !byName.has("__import__") && !byName.has("exit"), "no exceptions, dunders or site names");
  assert.equal(byName.get("print").url, "https://docs.python.org/3/library/functions.html#print");
  assert.equal(byName.get("len").returns, "int");
  assert.equal(byName.get("input").returns, "str");
  assert.match(byName.get("range").signature, /^range\(stop\)$/);
  for (const e of python.names) assert.ok(!e.signature.includes("<"), `${e.name}: a signature a learner can read`);
  for (const cls of ["str", "list", "dict", "int", "float", "set", "tuple"]) assert.ok(python.classes[cls].members.length, cls);
  const upper = python.classes.str.members.find((m) => m.name === "upper");
  assert.equal(upper.url, "https://docs.python.org/3/library/stdtypes.html#str.upper");
  assert.equal(python.classes.str.members.find((m) => m.name === "split").returns, "list");
  assert.ok(python.stdlib.includes("random") && python.stdlib.includes("math"));
});

test("python.json: the plain sentences and the order, most used first", () => {
  const plain = python.names.filter((e) => e.plain).sort((a, b) => b.rank - a.rank);
  assert.equal(plain[0].name, "print");
  assert.ok(plain.length >= 25);
  const order = (type) => python.classes[type].members.filter((m) => m.plain).sort((a, b) => b.rank - a.rank).map((m) => m.name);
  assert.deepEqual(order("str").slice(0, 3), ["upper", "lower", "strip"]);
  assert.equal(order("list")[0], "append");
  assert.equal(order("dict")[0], "get");
  for (const e of [...plain, ...Object.values(python.classes).flatMap((c) => c.members.filter((m) => m.plain))]) {
    assert.ok(e.plain.length < 100, e.name);
  }
});

test("python.json is what the script makes (the same bytes, run again)", { timeout: 60000 }, (t) => {
  if (spawnSync(PYTHON, ["-I", "-c", "pass"]).status !== 0) return t.skip("no Python to run the script with");
  const dir = mkdtempSync(join(tmpdir(), "bf-python-"));
  const out = join(dir, "python.json");
  try {
    const run = spawnSync(PYTHON, ["-I", join(ROOT, "tools", "make_python_catalogue.py"), out], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const made = readFileSync(out, "utf8");
    if (JSON.parse(made).python !== python.python) return t.skip(`the file was made with Python ${python.python}`);
    assert.equal(made, readFileSync(FILE, "utf8"), "run tools/make_python_catalogue.py again");
    spawnSync(PYTHON, ["-I", join(ROOT, "tools", "make_python_catalogue.py"), out]);
    assert.equal(readFileSync(out, "utf8"), made, "deterministic");
  } finally {
    rmSync(out, { force: true });
    rmdirSync(dir);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// The type rule: Python's own types (BF-D-044)

test("literals: what a text that is one value is", () => {
  const cases = { "3": "int", "-3": "int", "0x1F": "int", "3.5": "float", "2e3": "float", "\"hi\"": "str", "'a b'": "str",
    "f\"x{y}\"": "str", "[]": "list", "[1, 2, [3]]": "list", "{}": "dict", "{\"a\": 1}": "dict", "{1, 2}": "set",
    "\"a\" + b": null, "[1][0]": null, "x": null, "(1, 2)": null };
  for (const [text, type] of Object.entries(cases)) assert.equal(literalType(text), type, text);
});

/** The type of the object of the last `object.` in a program, worked out by the type rule on the blocks it makes. */
function typeAt(program, object) {
  const [result] = convertAll([program]);
  assert.ok(result.ok, result.message);
  registerBlocks({ catalogue });
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(result.workspace, workspace);
    const tracker = new TypeTracker(workspace, catalogue);
    tracker.update();
    tracker.dispose();
    const sites = tracker.sites.map((site) => ({
      ...site, text: site.text ?? generator.blockToCode(site.block.getInputTargetBlock("OBJ"))[0],
    })).filter((site) => site.text === object);
    assert.ok(sites.length, `no \`${object}.\` in the blocks`);
    return sites.at(-1).type;
  } finally {
    workspace.dispose();
    registerBlocks({});
  }
}

const python_ = (name) => ({ kind: "python", name });

test("an assignment gives Python's own type, and its methods are listed", () => {
  const cases = [
    ["d = {}\nd.get(\"a\")\n", "d", "dict", "get"],
    ["x = 3\nx.bit_length()\n", "x", "int", "bit_length"],
    ["x = 3.5\nx.is_integer()\n", "x", "float", "is_integer"],
    ["s = \"hi\"\ns.upper()\n", "s", "str", "upper"],
    ["items = []\nitems.reverse()\n", "items", "list", "reverse"],
    ["n = 7\ns = str(n)\ns.upper()\n", "s", "str", "upper"],
    ["s = input()\ns.strip()\n", "s", "str", "strip"],
    ["n = int(\"4\")\nn.bit_length()\n", "n", "int", "bit_length"],
    ["x = float(\"4\")\nx.is_integer()\n", "x", "float", "is_integer"],
    ["a = list(\"abc\")\na.reverse()\n", "a", "list", "reverse"],
    ["d = dict()\nd.keys()\n", "d", "dict", "keys"],
    ["items = [1, 2]\nn = len(items)\nn.bit_length()\n", "n", "int", "bit_length"],
    ["r = range(5)\nr.count(2)\n", "r", "range", "count"],
    ["z = sorted([3, 1])\nz.reverse()\n", "z", "list", "reverse"],
    ["words = \"a b\".split()\nwords.reverse()\n", "words", "list", "reverse"],
  ];
  for (const [program, object, cls, method] of cases) {
    const type = typeAt(program, object);
    assert.deepEqual(type, python_(cls), program);
    const scope = catalogue.scope(type);
    assert.ok(scope.known && names(scope.groups.flatMap((g) => g.entries)).includes(method), `${cls} lists ${method}`);
    assert.equal(catalogue.member(type, method).owner.name, cls);
  }
});

test("the last assignment wins, and what is not known stays unknown", () => {
  assert.deepEqual(typeAt("x = 3\nx = \"now text\"\nx.upper()\n", "x"), python_("str"));
  assert.equal(typeAt("t = mystery()\nt.go()\n", "t"), null, "an unknown call: no guess");
  assert.equal(typeAt("t = abs(-3)\nt.go()\n", "t"), null, "abs is left out: int or float");
  const scope = catalogue.scope(null);
  assert.equal(scope.known, false);
  assert.deepEqual(scope.groups, []);
});

test("funground's own types are as they were", () => {
  assert.deepEqual(typeAt("import funground as f\nslider = f.create_slider(0, 5)\nslider.value()\n", "slider"), { kind: "class", name: "Slider" });
});

test("Python's own types have methods and no properties; a list of funground's is Python's list", () => {
  assert.deepEqual(catalogue.scope(python_("str"), { properties: true }), { known: false, groups: [] });
  const body = catalogue.scope({ kind: "list", of: "Body" });
  assert.ok(names(body.groups.flatMap((g) => g.entries)).includes("append"));
  assert.equal(catalogue.property(python_("str"), "upper"), null);
});

test("a Python method gives back what python.json says", () => {
  const split = catalogue.member(python_("str"), "split");
  assert.deepEqual(catalogue.typeOfEntry(split), python_("list"));
  assert.equal(catalogue.typeOfEntry(catalogue.member(python_("str"), "startswith")), null);
});

// ---------------------------------------------------------------------------------------------------------------
// The bare call's list (BF-D-040)

const code = (TEXT) => ({ type: typeOf("code"), fields: { TEXT } });
const call = (name, args = []) => ({ type: typeOf("call"), fields: { NAME: name }, extraState: { args } });

function withBlocks(blocks, fn, settings = { catalogue }) {
  registerBlocks(settings);
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks } }, workspace);
    return fn(workspace, workspace.getAllBlocks(false).find((b) => b.type === typeOf("call")));
  } finally {
    workspace.dispose();
    registerBlocks({});
  }
}

test("imports are read from the code blocks' text", () => {
  assert.deepEqual(importsInText("from funground import circle, fill as paint\nfrom random import (randint,\n  choice)\nimport math\n"), [
    { module: "funground", name: "circle", alias: "circle" },
    { module: "funground", name: "fill", alias: "paint" },
    { module: "random", name: "randint", alias: "randint" },
    { module: "random", name: "choice", alias: "choice" },
  ]);
  assert.deepEqual(importsInText("from . import sibling\nx = 1\n"), [], "a relative import is not a name from outside");
});

test("a bare call lists \"In your sketch\" first, then Python's own, print first", () => {
  const imports = "from funground import circle\nfrom random import randint\n";
  withBlocks([code(imports), call("")], (workspace, block) => {
    const scope = catalogue.bareScope(importsOf(block, true));
    assert.deepEqual(scope.groups.map((g) => g.title), ["In your sketch", "Python's own"]);
    assert.deepEqual(names(scope.groups[0].entries).sort(), ["circle", "randint"]);
    assert.equal(scope.groups[1].entries[0].name, "print");
    assert.ok(names(scope.groups[1].entries).includes("range") && !names(scope.groups[1].entries).includes("circle"));
    // funground's own entry for an imported funground name
    assert.equal(scope.groups[0].entries.find((e) => e.name === "circle").owner.kind, "f");
    // a name with no import in the sketch is not in "In your sketch"
    assert.deepEqual(catalogue.bareScope([]).groups.map((g) => g.title), ["Python's own"]);
  });
});

test("an imported name from the standard library has Help to docs.python.org; any other has none", () => {
  const imports = importsInText("from random import randint\nfrom thirdparty import thing\nfrom math import sqrt as root\n");
  const found = catalogue.importedEntries(imports);
  assert.equal(catalogue.helpUrl(found.get("randint")), "https://docs.python.org/3/library/random.html#random.randint");
  assert.equal(catalogue.helpUrl(found.get("root")), "https://docs.python.org/3/library/math.html#math.sqrt");
  assert.equal(catalogue.helpUrl(found.get("thing")), null);
  assert.equal(catalogue.helpUrl(catalogue.bareEntry("print")), "https://docs.python.org/3/library/functions.html#print", "even with a helpBase of the host's");
  const bare = createCatalogue(completions);
  assert.equal(bare.helpUrl(bare.bareEntry("print")), "https://docs.python.org/3/library/functions.html#print", "and without one");
});

test("the panel of a bare call: groups, Help in the footer, a search is flat", () => {
  const imports = importsInText("from random import randint\n");
  const dom = new JSDOM("<!doctype html><body></body>");
  const chosen = [];
  const panel = new NamePanel({
    document: dom.window.document, catalogue, scope: catalogue.bareScope(imports), onChoose: (e) => chosen.push(e.name),
  });
  const headings = [...panel.element.querySelectorAll(".bf-cat-heading")].map((h) => h.textContent);
  assert.deepEqual(headings, ["In your sketch", "Python's own"]);
  panel.highlight(0);
  assert.equal(panel.footer.querySelector("a").href, "https://docs.python.org/3/library/random.html#random.randint");
  panel.setQuery("pri");
  assert.equal(panel.element.querySelectorAll(".bf-cat-heading").length, 0);
  assert.equal(panel.rows[0].entry.name, "print");
  assert.deepEqual(searchScope(catalogue.bareScope([]), "zzzz"), []);
});

test("choosing a name on a bare call builds its slots; the tooltip and Help come from Python's entry", () => {
  withBlocks([call("range")], (workspace, block) => {
    const entry = lookupEntry(block, catalogue, true);
    assert.equal(entry.name, "range");
    assert.match(tooltipOf(entry), /^range\(stop\)\nCounts through whole numbers/);
    block.getField("NAME").context.onChoose(block, entry);
    assert.deepEqual(block.bfState.args, ["p"], "one required slot");
    assert.equal(generator.workspaceToCode(workspace).trim(), "range(None)");
    refreshHelp(block);
  });
  function refreshHelp(block) {
    assert.equal(block.helpUrl, "https://docs.python.org/3/library/functions.html#func-range");
  }
});

test("choosing an imported funground name on a bare call does not swap in a kit block", () => {
  withBlocks([code("from funground import circle\n"), call("circle")], (workspace, block) => {
    const entry = lookupEntry(block, catalogue, true);
    assert.equal(entry.owner.kind, "f");
    block.getField("NAME").context.onChoose(block, entry);
    assert.match(generator.workspaceToCode(workspace), /^circle\(100, 100, 100\)$/m, "still the bare call, as written");
  });
});

test("a name that is not known on a bare call is used as typed", () => {
  withBlocks([call("my_own_thing")], (workspace, block) => {
    assert.equal(lookupEntry(block, catalogue, true), null);
    assert.equal(block.getField("NAME").getText(), "my_own_thing");
  });
});

test("a host with no catalogue gets the blocks as they were: no list, no tooltip from Python", () => {
  withBlocks([call("print")], (workspace, block) => {
    assert.ok(!block.bfCatalogue);
    assert.ok(!(block.getField("NAME") instanceof FieldCatalogueName), "a plain text box");
  }, {});
});

test("a funground-only host still gets funground's lists unchanged", () => {
  const f = catalogue.scope({ kind: "f" });
  assert.ok(f.known && f.groups.some((g) => g.title === "Shapes"));
  assert.ok(!names(f.groups.flatMap((g) => g.entries)).includes("print"), "Python's names are not funground's");
  assert.equal(catalogue.member({ kind: "f" }, "circle").owner.kind, "f");
  const slider = catalogue.scope({ kind: "class", name: "Slider" });
  assert.ok(names(slider.groups.flatMap((g) => g.entries)).includes("value"));
});
