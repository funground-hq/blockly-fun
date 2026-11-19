// Spike B of BF-D-053 (editing blocks on a phone), in a real browser: the "phone-b" layout (our own list of rows, Blockly headless underneath)
// driven over the DevTools protocol with a touch screen at 360 x 720, doing the seven tasks of Phone_Editing_Spikes_Plan.md on the Time-based
// motion example and counting taps, as tools/spike_a_check.mjs does for spike A. Tasks 1 and 2 are done in both looks (Blocks, Code).
//
//   export PATH=/c/sw/nodejs:$PATH; npm run build; node tools/spike_b_check.mjs [--screenshots <folder>]
//
// After every task it checks: the Python is what the generator writes for the same workspace (toPython of editor.save()), the page does not
// scroll sideways, nothing lies outside the screen, every row, every chip and every button is 44 px or more (this is where spike A failed:
// all chips are measured), and the smallest text. It also loads every fixture program in both looks and does the same checks, and measures how
// long a row drawing takes. Prints JSON; exit code 1 when a problem was found.
// Environment: BF_PYTHON (python.exe, for tools/serve.py), BF_CHROME (chrome.exe).

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, sleep } from "./phone_check_lib.mjs";
import timeBased from "../tests/phone_fixtures/time_based.js";
import { stmt as s, val as v, text as t, name as x, program } from "../tests/dsl.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8769;
const DEBUG_PORT = 9343;
const screenshots = process.argv.includes("--screenshots") ? process.argv[process.argv.indexOf("--screenshots") + 1] : null;

