// BF-8 and BF-10 (blocks half): the colours of the categories, the two drawing categories, the colour a general call
// takes from its name (BF-D-039), and the toolbox as a column of icons (BF-D-041, BF-D-047).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Blockly from "blockly";

import { registerBlocks, toolbox, typeOf } from "../editor/blocks/register.js";
import { BLOCKS, CATEGORIES, categoryColour } from "../editor/blocks/table.js";
import { ICONS, IconCategory } from "../editor/blocks/toolbox_icons.js";
import { createCatalogue } from "../editor/catalogue/index.js";
import { categoryOfEntry, refreshCall } from "../editor/catalogue/call_block.js";
import { completions } from "./catalogue_support.js";

const catalogue = createCatalogue(completions);
const idsOf = (cat) => BLOCKS.filter((b) => b.cat === cat).map((b) => b.type).sort();

test("every block's category exists, and every category has the colour the maintainer chose", () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const b of BLOCKS) assert.ok(ids.has(b.cat), `${b.type}: ${b.cat}`);
  const colours = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.colour]));
  assert.deepEqual(colours, {
    "Saying and asking": "#9966FF", Values: "#59C059", Variables: "#FF8C1A", "Numbers and maths": "#59C059",
    "Comparing and logic": "#3E9E43", Control: "#FFAB19", "Lists and text": "#FF661A", "Your own blocks": "#FF6680",
    "Shapes and text": "#0FBD8C", "Colour, lines and canvas": "#0A8A66", Events: "#FFBF00", Sound: "#CF63CF",
    "Camera and ml": "#5CB1D6", "Calling anything else": "#969696", "Python code": "#5E5E5E",
  });
});

test("drawing is two categories; the sketch's hats are in Events", () => {
  assert.deepEqual(idsOf("shapes"), ["circle", "line", "rectangle", "text_align", "text_size", "write"]);
  assert.deepEqual(idsOf("canvas"), ["background", "canvas_size", "fill", "no_fill", "no_outline", "outline", "outline_width", "sketch_value"]);
  assert.deepEqual(idsOf("events"), ["key_pressed", "mouse_pressed", "sketch_frame", "sketch_start"]);
  assert.ok(!CATEGORIES.some((c) => c.id === "drawing"));
});

test("a block is drawn in its category's colour", () => {
  registerBlocks({});
  const workspace = new Blockly.Workspace();
  for (const type of ["circle", "fill", "sketch_start", "say"]) {
    const block = workspace.newBlock(typeOf(type));
    const cat = BLOCKS.find((b) => b.type === type).cat;
    assert.equal(block.getColour().toLowerCase(), categoryColour(cat).toLowerCase(), type);
  }
  workspace.dispose();
});

// ---------------------------------------------------------------------------------------------------------------
// A call block takes its name's colour

function callColour(workspace, name, object = "f") {
  const block = Blockly.serialization.blocks.append({
    type: typeOf("method"), fields: { NAME: name }, extraState: { args: [] },
    inputs: { OBJ: { shadow: { type: typeOf("variable"), fields: { VAR: object } } } },
  }, workspace);
  refreshCall(block);
  return [block, block.getColour().toLowerCase()];
}

test("a general call is coloured by its name's section; a name that is not known keeps the grey", () => {
  registerBlocks({ catalogue: completions });
  const workspace = new Blockly.Workspace();
  const want = (id) => categoryColour(id).toLowerCase();
  assert.equal(callColour(workspace, "ellipse")[1], want("shapes"));
  assert.equal(callColour(workspace, "fill")[1], want("canvas"));
  assert.equal(callColour(workspace, "melody", "sound")[1], want("sound"));
  assert.equal(callColour(workspace, "no_such_name")[1], want("calls"));
  workspace.dispose();
  registerBlocks({});
});

test("renaming a call block colours it again", () => {
  registerBlocks({ catalogue: completions });
  const workspace = new Blockly.Workspace();
  const [block, first] = callColour(workspace, "ellipse");
  assert.equal(first, categoryColour("shapes").toLowerCase());
  block.setFieldValue("fill", "NAME");
  refreshCall(block);
  assert.equal(block.getColour().toLowerCase(), categoryColour("canvas").toLowerCase());
  block.setFieldValue("nothing_here", "NAME");
  refreshCall(block);
  assert.equal(block.getColour().toLowerCase(), categoryColour("calls").toLowerCase());
  workspace.dispose();
  registerBlocks({});
});

test("without a catalogue a call block stays grey", () => {
  registerBlocks({});
  const workspace = new Blockly.Workspace();
  const block = workspace.newBlock(typeOf("method"));
  block.setFieldValue("ellipse", "NAME");
  assert.equal(block.getColour().toLowerCase(), categoryColour("calls").toLowerCase());
  workspace.dispose();
});

test("every section of the catalogue is mapped, except the four left to the grey on purpose", () => {
  const grey = new Set(["Saving", "Classes", "Play", "Motion and pages"]);
  const seen = new Set();
  for (const item of completions.names) {
    const entry = catalogue.functions.get(item.name) ?? catalogue.values.get(item.name);
    if (!entry) continue;
    seen.add(item.section);
    assert.equal(categoryOfEntry(entry) === "calls", grey.has(item.section), `${item.name}: ${item.section}`);
  }
  assert.ok(seen.size >= 15, "most sections were looked at");
});

// ---------------------------------------------------------------------------------------------------------------
// The toolbox

test("the toolbox gives each category its icon and its name, and the icon class is Blockly's category", () => {
  const categories = toolbox().contents;
  assert.equal(categories.length, CATEGORIES.length);
  for (const cat of categories) {
    assert.ok(ICONS[cat.icon], `${cat.name} has an icon`);
    assert.match(cat.colour, /^#[0-9A-F]{6}$/);
  }
  assert.equal(new Set(categories.map((c) => c.icon)).size, categories.length, "one icon each");
  assert.equal(Object.keys(ICONS).length, categories.length, "no icon unused");
  assert.ok(IconCategory.prototype instanceof Blockly.ToolboxCategory);
  registerBlocks({});
  assert.equal(Blockly.registry.getClass(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.ToolboxCategory.registrationName), IconCategory);
});
