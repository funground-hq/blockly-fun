// BF-1: the type rule (Funground_Calls_Note.md, section 4) against funground's shared table of cases.
//
// Each case is a program, a line, the object on that line, and the class it holds. The program becomes blocks (the
// same Python -> blocks path as tests/roundtrip.test.js), and the class the rule works out for that object is compared.
// A case whose `needs` holds "hint" asks for the quoted-annotation step, which blocks do not have yet: it is skipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks } from "../editor/blocks/register.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { TypeTracker } from "../editor/catalogue/types.js";
import { generator } from "../editor/generator/python.js";
import { completions, typeCases, convertAll } from "./catalogue_support.js";

const catalogue = createCatalogue(completions);
const converted = convertAll(typeCases.cases.map((c) => c.program));

/** True if the catalogue gives element types (an `element` on some name), which the "element" step needs. */
const hasElements = JSON.stringify(completions).includes("\"element\"");
const built = (needs) => needs.every((n) => n === "element" && hasElements);

/** The class the rule gives the object of the site the case points at. */
function classAt(testCase, workspaceJson) {
  registerBlocks({ catalogue });
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(workspaceJson, workspace);
    const tracker = new TypeTracker(workspace, catalogue);
    tracker.update();
    tracker.dispose();
    // the sites are in the order the Python reads; the k-th one with this object text is the k-th time the program
    // writes `object.` (the cases are plain style, so the Python the blocks make is the program)
    const sites = tracker.sites.map((site) => ({
      ...site, text: site.text ?? generator.blockToCode(site.block.getInputTargetBlock("OBJ"))[0],
    })).filter((site) => site.text === testCase.object);
    const before = testCase.program.split("\n").slice(0, testCase.line - 1).join("\n");
    const k = before.split(testCase.object + ".").length - 1;
    assert.ok(sites[k], `no \`${testCase.object}.\` found as number ${k} in the blocks`);
    // the table is about funground's classes: an object that is one of Python's own types (BF-D-044) is not one of them
    return sites[k].type?.kind === "python" ? null : sites[k].type;
  } finally {
    workspace.dispose();
  }
}

let skipped = 0;
let run = 0;

typeCases.cases.forEach((testCase, i) => {
  const label = `type case ${i}: line ${testCase.line}, ${testCase.object} is ${testCase.class ?? "unknown"}`;
  if (!built(testCase.needs)) {
    skipped++;
    test(label, { skip: `needs ${testCase.needs.join(" and ")}, not built in blocks yet` }, () => {});
    return;
  }
  run++;
  test(label, () => {
    assert.ok(converted[i].ok, converted[i].message);
    const type = classAt(testCase, converted[i].workspace);
    if (testCase.class === null) assert.equal(type, null, "the rule must not guess");
    else assert.deepEqual(type, { kind: "class", name: testCase.class });
  });
});

test("type cases: how many ran and how many were skipped", (t) => {
  t.diagnostic(`${run} cases ran, ${skipped} skipped (hint step not built in blocks)`);
  assert.equal(run + skipped, typeCases.cases.length);
  assert.ok(run > 0);
});
