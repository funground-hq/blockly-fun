// BF-15 round 4 (BF-D-051), in a real browser: the four modes, the foot bar (mode list, zoom, Reset), Python code blocks that
// fold, the stacks in one column, and the search above the keyboard. Called by tools/phone_check.mjs with the phone open
// (360 x 720, touch) on demo/phone.html and the built bundle. Pick-then-move and adding by a tap (Move and Add mode) are
// checked in tools/pick_checks.mjs.
//
// The functions named page* run in the page: they are turned into text and sent over the DevTools protocol.

const NOTES = [
  "\"\"\"Fonts and styles", "", "The first four lines use the four built-in styles. The fifth uses a font loaded from a file.",
  "The last line goes back to the built-in font.\"\"\"",
].join("\n");

/** In the page: a Python code block (a long note), a stack of two "say" blocks and a stack of "set" and "say", and helpers. */
function pageSetup(notes) {
  const say = (text, next) => ({
    type: "bf_say", extraState: { items: 1 },
    inputs: { ARG0: { block: { type: "bf_text", fields: { TEXT: text } } } },
    ...(next ? { next: { block: next } } : {}),
  });
  const set = (next) => ({
    type: "bf_set", fields: { VAR: "size" }, inputs: { VALUE: { shadow: { type: "bf_number", fields: { NUM: "32" } } } },
    ...(next ? { next: { block: next } } : {}),
  });
  const editor = window.bfEditor;
  editor.workspace.getToolbox().clearSelection();
  // scattered on purpose: the column puts them in order by their top edge (the notes, the two says, then the set)
  editor.load({
    blocks: {
      languageVersion: 0, blocks: [
        { type: "bf_code", fields: { TEXT: notes }, x: 300, y: 10 },
        { ...say("one", say("two")), x: 20, y: 30 },
        { ...set(say("three")), x: 200, y: 90 },
      ],
    },
  });
  const workspace = editor.workspace;
  const tops = workspace.getTopBlocks(true);
  window.bfIds = tops.map((b) => b.id);            // the notes, the says, the set: in the order they are put
  const block = (i) => workspace.getBlockById(window.bfIds[i]);
  window.bfBlock = block;
  window.bfBox = () => workspace.getTopBlocks(true).map((b) => {
    const r = b.getBoundingRectangle();
    return { id: b.id, type: b.type, left: Math.round(r.left), top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right) };
  });
  window.bfOverlap = () => {
    const boxes = window.bfBox();
    return boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
  };
  window.bfCenter = (element) => {
    const r = element.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  window.bfBody = (i) => window.bfCenter(block(i).getSvgRoot().querySelector(":scope > .blocklyPath"));
  window.bfLeftEdge = (i) => {
    const r = block(i).getSvgRoot().querySelector(":scope > .blocklyPath").getBoundingClientRect();
    return [r.x + 10, r.y + r.height / 2];
  };
  window.bfFold = () => {
    const b = block(0);
    return {
      folded: b.bfFold.folded, control: b.getFieldValue("FOLD"), preview: b.bfFold.preview.getValue(),
      textShown: b.getField("TEXT").isVisible(), previewShown: b.bfFold.preview.isVisible(),
      saved: JSON.stringify(window.bfEditor.save().blocks.blocks.find((s) => s.type === "bf_code")), height: Math.round(b.getHeightWidth().height),
    };
  };
  window.bfControl = () => window.bfCenter(block(0).getField("FOLD").getSvgRoot());
  window.bfSetNumber = () => window.bfCenter(block(2).getInput("VALUE").connection.targetBlock().getField("NUM").getSvgRoot());
  window.bfNumberValue = () => block(2).getInput("VALUE").connection.targetBlock().getFieldValue("NUM");
  window.bfView = () => [Math.round(workspace.scrollX), Math.round(workspace.scrollY), Number(workspace.scale.toFixed(3))];
  window.bfState = () => ({
    mode: editor.mode(), picked: editor.picked(), canUndo: editor.canUndo(), tops: workspace.getTopBlocks(false).length,
    python: editor.toPython(), editing: !!document.querySelector(".blocklyHtmlInput"), toolbox: Math.round(document.querySelector(".blocklyToolbox").getBoundingClientRect().height),
    flyout: workspace.getFlyout().isVisible(),
  });
  return window.bfIds.length;
}

