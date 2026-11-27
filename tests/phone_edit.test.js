// BF-16 (BF-D-053): the phone layout's look (chosen by the host), the changes of a block's gear in the bar, and the catalogue's names in a sheet.
// All through the host API in jsdom (no real layout: sizes and taps are tools/phone_check.mjs's).

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createBlocksEditor, toPython } from "../editor/index.js";
import { typeOf } from "../editor/blocks/register.js";
import { stmt as s, val as v, text as t, num as n, name as x, program } from "./dsl.js";
import { completions } from "./catalogue_support.js";
import timeBased from "./phone_fixtures/time_based.js";

const later = () => new Promise((resolve) => setTimeout(resolve, 50));

/** An editor in the phone layout on a page of jsdom, for the length of fn; the page globals go away after. */
async function withEditor(fn, options = {}) {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  const element = document.createElement("div");
  document.body.append(element);
  const editor = createBlocksEditor({ element, layout: "phone", ...options });
  try {
    return await fn(editor, element);
  } finally {
    await later();                                        // the rows that are still waiting to be drawn
    editor.workspace.dispose();
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
  }
}

const bf = (element, name) => element.querySelector(`[data-bf="${name}"]`);
const blockOf = (editor, type) => editor.workspace.getBlocksByType(typeOf(type), false)[0];

/** A tap on the row of a block (not on a chip in it): the block is picked. */
async function pickRow(editor, element, block) {
  element.querySelector(`.bfl-row[data-block="${block.id}"]`).click();
  await later();
}

async function tapGear(editor, element, name) {
  const button = bf(element, `gear-${name}`);
  assert.ok(button, `the bar has a ${name} button`);
  assert.equal(button.disabled, false, `${name} is on`);
  button.click();
  await later();
}

const gearState = (element) => Object.fromEntries([...element.querySelectorAll('[data-bf^="gear-"]')].map((b) => [b.dataset.bf.slice(5), !b.disabled]));

// ---------------------------------------------------------------------------------------------------------------
// The look

test("the list has no top row of its own: the rows start at the top, and the host chooses the look", async () => {
  await withEditor(async (editor, element) => {
    editor.load(timeBased);
    await later();
    assert.equal(element.querySelector(".bfl-top, .bfp-switch, [data-bf^=\"look-\"]"), null, "no switch in the list");
    assert.equal(editor.look(), "blocks", "the rows start in the Blocks look");
  });
});

test("editor.look(\"code\") shows the Python lines; editor.look(\"blocks\") brings the blocks back; the program does not change", async () => {
  await withEditor(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const before = editor.toPython();
    const blocks = [...element.querySelectorAll(".bfl-row")].map((r) => r.getAttribute("aria-label"));
    assert.equal(editor.look("code"), "code");
    await later();
    assert.ok(element.querySelector(".bfl-list").classList.contains("bfl-code"));
    assert.ok([...element.querySelectorAll(".bfl-row")].some((r) => r.getAttribute("aria-label") === "f.circle(x, f.height / 2, 80)"));
    assert.equal(editor.look("blocks"), "blocks");
    await later();
    assert.deepEqual([...element.querySelectorAll(".bfl-row")].map((r) => r.getAttribute("aria-label")), blocks);
    assert.equal(editor.toPython(), before);
    assert.equal(editor.canUndo(), false, "a look is not a step to undo");
  });
});

