// BF-1 and BF-2: the index, the search, the slots a name brings, and the list's panel (no Blockly needed).
// Funground_Calls_Note.md, sections 3, 5 and 7.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { Catalogue, createCatalogue } from "../editor/catalogue/index.js";
import { searchEntries, searchScope } from "../editor/catalogue/search.js";
import { parseSignature, defaultFor, positionalParams } from "../editor/catalogue/slots.js";
import { NamePanel } from "../editor/catalogue/panel.js";
import { completions } from "./catalogue_support.js";

const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const catalogue = createCatalogue(completions, { helpBase: "https://example.org/docs/" });
const F = { kind: "f" };
const names = (entries) => entries.map((e) => e.name);

test("the index is built from the parsed catalogue once, and fast", (t) => {
  const times = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    new Catalogue(completions);
    times.push(performance.now() - start);
  }
  const build = median(times);
  const all = catalogue.scope(F).groups.flatMap((g) => g.entries);
  const searches = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    searchEntries(all, "align");
    searches.push(performance.now() - start);
  }
  t.diagnostic(`index build ${build.toFixed(2)} ms (median of 20); one search over ${all.length} names ${median(searches).toFixed(3)} ms`);
  assert.ok(build < 100, `building the index took ${build} ms`);
  assert.equal(createCatalogue(catalogue), catalogue, "a built catalogue is given back as it is");
});

test("the index answers by name for f, libraries and classes", () => {
  assert.equal(catalogue.member(F, "circle").name, "circle");
  assert.equal(catalogue.member({ kind: "library", name: "sound" }, "melody").name, "melody");
  assert.equal(catalogue.member({ kind: "class", name: "Slider" }, "value").owner.name, "Slider");
  assert.equal(catalogue.member(F, "no_such_name"), null);
  assert.equal(catalogue.member(null, "circle"), null);
  assert.equal(catalogue.onlyMember("melody"), null, "a name no class has");
  assert.deepEqual(catalogue.typeOfEntry(catalogue.member(F, "create_slider")), { kind: "class", name: "Slider" });
  assert.deepEqual(catalogue.typeOfEntry(catalogue.member(F, "svg_paths")), { kind: "list", of: "PathBuilder" });
});

test("search tiers: start of the name, a word in it, the also words, the summary", () => {
  const all = catalogue.scope(F).groups.flatMap((g) => g.entries);
  const tex = names(searchEntries(all, "tex"));
  assert.ok(tex.includes("text") && tex.includes("text_size") && tex.includes("text_align"));
  assert.ok(tex.slice(0, 3).every((n) => n.startsWith("tex")), "names that start with it come first");
  assert.ok(names(searchEntries(all, "align")).includes("text_align"), "a word inside the name");
  assert.ok(names(searchEntries(all, "transparent")).slice(0, 3).includes("opacity"), "an also word");
  const summary = names(searchEntries(all, "see-through"));
  assert.ok(summary.length > 0, "the summary and the plain sentence are searched too");
  assert.deepEqual(searchEntries(all, "  "), all, "an empty search is the whole list in its order");
  assert.deepEqual(searchEntries(all, "zzzzzz"), []);
});

test("within a tier, the most used come first", () => {
  const all = catalogue.scope(F).groups.flatMap((g) => g.entries);
  const found = searchEntries(all, "te").filter((e) => e.lowerName.startsWith("te"));
  for (let i = 1; i < found.length; i++) assert.ok(found[i - 1].rank >= found[i].rank);
});

test("scopes: f, a library, a class, and an unknown object", () => {
  const f = catalogue.scope(F);
  assert.ok(f.known && f.groups.length > 3, "f's names are grouped by section");
  assert.ok(f.groups.some((g) => g.title === "Shapes"));
  assert.ok(!f.groups.flatMap((g) => names(g.entries)).includes("mouse_x"), "a live value is not a call");
  const sound = catalogue.scope({ kind: "library", name: "sound" });
  assert.ok(names(sound.groups.flatMap((g) => g.entries)).includes("melody"));
  const slider = catalogue.scope({ kind: "class", name: "Slider" });
  const sliderNames = names(slider.groups.flatMap((g) => g.entries));
  assert.ok(sliderNames.includes("value") && !sliderNames.includes("high"), "methods, not properties");
  const unknown = catalogue.scope(null);
  assert.equal(unknown.known, false);
  assert.deepEqual(unknown.groups, [], "an unknown object: the note alone, no list of every class's members (BF-D-044)");
  const list = catalogue.scope({ kind: "list", of: "Body" });
  assert.ok(list.known && names(list.groups.flatMap((g) => g.entries)).includes("append"), "a list is Python's own: its methods");
});

test("an unknown object: a search finds nothing to list", () => {
  assert.deepEqual(searchScope(catalogue.scope(null), ""), []);
  assert.deepEqual(searchScope(catalogue.scope(null), "play"), []);
});

test("a known scope is flat when searched, and grouped when the search is empty", () => {
  const scope = catalogue.scope(F);
  assert.equal(searchScope(scope, "").length, scope.groups.length);
  const flat = searchScope(scope, "circle");
  assert.equal(flat.length, 1);
  assert.equal(flat[0].title, null);
  assert.equal(flat[0].entries[0].name, "circle");
});