export async function modeChecks({ evaluate, touch, tap, shoot, report, sleep, cdp, open }) {
  const problems = report.problems;
  const check = (ok, message) => { if (!ok) problems.push("modes: " + message); };
  const info = {};
  report.modes = info;
  const run = (fn, ...args) => evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const drag = async (from, to, steps = 12) => {
    await touch("touchStart", from[0], from[1]);
    for (let step = 1; step <= steps; step += 1) {
      await touch("touchMove", from[0] + (to[0] - from[0]) * step / steps, from[1] + (to[1] - from[1]) * step / steps);
      await sleep(25);
    }
    await touch("touchEnd");
    await sleep(600);
  };
  const state = () => evaluate("window.bfState()");
  const key = async (name, code, windowsVirtualKeyCode) => {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode });
    await sleep(200);
  };

  // a fresh page in Read mode, as the editor starts; with funground's catalogue, as Play has it (several lines of code, dropdowns)
  await open("?catalogue", 360, 720, true);
  check(await run(pageSetup, NOTES) === 3, "the program was not put in");
  await sleep(800);
  const python = await evaluate("window.bfEditor.toPython()");

  // 1. Read is the start: the kinds are hidden, the foot bar is the mock-up's, the blocks are small, no Blockly zoom buttons or bin
  const start = await state();
  info.start = start;
  check(start.mode === "read" && start.toolbox === 0, "the editor does not start in Read with the kinds hidden: " + JSON.stringify({ mode: start.mode, toolbox: start.toolbox }));
  info.foot = await evaluate(`(() => {
    const size = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
    const text = document.querySelector(".blocklyText");
    return { mode: document.querySelector(".bf-modebtn").textContent, expanded: document.querySelector(".bf-modebtn").getAttribute("aria-expanded"),
      modeSize: size(document.querySelector(".bf-modebtn")), zoomSizes: [...document.querySelectorAll(".bf-zbtn")].map(size),
      pill: getComputedStyle(document.querySelector(".bf-modebtn")).backgroundColor, hint: document.querySelector(".bf-hint").textContent,
      footBottom: Math.round(document.querySelector(".bf-foot").getBoundingClientRect().bottom), innerHeight: window.innerHeight,
      textPx: Number((parseFloat(getComputedStyle(text).fontSize) * window.bfEditor.workspace.scale).toFixed(1)),
      scale: window.bfEditor.workspace.scale, zoomDrawn: !!document.querySelector(".blocklyZoom"), binDrawn: !!document.querySelector(".blocklyTrash") };
  })()`);
  const foot = info.foot;
  check(/^\u{1F441} Read\s*▾$/u.test(foot.mode) && foot.expanded === "false", "the mode button does not name the mode: " + JSON.stringify(foot.mode));
  check(foot.modeSize[1] >= 40 && foot.zoomSizes.length === 3 && foot.zoomSizes.slice(0, 2).every(([w, h]) => w === 40 && h === 40), "the foot bar's controls are not 40 px: " + JSON.stringify(foot));
  check(foot.pill === "rgb(25, 25, 112)" && foot.hint === "Drag to look around", "the mode pill or the hint is not the mock-up's: " + JSON.stringify([foot.pill, foot.hint]));
  check(foot.footBottom === foot.innerHeight, "the foot bar is not at the foot of the screen: " + JSON.stringify([foot.footBottom, foot.innerHeight]));
  check(foot.textPx >= 12 && foot.textPx <= 13, "the blocks' text is not about 12.5 px: " + foot.textPx);
  check(!foot.zoomDrawn && !foot.binDrawn, "Blockly's zoom buttons or bin are drawn on a phone");
  await shoot("mode_1_read.png");

  // 2. in Read a tap changes nothing, a number cannot be edited, a drag moves the view and not the block, and two fingers zoom
  const positions = await evaluate("JSON.stringify(window.bfBox())");
  await tap(...await evaluate("window.bfBody(1)"));
  await tap(...await evaluate("window.bfSetNumber()"));
  const tapped = await state();
  info.readTap = { picked: tapped.picked, canUndo: tapped.canUndo, editing: tapped.editing };
  check(tapped.picked === null && !tapped.canUndo && !tapped.editing && tapped.python === python, "a tap in Read changed something: " + JSON.stringify(info.readTap));
  const viewBefore = await evaluate("window.bfView()");
  await drag(await evaluate("window.bfLeftEdge(1)"), [150, 200]);
  const viewAfter = await evaluate("window.bfView()");
  info.readDrag = { viewBefore, viewAfter, same: positions === await evaluate("JSON.stringify(window.bfBox())") };
  check(info.readDrag.same && (viewBefore[0] !== viewAfter[0] || viewBefore[1] !== viewAfter[1]), "a drag on a block in Read did not move the view only: " + JSON.stringify(info.readDrag));
  check(!(await state()).canUndo, "a drag in Read is a step to undo");
  const pinch = async (from, to) => {
    const points = (gap) => [{ x: 180 - gap, y: 300, id: 1 }, { x: 180 + gap, y: 300, id: 2 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
    for (let step = 1; step <= 10; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + (to - from) * step / 10) });
      await sleep(30);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(400);
  };
  const before = (await evaluate("window.bfView()"))[2];
  await pinch(30, 90);
  const pinched = (await evaluate("window.bfView()"))[2];
  info.pinch = { before, pinched };
  check(pinched > before * 1.2, "two fingers did not zoom in Read: " + JSON.stringify(info.pinch));
  await tap(...await evaluate('(() => window.bfCenter([...document.querySelectorAll(".bf-zbtn")].at(-1)))()'));       // Reset
  check(Math.abs((await evaluate("window.bfView()"))[2] - 0.78) < 0.005, "Reset did not go back to the starting size");

  // 3. the notes are folded at first, one line with a ▸; a tap on it opens the block and a tap again folds it, in Read, with nothing to undo
  const folded = await evaluate("window.bfFold()");
  info.folded = folded;
  check(folded.folded && folded.control.startsWith("▸") && folded.preview === "\"\"\"Fonts and styles…" && !folded.textShown && folded.previewShown,
    "the notes are not folded to their first line at first: " + JSON.stringify(folded));
  check(!folded.saved.includes("PREVIEW") && !folded.saved.includes("FOLD") && !folded.saved.includes("collapsed"), "the fold is saved with the program: " + folded.saved);
  await tap(...await evaluate("window.bfControl()"));
  const opened = await evaluate("window.bfFold()");
  info.opened = opened;
  check(!opened.folded && opened.control.startsWith("▾") && opened.textShown && !opened.previewShown && opened.height >= folded.height,
    "a tap on the arrow did not open the notes: " + JSON.stringify(opened));
  const afterOpen = await state();
  check(!afterOpen.canUndo && afterOpen.python === python && afterOpen.mode === "read", "opening a block is a step to undo, or changed the Python: " + JSON.stringify(afterOpen.canUndo));
  check(!(await evaluate("window.bfOverlap()")), "stacks lie on one another after the notes opened");
  await shoot("mode_2_fold_open.png");
  await tap(...await evaluate("window.bfControl()"));
  check((await evaluate("window.bfFold()")).folded, "a second tap did not fold the notes");
  check(!(await evaluate("window.bfOverlap()")) && (await state()).python === python, "after folding the stacks overlap or the Python changed");

  // 4. the mode list: a menu of four radios, Escape closes it and the focus goes back to the button; a choice changes the mode
  await tap(...await evaluate('window.bfCenter(document.querySelector(".bf-modebtn"))'));
  info.menu = await evaluate(`(() => {
    const menu = document.querySelector(".bf-modemenu");
    return { hidden: menu.hidden, role: menu.getAttribute("role"), expanded: document.querySelector(".bf-modebtn").getAttribute("aria-expanded"),
      items: [...menu.querySelectorAll("[role=menuitemradio]")].map((i) => [i.querySelector("b").textContent, i.getAttribute("aria-checked"), i.querySelector("small").textContent]),
      focus: document.activeElement?.dataset?.mode, aboveFoot: menu.getBoundingClientRect().bottom <= document.querySelector(".bf-foot").getBoundingClientRect().top + 1 };
  })()`);
  const menu = info.menu;
  check(!menu.hidden && menu.role === "menu" && menu.expanded === "true" && menu.focus === "read" && menu.aboveFoot, "the mode list did not open as a menu: " + JSON.stringify(menu));
  check(JSON.stringify(menu.items.map((i) => i[0])) === '["Read","Values","Add","Move"]' && menu.items[0][1] === "true" && menu.items.slice(1).every((i) => i[1] === "false")
    && menu.items[0][2] === "Look around, zoom, open and fold. Nothing changes.", "the four modes and their lines are not as the mock-up has them: " + JSON.stringify(menu.items));
  await shoot("mode_3_menu.png");
  await key("ArrowDown", "ArrowDown", 40);
  check(await evaluate("document.activeElement.dataset.mode") === "values", "the down arrow did not move to the next mode");
  await key("Escape", "Escape", 27);
  info.escape = await evaluate(`({ hidden: document.querySelector(".bf-modemenu").hidden, focusIsButton: document.activeElement === document.querySelector(".bf-modebtn"), mode: window.bfEditor.mode() })`);
  check(info.escape.hidden && info.escape.focusIsButton && info.escape.mode === "read", "Escape did not close the list, give the focus back and keep the mode: " + JSON.stringify(info.escape));
  await tap(...await evaluate('window.bfCenter(document.querySelector(".bf-modebtn"))'));
  await tap(...await evaluate('window.bfCenter(document.querySelector("[data-mode=values]"))'));
  info.chosen = await evaluate(`({ mode: window.bfEditor.mode(), label: document.querySelector(".bf-modebtn").textContent, hidden: document.querySelector(".bf-modemenu").hidden,
    focusIsButton: document.activeElement === document.querySelector(".bf-modebtn"), hint: document.querySelector(".bf-hint").textContent })`);
  check(info.chosen.mode === "values" && /Values/.test(info.chosen.label) && info.chosen.hidden && info.chosen.focusIsButton && info.chosen.hint === "Tap a value to change it",
    "choosing Values in the list did not change the mode: " + JSON.stringify(info.chosen));

  // 5. Values: a tap on a number opens its editor; the number is changed; blocks never move or get picked; a drag moves the view
  const where = await evaluate("JSON.stringify(window.bfBox())");
  await tap(...await evaluate("window.bfBody(1)"));
  check((await state()).picked === null, "a tap on a block picked it in Values mode");
  await drag(await evaluate("window.bfLeftEdge(1)"), [100, 160]);
  check(where === await evaluate("JSON.stringify(window.bfBox())") && !(await state()).canUndo, "a drag on a block in Values mode moved it");
  await evaluate('window.bfEditor.mode("read"); window.bfEditor.mode("values")');                  // the view is put back by Reset (below)
  await tap(...await evaluate('window.bfCenter([...document.querySelectorAll(".bf-zbtn")].at(-1))'));
  await sleep(200);
  await tap(...await evaluate("window.bfSetNumber()"));
  info.valueEditor = await evaluate("({ editing: !!document.querySelector('.blocklyHtmlInput'), value: window.bfNumberValue() })");
  check(info.valueEditor.editing, "a tap on a number did not open its editor in Values mode");
  await shoot("mode_4_values.png");
  await cdp.send("Input.insertText", { text: "77" });
  await key("Enter", "Enter", 13);
  const edited = await state();
  info.edited = { value: await evaluate("window.bfNumberValue()"), canUndo: edited.canUndo, positionsSame: where === await evaluate("JSON.stringify(window.bfBox())") };
  check(info.edited.value === "77" && edited.python.includes("size = 77") && edited.canUndo, "the number was not changed to 77: " + JSON.stringify(info.edited));

  // a long press (the browser's contextmenu event) offers no Delete, no Duplicate and no workspace menu
  info.menu = await evaluate(`(() => {
    const at = window.bfSetNumber(); const el = document.elementFromPoint(at[0], at[1]);
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at[0], clientY: at[1] }));
    const bare = document.querySelector(".blocklyWorkspace");
    bare.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    return !!document.querySelector(".blocklyContextMenu, .blocklyMenu");
  })()`);
  check(info.menu === false, "a long press offered a context menu in Values mode");
  await evaluate('window.bfEditor.mode("move")');
  await tap(...await evaluate("window.bfSetNumber()"));                                           // Move is for moving: no value editor opens
  check(!(await evaluate("!!document.querySelector('.blocklyHtmlInput')")), "a tap on a number opened its editor in Move mode");
  await evaluate('window.bfEditor.mode("values")');

  // 6. Reset: the starting size, the first block at the top left of the view, nothing picked, no list of blocks open
  await evaluate('window.bfEditor.mode("move")');
  await tap(...await evaluate("window.bfLeftEdge(1)"));
  check((await state()).picked !== null, "a tap did not pick in Move mode");
  const out = (await evaluate("window.bfView()"))[2];
  await tap(...await evaluate('window.bfCenter(document.querySelector("[aria-label=\'Zoom in\']"))'));
  await tap(...await evaluate('window.bfCenter(document.querySelector("[aria-label=\'Zoom in\']"))'));
  const zoomedIn = (await evaluate("window.bfView()"))[2];
  await tap(...await evaluate('window.bfCenter(document.querySelector("[aria-label=\'Zoom out\']"))'));
  const zoomedOut = (await evaluate("window.bfView()"))[2];
  info.zoom = { out, zoomedIn, zoomedOut };
  check(zoomedIn > out * 1.3 && zoomedOut < zoomedIn, "the + and - buttons did not zoom: " + JSON.stringify(info.zoom));
  await drag([180, 400], [100, 250]);
  await evaluate('window.bfEditor.mode("add")');
  await tap(...await evaluate("window.bfLeftEdge(1)"));
  await tap(...await evaluate(`(() => window.bfCenter(document.querySelectorAll(".blocklyToolboxCategoryContainer")[1]))()`));
  check((await state()).flyout, "a kind of block did not open its list in Add mode");
  await tap(...await evaluate('window.bfCenter(document.querySelector(".bf-zbtn.bf-wide"))'));
  const reset = await state();
  info.reset = await evaluate(`(() => {
    const r = window.bfBlock(0).getSvgRoot().querySelector(":scope > .blocklyPath").getBoundingClientRect();
    return { view: window.bfView(), first: [Math.round(r.x), Math.round(r.y)] };
  })()`);
  check(Math.abs(info.reset.view[2] - 0.78) < 0.005, "Reset did not go back to the starting size: " + JSON.stringify(info.reset));
  check(Math.abs(info.reset.first[0] - 12) <= 2 && Math.abs(info.reset.first[1] - 12) <= 2, "Reset did not put the first block at the top left: " + JSON.stringify(info.reset));
  check(reset.picked === null && !reset.flyout, "Reset did not put down what was marked or close the list: " + JSON.stringify([reset.picked, reset.flyout]));
  await shoot("mode_5_reset.png");

  // 7. one column: a stack dropped on another goes in where it was let go, nothing overlaps, and one Undo takes drop and move back
  await run(pageSetup, NOTES);
  await sleep(800);
  await evaluate('window.bfEditor.mode("move")');
  const order = await evaluate("window.bfBox().map((b) => b.id)");
  const column = await evaluate("window.bfBox()");
  info.column = column.map((b) => [b.type.replace("bf_", ""), b.left, b.top, b.bottom]);
  check(!(await evaluate("window.bfOverlap()")) && new Set(column.map((b) => b.left)).size === 1, "the stacks are not in one column after a load: " + JSON.stringify(info.column));
  check(column.every((b, i) => i === 0 || b.top - column[i - 1].bottom === column[1].top - column[0].bottom), "the gaps between stacks are not all the same: " + JSON.stringify(info.column));
  await tap(...await evaluate("window.bfLeftEdge(1)"));                           // pick the two says
  const stackOne = await evaluate("window.bfBody(1)");
  const stackTwo = await evaluate("window.bfBody(2)");
  await drag(await evaluate("window.bfLeftEdge(1)"), [stackTwo[0] - 20, stackTwo[1] + 4]);          // let go on the set stack
  const dropped = await evaluate("window.bfBox()");
  info.dropped = dropped.map((b) => [b.type.replace("bf_", ""), b.left, b.top, b.bottom]);
  check(!(await evaluate("window.bfOverlap()")), "two stacks lie on one another after a drop: " + JSON.stringify(info.dropped));
  check(JSON.stringify(dropped.map((b) => b.id)) !== JSON.stringify(order) && dropped[0].id === order[0], "the dropped stack did not go in where it was let go: " + JSON.stringify([order, dropped.map((b) => b.id)]));
  await shoot("mode_6_dropped.png");
  const undone = await evaluate("(() => { window.bfEditor.undo(); return new Promise((r) => setTimeout(() => r({ boxes: window.bfBox().map((b) => [b.id, b.left, b.top, b.bottom]), canUndo: window.bfEditor.canUndo() }), 500)); })()");
  info.undone = undone;
  check(JSON.stringify(undone.boxes) === JSON.stringify(column.map((b) => [b.id, b.left, b.top, b.bottom])) && !undone.canUndo,
    "one Undo did not take the drop and the move into place back: " + JSON.stringify(undone));

  // 8. the search stays above the keyboard. A real keyboard cannot be had here, so a visual viewport that shrinks stands in for it.
  await cdp.send("Page.enable");
  const fake = (await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const listeners = {};
    const viewport = { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1,
      addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); }, removeEventListener: () => {},
      shrink: (height) => { viewport.height = height; (listeners.resize ?? []).forEach((fn) => fn()); } };
    Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  })()` })).identifier;
  await open("?catalogue", 360, 720, true);
  await run(pageSetup, NOTES);
  await evaluate('window.bfEditor.mode("add")');
  await sleep(500);
  await tap(...await evaluate(`(() => window.bfCenter(document.querySelector(".blocklyToolboxCategoryContainer")))()`));
  const searchAt = await evaluate("window.bfCenter(document.querySelector('.bf-find input'))");
  const before_ = await evaluate("document.querySelector('.bf-find').getBoundingClientRect().bottom");
  await evaluate("window.visualViewport.shrink(420)");               // the keyboard covers the lower 300 px
  await sleep(500);
  info.keyboard = await evaluate(`(() => {
    const frame = document.querySelector(".bf-frame");
    const box = document.querySelector(".bf-find").getBoundingClientRect();
    const toolbox = document.querySelector(".blocklyToolbox").getBoundingClientRect();
    return { padding: frame.style.paddingBottom, footShown: getComputedStyle(document.querySelector(".bf-foot")).display !== "none", searchBottom: Math.round(box.bottom),
      searchTop: Math.round(box.top), toolboxBottom: Math.round(toolbox.bottom), searchVisible: !document.querySelector(".bf-find").hidden };
  })()`);
  const kb = info.keyboard;
  info.keyboard.before = Math.round(before_);
  check(kb.padding === "300px" && !kb.footShown && kb.searchVisible && kb.toolboxBottom <= 420 && kb.searchBottom <= 420 && kb.searchTop >= 0,
    "the search box is not above the keyboard (the visible part is 420 px high): " + JSON.stringify(kb));
  await shoot("mode_7_keyboard.png");
  await evaluate("window.visualViewport.shrink(720)");
  await sleep(300);
  check(await evaluate("document.querySelector('.bf-frame').style.paddingBottom") === "", "the room under the blocks was not given back when the keyboard went");
  await cdp.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: fake });
  void searchAt;
}