test("the look is kept when the editor draws itself again", async () => {
  await withEditor(async (editor, element) => {
    editor.look("code");
    editor.settings({ words: "python" });
    assert.equal(editor.look(), "code");
    assert.ok(element.querySelector(".bfl-list").classList.contains("bfl-code"));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The gear

test("an if offers + else if, + else, and the two that take them away; each is one step to undo and the Python is the generator's", async () => {
  await withEditor(async (editor, element) => {
    editor.load(program([s.if([[v.gt(x("a"), 1), [s.say(t("big"))]]])]));
    await later();
    const block = blockOf(editor, "if");
    await pickRow(editor, element, block);
    assert.deepEqual(gearState(element), { elif: true, else: true, "no-elif": false, "no-else": false });

    await tapGear(editor, element, "else");
    assert.match(editor.toPython(), /if a > 1:\n {4}print\("big"\)\nelse:\n {4}pass\n/);
    assert.equal(editor.toPython(), toPython(editor.save()));
    assert.deepEqual(gearState(element), { elif: true, else: false, "no-elif": false, "no-else": true });
    assert.equal(editor.workspace.getUndoStack().filter((e) => !e.isUiEvent).length > 0, true);

    await tapGear(editor, element, "elif");
    assert.match(editor.toPython(), /elif .+:\n {4}pass\nelse:/s, "the new else if stands before the else");
    assert.equal(gearState(element)["no-elif"], true);
    assert.equal([...element.querySelectorAll(".bfl-row")].filter((r) => r.dataset.block === block.id && r.dataset.segment).length, 3, "if, else if, else: a row for each");

    await tapGear(editor, element, "no-else");
    assert.doesNotMatch(editor.toPython(), /else:/);
    await tapGear(editor, element, "no-elif");
    assert.equal(editor.toPython().trim(), 'if a > 1:\n    print("big")');

    editor.undo();                                       // each button was one step
    assert.match(editor.toPython(), /elif/);
    editor.undo();
    assert.match(editor.toPython(), /else:/);
    editor.undo();
    editor.undo();
    assert.equal(editor.toPython().trim(), 'if a > 1:\n    print("big")');
    assert.equal(editor.canUndo(), false, "back to the start");
  });
});

test("a part with something in it cannot be taken away, and a block can be added to the new part", async () => {
  await withEditor(async (editor, element) => {
    editor.load(program([s.if([[v.gt(x("a"), 1), [s.say(t("big"))]]], [s.say(t("small"))])]));
    await later();
    await pickRow(editor, element, blockOf(editor, "if"));
    assert.deepEqual(gearState(element), { elif: true, else: false, "no-elif": false, "no-else": false }, "the else has a block in it");
    await tapGear(editor, element, "elif");
    assert.match(editor.toPython(), /else:\n {4}print\("small"\)/, "the else kept its block");
    assert.equal(blockOf(editor, "if").getInputTargetBlock("DO1"), null, "the new else if is empty");
  });
});

test("say: + input adds an empty text, - input takes away only an empty last one, and never the only one", async () => {
  await withEditor(async (editor, element) => {
    editor.load(program([s.say(t("a"))]));
    await later();
    const block = blockOf(editor, "say");
    await pickRow(editor, element, block);
    assert.deepEqual(gearState(element), { more: true, less: false }, "the only input stays");
    await tapGear(editor, element, "more");
    assert.equal(editor.toPython(), 'print("a", "")\n');
    assert.equal(editor.toPython(), toPython(editor.save()));
    assert.deepEqual(gearState(element), { more: true, less: true });
    block.getInputTargetBlock("ARG1").setFieldValue("b", "TEXT");
    await later();
    assert.deepEqual(gearState(element), { more: true, less: false }, "the last input has a word in it");
    await tapGear(editor, element, "more");
    assert.equal(editor.toPython(), 'print("a", "b", "")\n');
    await tapGear(editor, element, "less");
    assert.equal(editor.toPython(), 'print("a", "b")\n');
    editor.undo();
    assert.match(editor.toPython(), /^print\("a", "b", \w+\)\n$/, "taking away is one step too: the input is back, its blank default now an empty slot");
  });
});

test("a call: + input adds a number 0 before the keywords, - input takes away an empty last one", async () => {
  await withEditor(async (editor, element) => {
    editor.load(program([s.method(x("f"), "circle", n(1), n(2))]));
    await later();
    const block = blockOf(editor, "method");
    await pickRow(editor, element, block);
    await tapGear(editor, element, "more");
    assert.equal(editor.toPython(), "f.circle(1, 2, 0)\n");
    assert.deepEqual(gearState(element), { more: true, less: true });
    await tapGear(editor, element, "less");
    assert.equal(editor.toPython(), "f.circle(1, 2)\n");
    assert.equal(editor.toPython(), toPython(editor.save()));
  });
});

test("a value with a gear (a list) has + input and - input in its sheet; a block with no gear has none", async () => {
  await withEditor(async (editor, element) => {
    editor.load(program([s.set("a", v.listOf(n(1), n(2)))]));
    await later();
    await pickRow(editor, element, blockOf(editor, "set"));
    assert.deepEqual(gearState(element), {}, "set has no gear");
    const group = element.querySelector(`.bfl-chip[data-block="${blockOf(editor, "list_of").id}"]`);
    group.click();
    await later();
    const inSheet = (name) => element.querySelector(`.bfp-sheet [data-bf="gear-${name}"]`);
    assert.equal(inSheet("more").disabled, false);
    assert.equal(inSheet("less").disabled, true, "the last input has a number the learner made in it");
    inSheet("more").click();
    assert.equal(editor.toPython(), "a = [1, 2, 0]\n");
    assert.equal(inSheet("less").disabled, false);
    inSheet("less").click();
    assert.equal(editor.toPython(), "a = [1, 2]\n");
    assert.equal(editor.toPython(), toPython(editor.save()));
    element.querySelector('.bfp-sheet [data-bf="done"]').click();
    await later();
    editor.undo();
    assert.equal(editor.toPython(), "a = [1, 2]\n", "the sheet's changes are one step: back to the start");
    assert.equal(editor.canUndo(), false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The catalogue's names in a sheet

const withNames = (fn) => withEditor(fn, { catalogue: completions });

const nameChip = (element, block) => element.querySelector(`.bfl-chip[data-block="${block.id}"][data-kind="catalogue"]`);
const nameRows = (element) => [...element.querySelectorAll('.bfp-sheet [data-bf^="name-"]')].map((b) => b.dataset.bf.slice(5));

test("a tap on the name in f . delta time opens a sheet of the names f has, with a search box", async () => {
  await withNames(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const block = blockOf(editor, "attribute");
    const chip = nameChip(element, block);
    assert.ok(chip, "the name is a chip of its own kind");
    assert.equal(chip.textContent, "delta time");
    chip.click();
    await later();
    const sheet = element.querySelector(".bfp-sheet");
    assert.ok(sheet && bf(sheet, "search"), "a sheet with a search box");
    const names = nameRows(element);
    assert.ok(names.includes("delta_time") && names.includes("width") && names.includes("height"), names.join(","));
    assert.ok(names.length <= 60, "not the whole catalogue at once");
    assert.equal(bf(element, "name-delta_time").getAttribute("aria-selected"), "true", "the name now is marked");
  });
});

test("the names are the ones the wide layout's list offers, in the same order, and the search finds in the same way", async () => {
  await withNames(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const block = blockOf(editor, "attribute");
    const scope = block.getField("NAME").context.catalogue.scope({ kind: "f" }, { properties: true });
    const { searchScope } = await import("../editor/catalogue/search.js");
    const expected = (query) => searchScope(scope, query).flatMap((g) => g.entries).map((e) => e.name).slice(0, 60);
    nameChip(element, block).click();
    await later();
    assert.deepEqual(nameRows(element), expected(""));
    const search = bf(element, "search");
    search.value = "wid";
    search.dispatchEvent(new element.ownerDocument.defaultView.Event("input"));
    assert.deepEqual(nameRows(element), expected("wid"));
    assert.equal(nameRows(element)[0], "width");
  });
});

test("a tap on a name sets it: the Python follows, the sheet closes, and it is one step to undo", async () => {
  await withNames(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const block = blockOf(editor, "attribute");
    editor.workspace.clearUndo();
    nameChip(element, block).click();
    await later();
    bf(element, "name-width").click();
    await later();
    assert.match(editor.toPython(), /x \+= 150 \* f\.width\n/);
    assert.equal(editor.toPython(), toPython(editor.save()));
    assert.equal(element.querySelector(".bfp-sheet"), null, "the sheet closed");
    editor.undo();
    assert.match(editor.toPython(), /x \+= 150 \* f\.delta_time\n/);
    assert.equal(editor.canUndo(), false, "one step");
  });
});

test("a name that no row has can be used as typed; where the catalogue knows no names the keyboard sheet opens", async () => {
  await withNames(async (editor, element) => {
    editor.load(timeBased);
    await later();
    const block = blockOf(editor, "attribute");
    nameChip(element, block).click();
    await later();
    const search = bf(element, "search");
    search.value = "zzz_mine";
    search.dispatchEvent(new element.ownerDocument.defaultView.Event("input"));
    assert.deepEqual(nameRows(element), []);
    bf(element, "use-name").click();
    await later();
    assert.match(editor.toPython(), /f\.zzz_mine/);

    editor.load(program([s.method(x("q"), "wiggle", n(1))]));      // q is not an object the catalogue knows
    await later();
    const call = blockOf(editor, "method");
    nameChip(element, call).click();
    await later();
    assert.ok(bf(element, "text"), "a text box, not a list");
    assert.equal(nameRows(element).length, 0);
  });
});

test("without a catalogue the name is a plain text box and opens the keyboard sheet", async () => {
  await withEditor(async (editor, element) => {
    editor.load(program([s.method(x("q"), "wiggle", n(1))]));
    await later();
    assert.equal(element.querySelector('.bfl-chip[data-kind="catalogue"]'), null);
    element.querySelector('.bfl-chip[data-kind="text"]').click();
    await later();
    assert.ok(bf(element, "text"));
  });
});
