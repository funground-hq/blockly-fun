// Spike A of BF-D-053 (editing blocks on a phone), in a real browser: the "phone-a" layout driven over the DevTools protocol with a
// touch screen at 360 x 720, doing the seven tasks of Phone_Editing_Spikes_Plan.md on the Time-based motion example and counting taps.
//
//   export PATH=/c/sw/nodejs:$PATH; npm run build; node tools/spike_a_check.mjs [--screenshots <folder>]
//
// After every task it checks: the Python is what the generator writes for the same workspace (toPython of editor.save()), the page
// does not scroll sideways, no block lies outside the column, and every tap target of the page parts is 44 px or more. Prints JSON:
// taps per task (against the budget), pass or fail per criterion, and the problems found. Exit code 1 when a problem was found.
// Environment: BF_PYTHON (python.exe, for tools/serve.py), BF_CHROME (chrome.exe).

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, sleep } from "./phone_check_lib.mjs";
import timeBased from "../tests/phone_fixtures/time_based.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8768;
const DEBUG_PORT = 9342;
const screenshots = process.argv.includes("--screenshots") ? process.argv[process.argv.indexOf("--screenshots") + 1] : null;

async function main() {
  const report = { tasks: {}, criteria: {}, problems: [] };
  const page = await launch({ root: ROOT, tag: "spike-a", port: PORT, debugPort: DEBUG_PORT, screenshots });
  const { cdp, evaluate, shoot, touch, open, load, python } = page;
  try {
    // -- the taps: every tap of the learner goes through here and is counted
    let taps = 0;
    let scrolls = 0;
    const tap = async (x, y) => {
      taps += 1;
      if (process.env.BF_TRACE) console.error("tap", Math.round(x), Math.round(y));
      await touch("touchStart", x, y);
      await sleep(60);
      await touch("touchEnd", x, y);
      await sleep(350);
    };
    const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2];
    const rectOf = (expr) => evaluate(`(() => { const o = (${expr}); const el = o.getSvgRoot ? o.getSvgRoot() : o; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
    // the page scrolls, as a learner's thumb does; not a tap, so it is counted apart
    const bring = async (expr) => {
      const moved = await evaluate(`(() => {
        const o = (${expr}); const el = o.getSvgRoot ? o.getSvgRoot() : o; const r = el.getBoundingClientRect();
        const scroller = document.querySelector(".bfh-scroll"); const want = r.top + r.height / 2;
        const sheet = document.querySelector(".bfp-sheet"); const limit = window.innerHeight - 48 - (sheet ? sheet.offsetHeight : 120);
        if (want > limit || want < 90) { scroller.scrollTop += want - Math.max(100, Math.min(limit - 20, 260)); return true; }
        return false; })()`);
      if (moved) { scrolls += 1; await sleep(250); }
    };
    const tapBlock = async (expr) => { await bring(expr); const r = await rectOf(expr); await tap(r.x + 7, r.y + 9); };
    const tapField = async (expr, field) => { await bring(expr); const r = await rectOf(`(${expr}).getField("${field}")`); await tap(...centre(r)); };
    const tapSel = async (selector) => {
      const at = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
        el.scrollIntoView({ block: "nearest" }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      if (!at) throw new Error("nothing to tap: " + selector);
      await tap(...at);
    };
    const block = (type, n = 0) => `window.bfEditor.workspace.getBlocksByType("bf_${type}", true)[${n}]`;
    const slot = (type, input, n = 0) => `${block(type, n)}.getInputTargetBlock("${input}")`;

    // what must hold after every task (the pass mark's criteria 3, 5 and 6, and no block outside the column)
    const verify = async (label) => {
      await sleep(300);
      const state = await evaluate(`(async () => {
        const bf = await import("/dist/blockly-fun.js");
        const editor = window.bfEditor;
        const scroller = document.querySelector(".bfh-scroll");
        const inner = window.innerWidth;
        const outside = editor.workspace.getAllBlocks(false).filter((b) => {
          const r = b.getSvgRoot().getBoundingClientRect();
          return r.right > inner + 1 || r.left < -1;
        }).map((b) => b.type);
        const targets = [...document.querySelectorAll(".bfp-sheet button, .bfp-bar button, .bfp-list button, #host button")]
          .filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); });
        return {
          python: editor.toPython(), expected: bf.toPython(editor.save()),
          docWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, scrollerWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth, scrollLeft: scroller.scrollLeft, inner, outside,
          smallestButton: targets.length ? Math.min(...targets) : null,
          scale: Number(editor.workspace.scale.toFixed(3)),
        };
      })()`);
      const result = {
        pythonSame: state.python === state.expected,
        noSideScroll: state.docWidth <= state.inner && state.bodyWidth <= state.inner && state.scrollerWidth <= state.clientWidth && state.scrollLeft === 0,
        inColumn: state.outside.length === 0,
        buttons44: state.smallestButton === null || state.smallestButton >= 44,
        smallestButton: state.smallestButton,
        scale: state.scale,
      };
      report.criteria[label] = result;
      for (const [k, ok] of Object.entries(result)) if (ok === false) report.problems.push(`${label}: ${k} failed ${JSON.stringify(state.outside)}`);
      return state.python;
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

    // ---------------------------------------------------------------------------------------------------------------
    await open("?layout=phone-a&catalogue");
    report.layout = await evaluate("window.bfEditor.layout()");
    report.mode = await evaluate("window.bfEditor.mode()");
    await load(timeBased);
    report.start = { python: await python(), scale: await evaluate("window.bfEditor.workspace.scale") };
    await shoot("a_0_start.png");
    await verify("start");

    // 1. change 80 to 120 in circle, watching the canvas: tap the 80, slide, Done
    await task(1, 2, async () => {
      await tapField(slot("circle", "D"), "NUM");
      const sheet = await evaluate(`(() => { const s = document.querySelector(".bfp-sheet"); const r = document.querySelector('[data-bf="slider"]');
        return { open: !!s, slider: r ? { min: Number(r.min), max: Number(r.max), step: Number(r.step), value: Number(r.value) } : null }; })()`);
      await shoot("a_1_sheet.png");
      // the slide: a touch on the thumb, dragged to where 120 is (the thumb is 28 px wide; the value maps along the rest of the width)
      const s = sheet.slider;
      const box = await evaluate(`(() => { const r = document.querySelector('[data-bf="slider"]').getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width }; })()`);
      const at = (v) => box.x + 14 + ((v - s.min) / (s.max - s.min)) * (box.w - 28);
      await touch("touchStart", at(s.value), box.y);
      for (let i = 1; i <= 8; i += 1) { await touch("touchMove", at(s.value + ((120 - s.value) * i) / 8), box.y); await sleep(40); }
      await touch("touchEnd");
      await sleep(400);
      let value = await evaluate(`Number(${slot("circle", "D")}.getFieldValue("NUM"))`);
      const slid = value;
      await shoot("a_1_slid.png");
      await tapSel('[data-bf="done"]');
      value = await evaluate(`Number(${slot("circle", "D")}.getFieldValue("NUM"))`);
      const code = await verify("task1");
      return { ok: value === 120 && code.includes("f.circle(x, f.height / 2, 120)"), slider: s, slid, value };
    });

    // 2. x + (something) where x was: tap x, +, a variable, Done. (The example has no loop variable i; width is a variable from the catalogue.)
    await task(2, 4, async () => {
      await tapField(slot("circle", "X"), "VAR");
      await tapSel('[data-bf="op-+"]');
      await shoot("a_2_operator.png");
      await tapSel('[data-bf="var-sketch-width"]');
      await tapSel('[data-bf="done"]');
      const code = await verify("task2");
      await shoot("a_2_done.png");
      return { ok: code.includes("f.circle(x + f.width, f.height / 2, 120)") };
    });

    // 3. a new variable speed in a slot: tap the 150, New variable, type the name, Make, Done
    await task(3, 5, async () => {
      await tapField(slot("change", "VALUE") + '.getInputTargetBlock("A")', "NUM");
      await tapSel('[data-bf="new-variable"]');
      await shoot("a_3_name.png");
      await cdp.send("Input.insertText", { text: "speed" });
      await sleep(200);
      await tapSel('[data-bf="make"]');
      await shoot("a_3_made.png");
      await tapSel('[data-bf="done"]');
      const code = await verify("task3");
      return { ok: /^x = 0\nspeed = 0\n/m.test(code) && code.includes("x += speed * f.delta_time"), typed: "speed" };
    });

    // 4. a circle after fill colour: tap fill, Add below, the circle row (its first value opens in the sheet)
    await task(4, 3, async () => {
      const before = await evaluate("window.bfEditor.workspace.getAllBlocks(false).filter((b) => !b.isShadow() && !b.outputConnection).length");
      await tapBlock(block("fill"));
      await shoot("a_4_picked.png");
      await tapSel('[data-bf="below"]');
      await shoot("a_4_list.png");
      await tapSel('[data-bf="block-circle"]');
      await shoot("a_4_added.png");
      const sheetOpen = await evaluate('!!document.querySelector(".bfp-sheet")');
      const after = await evaluate("window.bfEditor.workspace.getAllBlocks(false).filter((b) => !b.isShadow() && !b.outputConnection).length");
      const code = await verify("task4");
      const lines = code.split("\n").map((l) => l.trim());
      const at = lines.indexOf('f.fill("seagreen")');
      // the Done that closes the sheet is not part of the task's budget; it is counted apart
      const closing = taps;
      await tapSel('[data-bf="done"]');
      taps = closing;
      return { ok: lines[at + 1] === "f.circle(320, 200, 80)" && after === before + 1, added: after - before, sheetOpenedOnFirstValue: sheetOpen, closingTapNotCounted: 1 };
    });

    // 6 comes before 5 in the file only because 5 starts from an empty sketch; tasks 6 and 7 start again from the example
    await load(timeBased);
    await task(6, 15, async () => {
      const out = {};
      const step = async (name, budget, fn, check) => {
        const before = taps;
        await fn();
        const code = await verify(`task6_${name}`);
        out[name] = { taps: taps - before, budget, ok: check(code) && taps - before <= budget };
        if (!out[name].ok) out[name].python = code;
      };
      const lineIndex = (code, text) => code.split("\n").map((l) => l.trim()).indexOf(text);
      await step("up", 3, async () => {
        await tapBlock(block("circle"));
        await tapSel('[data-bf="up"]');
      }, (c) => lineIndex(c, "f.circle(x, f.height / 2, 80)") < lineIndex(c, 'f.fill("seagreen")'));
      await shoot("a_6_up.png");
      await step("into", 3, async () => {
        await tapBlock(block("change"));
        await tapSel('[data-bf="down"]');          // below the if
        await tapSel('[data-bf="in"]');            // into the if above it
      }, (c) => /if x > f.width:\n {8}x = 0\n {8}x \+= 150 \* f.delta_time/.test(c));
      await shoot("a_6_in.png");
      await step("out", 3, async () => {
        await tapSel('[data-bf="out"]');
      }, (c) => /if x > f.width:\n {8}x = 0\n {4}x \+= 150 \* f.delta_time/.test(c));
      await step("duplicate", 3, async () => {
        await tapBlock(block("fill"));
        await tapSel('[data-bf="copy"]');
      }, (c) => c.split('f.fill("seagreen")').length === 3);
      await shoot("a_6_copy.png");
      await step("delete", 3, async () => {
        await tapSel('[data-bf="delete"]');
      }, (c) => c.split('f.fill("seagreen")').length === 2);
      await shoot("a_6_deleted.png");
      // one Undo takes one action back
      const undone = await evaluate(`(() => { const e = window.bfEditor; e.undo(); return e.toPython().split('f.fill("seagreen")').length - 1; })()`);
      out.undoTakesDeleteBack = undone === 2;
      return { ...out, ok: Object.values(out).every((v) => v === true || v.ok === true) };
    });

    // 7. an error: the line is marked, its message one tap away
    await task(7, 1, async () => {
      const code = await python();
      const line = code.split("\n").findIndex((l) => l.includes("f.circle(")) + 1;
      const id = await evaluate(`window.bfEditor.markError(${line}, "Line ${line}: speed is not defined")`);
      await sleep(200);
      const marked = await evaluate(`(() => { const b = window.bfEditor.workspace.getBlockById(${JSON.stringify(id)}); return !!b && b.getSvgRoot().classList.contains("bfh-error") && b.type === "bf_circle"; })()`);
      await tapBlock(`window.bfEditor.workspace.getBlockById(${JSON.stringify(id)})`);
      await sleep(200);
      const shown = await evaluate(`(() => { const e = document.querySelector(".bfp-error"); return e && !e.hidden ? e.textContent : null; })()`);
      await shoot("a_7_error.png");
      await verify("task7");
      return { ok: marked && shown === `Line ${line}: speed is not defined`, marked, shown, line };
    });
    await evaluate("window.bfEditor.clearErrors()");

    // 5. from an empty sketch: background, a circle in every frame, then wrap it in a repeat 10
    await load({ blocks: { languageVersion: 0, blocks: [] } });
    await task(5, 20, async () => {
      await tapSel('[data-bf="add"]');
      await tapSel('[data-bf="block-sketch_frame"]');
      await shoot("a_5_frame.png");
      await tapSel('[data-bf="below"]');
      await tapSel('[data-bf="block-background"]');
      await tapSel('[data-bf="below"]');
      await tapSel('[data-bf="block-circle"]');
      await shoot("a_5_circle.png");
      const closing = taps;
      await tapSel('[data-bf="done"]');            // closes the sheet that opened on the circle's first value
      await tapSel('[data-bf="wrap"]');
      await tapSel('[data-bf="wrap-repeat"]');
      await shoot("a_5_wrapped.png");
      void closing;
      const code = await verify("task5");
      return { ok: /def draw\(\):\n {4}f.background\("white"\)\n {4}for _ in range\(10\):\n {8}f.circle\(320, 200, 80\)\n/.test(code), python: code };
    });

    // criterion 4: scrolling never moves a block (a swipe over the blocks, up and sideways, changes no block and no Python)
    await load(timeBased);
    await tapSel('[data-bf="add"]').catch(() => {});      // nothing picked: the list opens; the swipe below runs with the bar showing
    await evaluate('document.querySelector(\'[data-bf="close-list"]\')?.click()');
    const places = () => evaluate(`window.bfEditor.workspace.getAllBlocks(false).filter((b) => !b.outputConnection).map((b) => { const p = b.getRelativeToSurfaceXY(); return b.id + ":" + Math.round(p.x) + "," + Math.round(p.y); }).join(";")`);
    const beforeSwipe = { places: await places(), python: await python(), top: await evaluate('document.querySelector(".bfh-scroll").scrollTop') };
    const circle = await rectOf(block("circle"));
    await touch("touchStart", circle.x + 40, circle.y + 12);
    for (let i = 1; i <= 15; i += 1) { await touch("touchMove", circle.x + 40 - i * 12, circle.y + 12 - i * 14); await sleep(30); }
    await touch("touchEnd");
    await sleep(500);
    const afterSwipe = { places: await places(), python: await python(), top: await evaluate('document.querySelector(".bfh-scroll").scrollTop'), left: await evaluate('document.querySelector(".bfh-scroll").scrollLeft') };
    const scrollable = await evaluate('(() => { const s = document.querySelector(".bfh-scroll"); return s.scrollHeight - s.clientHeight; })()');
    report.scrolling = { moved: beforeSwipe.places !== afterSwipe.places, pythonSame: beforeSwipe.python === afterSwipe.python, scrollTop: [beforeSwipe.top, afterSwipe.top], scrollLeft: afterSwipe.left, scrollableBy: scrollable };
    if (report.scrolling.moved || !report.scrolling.pythonSame || afterSwipe.left !== 0) report.problems.push("a swipe changed a block or scrolled sideways: " + JSON.stringify(report.scrolling));

    // the size of the targets in the blocks themselves: a statement block's own height, and a value's (a number, a name) drawn height
    // (criterion 6 for what Blockly draws; the sheet's and the bar's buttons are measured after every task)
    report.targets = await evaluate(`(() => {
      const ws = window.bfEditor.workspace; const s = ws.scale;
      const statements = ws.getAllBlocks(false).filter((b) => !b.outputConnection && !b.isShadow());
      const heights = statements.map((b) => Math.round(b.getBoundingRectangleWithoutChildren().getHeight() * s));
      const values = ws.getAllBlocks(false).filter((b) => b.outputConnection && b.getSvgRoot().getBoundingClientRect().width && (b.type === "bf_number" || b.type === "bf_variable"));
      const drawn = values.map((b) => Math.round(b.getBoundingRectangleWithoutChildren().getHeight() * s));
      return { scale: Number(s.toFixed(3)), statementRowHeights: { min: Math.min(...heights), max: Math.max(...heights) },
        numberAndVariableHeights: { min: Math.min(...drawn), max: Math.max(...drawn) } };
    })()`);
    report.criteria.targetsInBlocks = { statementsAtLeast44: report.targets.statementRowHeights.min >= 44, valuesAtLeast44: report.targets.numberAndVariableHeights.min >= 44 };
    await shoot("a_9_end.png");

    // the other layouts are untouched (phone_check.mjs proves it fully): the layout name is still accepted and the wide one is wide
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