test("signatures give the required slots; optional ones are not added", () => {
  assert.deepEqual(parseSignature("text_align(horizontal, vertical=None)").params.map((p) => [p.name, p.required]),
    [["horizontal", true], ["vertical", false]]);
  const fill = parseSignature("fill(color, *more)").params;
  assert.deepEqual(fill.map((p) => [p.name, p.required]), [["color", true], ["more", false]]);
  assert.deepEqual(positionalParams(catalogue.member(F, "fill")).map((p) => p.name), ["color"]);
  assert.deepEqual(parseSignature("rect(x, y, width, height, *radii)").params.map((p) => p.name), ["x", "y", "width", "height", "radii"]);
  assert.deepEqual(parseSignature("melody(text, tempo=120, wave='soft', sa=None)").params.filter((p) => p.required).map((p) => p.name), ["text"]);
  assert.deepEqual(parseSignature("nose").params, []);
  assert.deepEqual(parseSignature("f(a=(1, 2), b=[3, 4])").params.map((p) => p.default), ["(1, 2)", "[3, 4]"]);
});

test("new slots start with values that run", () => {
  const value = (name, param) => {
    const entry = catalogue.member(F, name);
    return defaultFor(catalogue, entry, entry.params.find((p) => p.name === param));
  };
  assert.deepEqual(value("fill", "color"), { text: "tomato" }, "a colour");
  assert.deepEqual(value("text_align", "horizontal"), { text: "left" }, "the first word of an options slot");
  assert.deepEqual(value("circle", "x"), { number: 100 }, "pixels");
  assert.equal(typeof value("opacity", "amount").number, "number", "a range");
  assert.equal(value("load_image", "path"), null, "a file: empty");
  assert.deepEqual(value("create_slider", "high"), { number: 0 }, "a number by its type");
});

// ---------------------------------------------------------------------------------------------------------------
// The panel, in jsdom

function panelFor(type, { helpBase, name = "" } = {}) {
  const dom = new JSDOM("<!doctype html><body></body>");
  const used = helpBase === undefined ? catalogue : createCatalogue(completions, { helpBase });
  const chosen = [];
  const panel = new NamePanel({
    document: dom.window.document, catalogue: used, scope: used.scope(type), name, onChoose: (e) => chosen.push(e.name),
  });
  return { panel, chosen, document: dom.window.document };
}

test("the panel shows the name, its slots and a plain sentence on each row, grouped by section", () => {
  const { panel } = panelFor(F);
  const first = panel.rows[0].element;
  assert.match(first.querySelector(".bf-cat-sig").textContent, /\(/);
  assert.ok(first.querySelector(".bf-cat-plain").textContent.length > 0);
  assert.ok(panel.element.querySelectorAll(".bf-cat-heading").length > 3);
  assert.ok(panel.rows.length <= 300);
});

test("the panel: keys move the highlight, a click chooses, a typed exact name is found", () => {
  const { panel, chosen } = panelFor(F);
  assert.equal(panel.highlighted, null);
  panel.setQuery("circle");
  panel.move(1);
  assert.equal(panel.highlighted.name, "circle");
  panel.move(-1);
  assert.equal(panel.highlighted.name, "circle", "stops at the top");
  assert.equal(panel.exact("circle").name, "circle");
  assert.equal(panel.exact("circl"), null);
  panel.rows[0].element.click();
  assert.deepEqual(chosen, ["circle"]);
  panel.setQuery("zzzzzz");
  assert.match(panel.element.textContent, /No match/);
  assert.equal(panel.rows.length, 0);
});

test("the panel for an unknown object says so, and lists nothing", () => {
  const { panel } = panelFor(null, { name: "play" });
  assert.match(panel.element.textContent, /funground doesn't know what this is yet/);
  assert.equal(panel.element.querySelectorAll(".bf-cat-heading").length, 0);
  assert.equal(panel.rows.length, 0);
  assert.doesNotMatch(panel.element.textContent, /No match/, "the note alone");
});

test("the footer links to the reference only when the host gave a helpBase", () => {
  const withBase = panelFor(F, { helpBase: "https://example.org/docs/" }).panel;
  withBase.setQuery("circle");
  withBase.move(1);
  const link = withBase.element.querySelector(".bf-cat-footer a");
  assert.equal(link.href, "https://example.org/docs/reference/API.md#fn-circle");
  assert.equal(link.rel, "noopener");
  const without = panelFor(F, { helpBase: null }).panel;
  without.setQuery("circle");
  without.move(1);
  assert.equal(without.element.querySelector(".bf-cat-footer a"), null);
});

test("a helpBase function writes the reference's address itself (a host whose pages are folders)", () => {
  const site = (url) => "https://example.org/" + url.replace(/\.md(#|$)/, "/$1");
  const panel = panelFor(F, { helpBase: site }).panel;
  panel.setQuery("circle");
  panel.move(1);
  assert.equal(panel.element.querySelector(".bf-cat-footer a").href, "https://example.org/reference/API/#fn-circle");
});