async function main() {
  const report = { tasks: {}, criteria: {}, extras: {}, problems: [] };
  const page = await launch({ root: ROOT, tag: "spike-b", port: PORT, debugPort: DEBUG_PORT, screenshots });
  const { cdp, evaluate, shoot, touch, open, load, python } = page;
  try {
    // -- the taps: every tap of the learner goes through here and is counted
    let taps = 0;
    let scrolls = 0;
    const tap = async (x0, y0) => {
      taps += 1;
      if (process.env.BF_TRACE) console.error("tap", Math.round(x0), Math.round(y0));
      await touch("touchStart", x0, y0);
      await sleep(60);
      await touch("touchEnd", x0, y0);
      await sleep(350);
    };
    const block = (type, n = 0) => `window.bfEditor.workspace.getBlocksByType("bf_${type}", true)[${n}]`;
    const slot = (type, input, n = 0) => `${block(type, n)}.getInputTargetBlock("${input}")`;
    const idOf = (expr) => evaluate(`(${expr}).id`);

    // where to tap an element: the page scrolls, as a thumb does (counted apart, not a tap), until it is clear of the strip and the bar or sheet;
    // `spot` "edge" is the row's own left edge (not a chip), "centre" the middle. The tap must land on the element, or it is a problem.
    const locate = async (selector, spot, tries = 0) => {
      const at = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
        const scroller = document.querySelector(".bfl-scroll");
        let scrolled = false;
        if (scroller && scroller.contains(el)) {
          const r = el.getBoundingClientRect();
          const covered = Math.max(...[".bfp-bar", ".bfp-sheet"].map((q) => { const e = document.querySelector(q); return e ? e.offsetHeight : 0; }));
          const limit = window.innerHeight - covered - 30;
          const want = r.top + r.height / 2;
          if (want > limit || want < 60) { scroller.scrollTop += want - Math.max(100, Math.min(limit - 20, 260)); scrolled = true; }
        } else el.scrollIntoView({ block: "nearest" });          // a sheet's or a list's own scroll
        const r = el.getBoundingClientRect();
        const point = ${JSON.stringify(spot)} === "edge" ? [r.left + 5, r.top + r.height / 2] : [r.left + r.width / 2, r.top + r.height / 2];
        const hit = document.elementFromPoint(point[0], point[1]);
        return { point, scrolled, lands: !!hit && (el === hit || el.contains(hit)) };
      })()`);
      if (!at) throw new Error("nothing to tap: " + selector);
      if (at.scrolled && tries < 3) { scrolls += 1; await sleep(250); return locate(selector, spot, tries + 1); }
      if (!at.lands) report.problems.push(`a tap on ${selector} would land on something else`);
      return at.point;
    };
    const tapSel = async (selector, spot = "centre") => tap(...await locate(selector, spot));
    const chip = (id) => `.bfl-chip[data-block="${id}"]`;
    const row = (id, segment = 0) => `.bfl-row[data-block="${id}"][data-segment="${segment}"]`;
    const tapChip = async (expr) => tapSel(chip(await idOf(expr)));
    const tapRow = async (expr) => tapSel(row(await idOf(expr)), "edge");

    // -- what must hold after every task (the pass mark's criteria 3, 5 and 6)
    const verify = async (label) => {
      await sleep(300);
      const state = await evaluate(`(async () => {
        const bf = await import("/dist/blockly-fun.js");
        const editor = window.bfEditor;
        const scroller = document.querySelector(".bfl-scroll");
        const inner = window.innerWidth;
        const shown = (el) => el.getClientRects().length > 0;
        const size = (el) => { const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height) * 10) / 10; };
        const chips = [...document.querySelectorAll(".bfl-chip")].filter(shown);
        const rows = [...document.querySelectorAll(".bfl-row")].filter(shown);
        const parts = [...document.querySelectorAll(".bfp-sheet button, .bfp-bar button, .bfp-list button, #host button")].filter(shown);
        const outside = [...rows, ...chips].filter((el) => { const r = el.getBoundingClientRect(); return r.right > inner + 1 || r.left < -1; }).length;
        const texts = (root) => [...root.querySelectorAll("*")].filter((el) => shown(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .map((el) => parseFloat(getComputedStyle(el).fontSize));
        const rowText = texts(document.querySelector(".bfl-list"));
        const partText = [".bfp-sheet", ".bfp-bar", ".bfp-list", "#host"].flatMap((q) => [...document.querySelectorAll(q)].filter(shown).flatMap(texts));
        return {
          python: editor.toPython(), expected: bf.toPython(editor.save()),
          docWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, scrollerWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth, scrollLeft: scroller.scrollLeft, inner, outside,
          rows: rows.length, chips: chips.length,
          smallestChip: chips.length ? Math.min(...chips.map(size)) : null, smallestRow: rows.length ? Math.min(...rows.map((r) => r.getBoundingClientRect().height)) : null,
          smallestButton: parts.length ? Math.min(...parts.map(size)) : null,
          smallestRowText: rowText.length ? Math.min(...rowText) : null, smallestPartText: partText.length ? Math.min(...partText) : null,
          look: editor.look(), render: editor.renderStats(),
        };
      })()`);
      const result = {
        pythonSame: state.python === state.expected,
        noSideScroll: state.docWidth <= state.inner && state.bodyWidth <= state.inner && state.scrollerWidth <= state.clientWidth && state.scrollLeft === 0,
        inView: state.outside === 0,
        chips44: state.smallestChip === null || state.smallestChip >= 44,
        rows44: state.smallestRow === null || state.smallestRow >= 44,
        buttons44: state.smallestButton === null || state.smallestButton >= 44,
        text15: (state.smallestRowText ?? 15) >= 15,
        look: state.look, rows: state.rows, chips: state.chips,
        smallestChip: state.smallestChip, smallestRow: Math.round(state.smallestRow ?? 0), smallestButton: state.smallestButton,
        smallestRowText: state.smallestRowText, smallestPartText: state.smallestPartText,
      };
      report.criteria[label] = result;
      for (const [k, ok] of Object.entries(result)) if (ok === false) report.problems.push(`${label}: ${k} failed`);
      return { code: state.python, render: state.render };
    };
    const task = async (id, budget, fn) => {
      taps = 0;
      scrolls = 0;
      const entry = { budget, ok: false };
      report.tasks[id] = entry;
      try {
        Object.assign(entry, await fn());
      } catch (error) {
        entry.error = String(error.message ?? error);
        report.problems.push(`task ${id}: ${entry.error}`);
      }
      entry.taps = taps;
      entry.scrolls = scrolls;
      entry.withinBudget = taps <= budget;
      if (!entry.withinBudget) report.problems.push(`task ${id}: ${taps} taps, budget ${budget}`);
      if (!entry.ok) report.problems.push(`task ${id}: not done`);
    };
    const count = () => evaluate("window.bfEditor.workspace.getAllBlocks(false).filter((b) => !b.isShadow() && !b.outputConnection).length");

    // the time from a tap to the sheet: what the page does between the click and the sheet standing in the page, and to the next frame
    const watchSheets = () => evaluate(`(() => {
      window.__latency = []; let click = 0;
      document.addEventListener("click", () => { click = performance.now(); }, true);
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains("bfp-sheet") && click) {
          const inPage = performance.now() - click;
          requestAnimationFrame(() => window.__latency.push({ inPage: Math.round(inPage * 10) / 10, toFrame: Math.round((performance.now() - click) * 10) / 10 }));
        }
      }).observe(document.querySelector(".bfl-frame"), { childList: true });
    })()`);

    // the slide on the slider of the sheet, as spike A's check: the thumb dragged to where `to` is
    const slide = async (to) => {
      const sheet = await evaluate(`(() => { const r = document.querySelector('[data-bf="slider"]'); const b = r.getBoundingClientRect();
        return { min: Number(r.min), max: Number(r.max), value: Number(r.value), x: b.x, y: b.y + b.height / 2, w: b.width }; })()`);
      const at = (value) => sheet.x + 14 + ((value - sheet.min) / (sheet.max - sheet.min)) * (sheet.w - 28);
      await touch("touchStart", at(sheet.value), sheet.y);
      for (let i = 1; i <= 8; i += 1) { await touch("touchMove", at(sheet.value + ((to - sheet.value) * i) / 8), sheet.y); await sleep(40); }
      await touch("touchEnd");
      await sleep(400);
      return sheet;
    };

    const task1 = (look) => task(look === "blocks" ? 1 : "1_code", 2, async () => {
      await tapChip(slot("circle", "D"));
      const slider = await slide(120);
      await shoot(`b_1_${look}_sheet.png`);
      await tapSel('[data-bf="done"]');
      const value = await evaluate(`Number(${slot("circle", "D")}.getFieldValue("NUM"))`);
      const { code } = await verify(`task1_${look}`);
      return { ok: value === 120 && code.includes("f.circle(x, f.height / 2, 120)"), slider, value, look };
    });
    const task2 = (look) => task(look === "blocks" ? 2 : "2_code", 4, async () => {
      await tapChip(slot("circle", "X"));
      await tapSel('[data-bf="op-+"]');
      await shoot(`b_2_${look}_operator.png`);
      await tapSel('[data-bf="var-sketch-width"]');
      await tapSel('[data-bf="done"]');
      const { code } = await verify(`task2_${look}`);
      await shoot(`b_2_${look}_done.png`);
      return { ok: code.includes("f.circle(x + f.width, f.height / 2, 120)"), look };
    });
    const lineIndex = (code, text) => code.split("\n").map((l) => l.trim()).indexOf(text);

    // ---------------------------------------------------------------------------------------------------------------
    await open("?layout=phone-b&catalogue");
    report.layout = await evaluate("window.bfEditor.layout()");
    report.look = await evaluate("window.bfEditor.look()");
    await load(timeBased);
    await watchSheets();
    report.start = (await verify("start")).render;
    await shoot("b_0_start.png");

    await task1("blocks");
    await task2("blocks");

    // 3. a new variable speed in a slot: tap the 150, New variable, type the name, Make, Done
    await task(3, 5, async () => {
      await tapChip(slot("change", "VALUE") + '.getInputTargetBlock("A")');
      await tapSel('[data-bf="new-variable"]');
      await shoot("b_3_name.png");
      await cdp.send("Input.insertText", { text: "speed" });
      await sleep(200);
      await tapSel('[data-bf="make"]');
      await shoot("b_3_made.png");
      await tapSel('[data-bf="done"]');
      const { code } = await verify("task3");
      return { ok: /^x = 0\nspeed = 0\n/m.test(code) && code.includes("x += speed * f.delta_time"), typed: "speed" };
    });

    // 4. a circle after fill colour: tap the fill line, + Below, the circle (its first value opens in the sheet)
    await task(4, 3, async () => {
      const before = await count();
      await tapRow(block("fill"));
      await shoot("b_4_picked.png");
      await tapSel('[data-bf="below"]');
      await shoot("b_4_list.png");
      await tapSel('[data-bf="block-circle"]');
      await shoot("b_4_added.png");
      const sheetOpen = await evaluate('!!document.querySelector(".bfp-sheet")');
      const after = await count();
      const { code } = await verify("task4");
      const lines = code.split("\n").map((l) => l.trim());
      const at = lines.indexOf('f.fill("seagreen")');
      const closing = taps;                                 // the Done that closes the sheet is not part of the task's budget
      await tapSel('[data-bf="done"]');
      taps = closing;
      return { ok: lines[at + 1] === "f.circle(320, 200, 80)" && after === before + 1, added: after - before, sheetOpenedOnFirstValue: sheetOpen, closingTapNotCounted: 1 };
    });

    // 6 and 7 start again from the example
    await load(timeBased);
    await task(6, 15, async () => {
      const out = {};
      const step = async (name, budget, fn, check) => {
        const before = taps;
        await fn();
        const { code } = await verify(`task6_${name}`);
        out[name] = { taps: taps - before, budget, ok: check(code) && taps - before <= budget };
        if (!out[name].ok) out[name].python = code;
      };
      await step("up", 3, async () => {
        await tapRow(block("circle"));
        await tapSel('[data-bf="up"]');
      }, (c) => lineIndex(c, "f.circle(x, f.height / 2, 80)") < lineIndex(c, 'f.fill("seagreen")'));
      await shoot("b_6_up.png");
      await step("into", 3, async () => {
        await tapRow(block("change"));
        await tapSel('[data-bf="down"]');          // below the if
        await tapSel('[data-bf="in"]');            // into the if above it
      }, (c) => /if x > f.width:\n {8}x = 0\n {8}x \+= 150 \* f.delta_time/.test(c));
      await shoot("b_6_in.png");
      await step("out", 3, async () => {
        await tapSel('[data-bf="out"]');
      }, (c) => /if x > f.width:\n {8}x = 0\n {4}x \+= 150 \* f.delta_time/.test(c));
      await step("duplicate", 3, async () => {
        await tapRow(block("fill"));
        await tapSel('[data-bf="copy"]');
      }, (c) => c.split('f.fill("seagreen")').length === 3);
      await shoot("b_6_copy.png");
      await step("delete", 3, async () => {
        await tapSel('[data-bf="delete"]');
      }, (c) => c.split('f.fill("seagreen")').length === 2);
      await shoot("b_6_deleted.png");
      const undone = await evaluate(`(() => { const e = window.bfEditor; e.undo(); return e.toPython().split('f.fill("seagreen")').length - 1; })()`);
      out.undoTakesDeleteBack = undone === 2;
      await sleep(300);
      const redrawn = await evaluate('document.querySelectorAll(".bfl-row").length');
      out.rowsAfterUndo = redrawn;
      return { ...out, ok: Object.values(out).every((v0) => typeof v0 !== "object" || v0.ok === true) && out.undoTakesDeleteBack };
    });

    // 7. an error: the line is marked, its message one tap away
    await task(7, 1, async () => {
      const code = await python();
      const line = code.split("\n").findIndex((l) => l.includes("f.circle(")) + 1;
      const id = await evaluate(`window.bfEditor.markError(${line}, "Line ${line}: speed is not defined")`);
      await sleep(300);
      const marked = await evaluate(`document.querySelector('.bfl-row[data-block="${id}"]')?.classList.contains("bfl-error") ?? false`);
      await tapSel(row(id), "edge");
      await sleep(200);
      const shown = await evaluate(`(() => { const e = document.querySelector(".bfp-error"); return e && !e.hidden ? e.textContent : null; })()`);
      await shoot("b_7_error.png");
      await verify("task7");
      const type = await evaluate(`window.bfEditor.workspace.getBlockById(${JSON.stringify(id)}).type`);
      return { ok: marked && type === "bf_circle" && shown === `Line ${line}: speed is not defined`, marked, shown, line };
    });
    await evaluate("window.bfEditor.clearErrors()");

    // 5. from an empty sketch: background, a circle in every frame, then wrap it in a repeat 10
    await load({ blocks: { languageVersion: 0, blocks: [] } });
    await task(5, 20, async () => {
      const before = await count();
      await tapSel('[data-bf="add"]');
      await tapSel('[data-bf="block-sketch_frame"]');
      await shoot("b_5_frame.png");
      await tapSel('[data-bf="below"]');
      await tapSel('[data-bf="block-background"]');
      await tapSel('[data-bf="below"]');
      await tapSel('[data-bf="block-circle"]');
      await shoot("b_5_circle.png");
      await tapSel('[data-bf="done"]');            // closes the sheet that opened on the circle's first value
      await tapSel('[data-bf="wrap"]');
      await tapSel('[data-bf="wrap-repeat"]');
      await shoot("b_5_wrapped.png");
      const after = await count();
      const { code } = await verify("task5");
      return { ok: /def draw\(\):\n {4}f.background\("white"\)\n {4}for _ in range\(10\):\n {8}f.circle\(320, 200, 80\)\n/.test(code) && after - before === 4, blocksAdded: after - before, python: code };
    });

    // tasks 1 and 2 again in the Code look: the switch is a tap on the host's strip, not part of the budget
    await load(timeBased);
    await tapSel('#host .look[data-look="code"]');
    report.extras.codeLookSwitch = await evaluate("window.bfEditor.look()");
    await shoot("b_0_code.png");
    await task1("code");
    await task2("code");
    // and a move and an add in the Code look
    await task("4_code", 3, async () => {
      const before = await count();
      await tapRow(block("fill"));
      await tapSel('[data-bf="below"]');
      await tapSel('[data-bf="block-circle"]');
      await shoot("b_4_code_added.png");
      const after = await count();
      const { code } = await verify("task4_code");
      const lines = code.split("\n").map((l) => l.trim());
      const closing = taps;
      await tapSel('[data-bf="done"]');
      taps = closing;
      return { ok: lines[lines.indexOf('f.fill("seagreen")') + 1] === "f.circle(320, 200, 80)" && after === before + 1 };
    });
    await tapSel('#host .look[data-look="blocks"]');

    // the sheets that are not the slot sheet: a colour grid, a list of choices, the keyboard, an empty body
    await load(timeBased);
    report.extras.colour = await (async () => {
      const id = await idOf(slot("background", "COLOR"));
      await tapSel(chip(id));
      const swatches = await evaluate('document.querySelectorAll(".bfp-swatch").length');
      const smallest = await evaluate('Math.min(...[...document.querySelectorAll(".bfp-swatch")].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)))');
      await shoot("b_x_colours.png");
      await tapSel('[data-bf="choice-tomato"]');
      const code = await python();
      await verify("colour_sheet");
      return { swatches, smallest, ok: code.includes('f.background("tomato")') };
    })();
    report.extras.dropdown = await (async () => {
      const arith = await idOf(slot("change", "VALUE"));
      await tapSel(`.bfl-field[data-block="${arith}"]`);
      await shoot("b_x_choice.png");
      await tapSel('[data-bf="choice-/"]');
      const code = await python();
      await verify("choice_sheet");
      return { ok: code.includes("x += 150 / f.delta_time") };
    })();
    await load(program([s.say(t("Hello"))], [s.repeat(3, [])]));
    report.extras.keyboard = await (async () => {
      const id = await idOf(slot("say", "ARG0"));
      await tapSel(chip(id));
      await evaluate('document.querySelector(\'[data-bf="text"]\').select()');
      await cdp.send("Input.insertText", { text: "Hi there" });
      await sleep(300);
      await shoot("b_x_keyboard.png");
      await tapSel('[data-bf="done"]');
      const code = await python();
      await verify("text_sheet");
      return { ok: code.includes('print("Hi there")') };
    })();
    report.extras.emptyBody = await (async () => {
      const before = await count();
      await tapSel('.bfl-row[data-act="body"]');
      await tapSel('[data-bf="block-say"]');
      await sleep(300);
      const after = await count();
      const code = await python();
      await verify("empty_body");
      return { ok: after === before + 1 && /for _ in range\(3\):\n {4}print\(/.test(code) };
    })();
    for (const [name, entry] of Object.entries(report.extras)) if (entry.ok === false) report.problems.push(`extra ${name} failed`);

    // criterion 4: scrolling never moves a block (a swipe over the rows scrolls the page and changes nothing)
    await load(timeBased);
    const state = () => evaluate(`({ python: window.bfEditor.toPython(), top: document.querySelector(".bfl-scroll").scrollTop, left: document.querySelector(".bfl-scroll").scrollLeft,
      picked: document.querySelectorAll(".bfl-picked").length, sheet: !!document.querySelector(".bfp-sheet"), list: !!document.querySelector(".bfp-list"),
      undo: window.bfEditor.canUndo(), scrollable: document.querySelector(".bfl-scroll").scrollHeight - document.querySelector(".bfl-scroll").clientHeight })`);
    const beforeSwipe = await state();
    const at = await locate(chip(await idOf(slot("circle", "D"))), "centre");
    await touch("touchStart", at[0], at[1]);
    for (let i = 1; i <= 15; i += 1) { await touch("touchMove", at[0] - i * 6, at[1] - i * 14); await sleep(30); }
    await touch("touchEnd");
    await sleep(500);
    const afterSwipe = await state();
    report.scrolling = {
      pythonSame: beforeSwipe.python === afterSwipe.python, scrollTop: [beforeSwipe.top, afterSwipe.top], scrollLeft: afterSwipe.left, scrollableBy: afterSwipe.scrollable,
      nothingPicked: afterSwipe.picked === 0, noSheet: !afterSwipe.sheet && !afterSwipe.list, noEdit: afterSwipe.undo === beforeSwipe.undo,
    };
    if (!report.scrolling.pythonSame || !report.scrolling.nothingPicked || !report.scrolling.noSheet || !report.scrolling.noEdit || afterSwipe.left !== 0
        || afterSwipe.top === beforeSwipe.top) report.problems.push("a swipe changed something or did not scroll: " + JSON.stringify(report.scrolling));

    // every fixture program, in both looks: nothing cut off, every chip 44 px, the Python the generator's; and how long drawing the rows takes
    const fixtures = [["time_based", timeBased]];
    const dir = join(ROOT, "tests", "fixtures");
    for (const file of readdirSync(dir).filter((f) => /^p\d+_.*\.js$/.test(f)).sort()) fixtures.push([file.replace(/\.js$/, ""), (await import(pathToFileURL(join(dir, file)).href)).default]);
    // a big sketch: the Time-based frame body twenty times (about 200 rows)
    const frameBody = () => [s.background(t("white")), s.fill(t("seagreen")), s.circle(x("x"), v.div(v.sketch("height"), 2), 80), s.change("x", v.mul(150, 3)),
      s.if([[v.gt(x("x"), v.sketch("width")), [s.set("x", 0)]]])];
    fixtures.push(["big_sketch", program([s.set("x", 0)], s.sketchFrame(Array.from({ length: 20 }, frameBody).flat()))]);
    report.fixtures = {};
    for (const look of ["blocks", "code"]) {
      await evaluate(`window.bfEditor.look("${look}")`);
      for (const [name, json] of fixtures) {
        await evaluate(`window.bfEditor.load(${JSON.stringify(json)})`);
        await sleep(450);
        const { render } = await verify(`fixture_${name}_${look}`);
        const entry = (report.fixtures[name] ??= {});
        entry[look] = { rows: render.rows, drawMs: Math.round(render.lastMs * 10) / 10 };
      }
    }
    await evaluate('window.bfEditor.look("blocks")');
    await evaluate(`window.bfEditor.load(${JSON.stringify(fixtures.at(-1)[1])})`);
    await sleep(500);
    report.bigSketch = { render: (await verify("big_sketch")).render };
    await shoot("b_9_big.png");

    // the sizes of what is drawn, over every look and program above (the criteria hold the smallest in each)
    const all = Object.values(report.criteria);
    report.smallest = {
      chip: Math.min(...all.map((c) => c.smallestChip ?? Infinity)), row: Math.min(...all.map((c) => c.smallestRow || Infinity)),
      button: Math.min(...all.map((c) => c.smallestButton ?? Infinity)), rowText: Math.min(...all.map((c) => c.smallestRowText ?? Infinity)),
      partText: Math.min(...all.map((c) => c.smallestPartText ?? Infinity)),
    };
    report.sheetLatency = await evaluate("window.__latency");

    // the other layouts are untouched (phone_check.mjs and spike_a_check.mjs prove it): the layout name is still accepted and the wide one is wide
    await open("?layout=wide&catalogue");
    report.wideStill = await evaluate("window.bfEditor.layout()");
  } catch (error) {
    report.problems.push(String(error.stack ?? error));
  } finally {
    await page.stop();
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.problems.length ? 1 : 0);
}

await main();
