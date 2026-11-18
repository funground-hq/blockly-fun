// BF-15 round 3 (BF-D-050), in a real browser: pick then move, adding by a tap, find a block, undo. Called by
// tools/phone_check.mjs with the phone already open (360 x 720, touch) on demo/phone.html and the built bundle. Since round 4
// (BF-D-051) picking and moving are the Move mode, and adding (the search, a tap in the list) is the Add mode; the stacks
// are in one column, so a drop that keeps the order puts the stack back, and the checks drop far enough to change the order.
//
// The functions named page* run in the page: they are turned into text and sent over the DevTools protocol.

/** In the page: puts a stack of five blocks on the editor, and the helpers the checks ask with. */
function pageSetup() {
  const say = (text, next) => ({
    type: "bf_say", extraState: { items: 1 },
    inputs: { ARG0: { block: { type: "bf_text", fields: { TEXT: text } } } },
    ...(next ? { next: { block: next } } : {}),
  });
  const set = { type: "bf_set", fields: { VAR: "v" }, inputs: { VALUE: { shadow: { type: "bf_number", fields: { NUM: "0" } } } } };
  const program = { blocks: { languageVersion: 0, blocks: [{ ...say("one", say("two", say("three", say("four", set)))), x: 20, y: 30 }] } };
  const editor = window.bfEditor;
  editor.workspace.getToolbox().clearSelection();   // on a phone a flyout stays open after a drag (attach.js): the checks start with none
  editor.mode("move");
  editor.load(program);
  const workspace = editor.workspace;
  window.bfIds = [];
  for (let b = workspace.getTopBlocks(true)[0]; b; b = b.getNextBlock()) window.bfIds.push(b.id);
  const block = (i) => workspace.getBlockById(window.bfIds[i]);
  // where a block's own drawing is on the screen (not its stack's), and where it is on the workspace
  window.bfRect = (i) => {
    const r = block(i).getSvgRoot().querySelector(":scope > .blocklyPath").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  window.bfAt = (i) => {
    const p = block(i).getRelativeToSurfaceXY();
    return [Math.round(p.x), Math.round(p.y)];
  };
  window.bfView = () => [Math.round(workspace.scrollX), Math.round(workspace.scrollY)];
  window.bfTops = () => workspace.getTopBlocks(true).length;
  window.bfStatements = () => workspace.getAllBlocks(false).filter((b) => !b.isShadow() && !b.outputConnection).map((b) => b.type.replace("bf_", ""));
  window.bfMarked = () => document.querySelectorAll(".bf-picked").length;
  window.bfBar = () => {
    const bar = document.querySelector(".bf-bar");
    return bar && !bar.hidden && bar.offsetHeight > 0 ? bar.innerText.replace(/\s+/g, " ").trim() : null;
  };
  window.bfButton = (name) => {
    const r = [...document.querySelectorAll(".bf-bar button")].find((b) => b.textContent.includes(name)).getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  // the value slot of the "set" block
  window.bfNumber = () => {
    const r = block(4).getInput("VALUE").connection.targetBlock().getField("NUM").getSvgRoot().getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  // a block in the flyout that is open, by its type
  window.bfFlyoutBlock = (type) => {
    const found = workspace.getFlyout().getWorkspace().getTopBlocks(true).find((b) => b.type === type);
    if (!found) return null;
    const r = found.getSvgRoot().querySelector(":scope > .blocklyPath").getBoundingClientRect();
    return [r.x + 10, r.y + r.height / 2];
  };
  window.bfFlyoutTypes = () => workspace.getFlyout().getWorkspace().getTopBlocks(true).map((b) => b.type.replace("bf_", ""));
  window.bfSearch = () => {
    const box = document.querySelector(".bf-find");
    const r = box && !box.hidden ? box.getBoundingClientRect() : null;
    return r && { visible: true, bottom: Math.round(r.bottom), top: Math.round(r.top), focused: document.activeElement === box.querySelector("input"), width: Math.round(r.width) };
  };
  return window.bfIds.length;
}

export async function pickChecks({ evaluate, touch, tap, shoot, report, sleep, cdp }) {
  const problems = report.problems;
  const check = (ok, message) => { if (!ok) problems.push("pick: " + message); };
  const info = {};
  report.pick = info;
  const run = (fn, ...args) => evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`);
  const rect = (i) => evaluate(`window.bfRect(${i})`);
  const left = async (i) => { const r = await rect(i); return [r.x + 10, r.y + r.h / 2]; };
  const drag = async (from, dx, dy) => {
    await touch("touchStart", from[0], from[1]);
    for (let step = 1; step <= 12; step += 1) { await touch("touchMove", from[0] + dx * step / 12, from[1] + dy * step / 12); await sleep(25); }
    await touch("touchEnd");
    await sleep(500);
  };
  const state = () => evaluate("({ picked: window.bfEditor.picked(), bar: window.bfBar(), marked: window.bfMarked(), canUndo: window.bfEditor.canUndo(), tops: window.bfTops() })");

  check(await run(pageSetup) === 5, "the program was not put in");
  await sleep(700);                                              // Blockly draws, then the column puts the stack in place
  info.afterLoad = await state();
  info.afterLoad.canRedo = await evaluate("window.bfEditor.canRedo()");
  check(!info.afterLoad.canUndo && !info.afterLoad.canRedo && info.afterLoad.picked === null, "a program just loaded has something to undo, or is picked: " + JSON.stringify(info.afterLoad));
  await shoot("pick_0_loaded.png");

  // 1. a drag on a block that is not picked moves the view, and does not move the block
  const before = await evaluate("({ at: window.bfAt(2), view: window.bfView(), screen: window.bfRect(2) })");
  await drag(await left(2), 40, -60);
  const after = await evaluate("({ at: window.bfAt(2), view: window.bfView(), screen: window.bfRect(2), tops: window.bfTops(), canUndo: window.bfEditor.canUndo() })");
  info.unpickedDrag = { before, after };
  check(JSON.stringify(before.at) === JSON.stringify(after.at) && after.tops === 1, "a drag on an unpicked block moved the block: " + JSON.stringify(info.unpickedDrag));
  check(before.view[0] !== after.view[0] || before.view[1] !== after.view[1], "a drag on an unpicked block did not scroll the view: " + JSON.stringify(info.unpickedDrag));
  check(!after.canUndo, "scrolling the view is a step to undo");
  await shoot("pick_1_scrolled.png");
  await drag(await left(2), -40, 60);                            // and back, so that the blocks are all in view

  // 2. a tap picks the block and the ones under it; the bar says so; every picked block is marked
  await tap(...await left(0));
  info.stack = await state();
  check(info.stack.picked?.count === 5 && !info.stack.picked.single, "a tap did not pick the stack of 5: " + JSON.stringify(info.stack));
  check(/^5 blocks picked: drag them/.test(info.stack.bar ?? "") && /Tap again for just this one/.test(info.stack.bar) && /Delete/.test(info.stack.bar) && /Done/.test(info.stack.bar),
    "the bar is not as it should be: " + info.stack.bar);
  check(info.stack.marked === 5, "not every picked block is marked: " + info.stack.marked);
  info.barBox = await evaluate(`(() => {
    const r = document.querySelector(".bf-bar").getBoundingClientRect();
    const foot = document.querySelector(".bf-foot").getBoundingClientRect();
    return { bottom: Math.round(r.bottom), footTop: Math.round(foot.top), width: Math.round(r.width),
      background: getComputedStyle(document.querySelector(".bf-bar")).backgroundColor,
      buttons: [...document.querySelectorAll(".bf-bar button")].map((b) => Math.round(b.getBoundingClientRect().height)) };
  })()`);
  // the mock-up's .actbar: small buttons (30 px), on the ink colour
  check(info.barBox.buttons.length === 2 && info.barBox.buttons.every((h) => h >= 30), "a button of the bar is under 30 px: " + JSON.stringify(info.barBox));
  check(info.barBox.background === "rgb(25, 25, 112)", "the bar is not the ink colour: " + info.barBox.background);
  check(info.barBox.bottom <= info.barBox.footTop + 1, "the bar is not above the foot bar: " + JSON.stringify(info.barBox));
  await shoot("pick_2_stack.png");

  // 3. a tap again picks only that block; another tap, the stack again
  await tap(...await left(0));
  info.single = await state();
  check(info.single.picked?.count === 1 && info.single.picked.single && /^1 block picked: drag it/.test(info.single.bar ?? "") && /for the ones below/.test(info.single.bar) && info.single.marked === 1,
    "a second tap did not pick the single block: " + JSON.stringify(info.single));
  await shoot("pick_3_single.png");
  await tap(...await left(0));
  check((await state()).picked?.count === 5, "a third tap did not go back to the stack");
  await tap(...await left(0));                                   // single again

  // 4. a drag moves only what is picked: the single block comes out alone and the blocks under it close the gap
  const start = await evaluate("window.bfAt(0)");
  await drag(await left(0), 150, 120);
  const moved = await evaluate(`({ tops: window.bfTops(), first: window.bfAt(0), second: window.bfAt(1),
    firstUnder: !!window.bfEditor.workspace.getBlockById(window.bfIds[0]).getParent(),
    secondUnder: !!window.bfEditor.workspace.getBlockById(window.bfIds[1]).getParent(),
    secondNext: window.bfEditor.workspace.getBlockById(window.bfIds[1]).getNextBlock()?.id === window.bfIds[2], bar: window.bfBar() })`);
  info.singleDrag = { start, moved };
  check(moved.tops === 2 && !moved.firstUnder && !moved.secondUnder && moved.secondNext, "dragging the single block did not take it alone: " + JSON.stringify(moved));
  // it is dropped below the stack that is left, and the column puts it under that stack: its top moved (its left edge is the column's)
  check(moved.first[1] !== start[1], "the single block did not move: " + JSON.stringify(info.singleDrag));
  check(await evaluate("window.bfEditor.picked()") !== null, "the block is not still picked after the drag");
  await shoot("pick_4_single_moved.png");

  // 5. a tap on another block picks that block's stack; a touch on any picked block takes the whole stack
  await tap(...await left(1));
  const rest = await evaluate("window.bfEditor.picked()");
  check(rest?.count === 4 && !rest.single, "a tap on another block did not pick its stack: " + JSON.stringify(rest));
  const stackStart = await evaluate("[window.bfAt(1), window.bfAt(4)]");
  await drag(await left(3), -10, 330);                           // on the fourth block, not the first picked one; far, so that the order changes
  const stackMoved = await evaluate("({ tops: window.bfTops(), first: window.bfAt(1), last: window.bfAt(4) })");
  info.stackDrag = { stackStart, stackMoved };
  check(stackMoved.tops === 2 && stackMoved.first[1] !== stackStart[0][1] && Math.abs(stackMoved.last[1] - stackMoved.first[1] - (stackStart[1][1] - stackStart[0][1])) <= 1,
    "dragging a picked stack did not move the whole stack together: " + JSON.stringify(info.stackDrag));
  await shoot("pick_5_stack_moved.png");

  // 6. Move is for moving: a tap on a value opens no editor (values are edited in Values mode); it is a tap on the block, so it picks that block alone
  const pickedBefore = await evaluate("window.bfEditor.picked()");
  const numberAt = await evaluate("window.bfNumber()");
  await tap(...numberAt);
  info.field = await evaluate("({ editing: !!document.querySelector('.blocklyHtmlInput'), picked: window.bfEditor.picked() })");
  info.field.at = numberAt;
  info.field.under = await evaluate(`(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.tagName + "." + String(e.className?.baseVal ?? e.className).split(" ")[0]); })(${JSON.stringify(numberAt)})`);
  check(!info.field.editing, "a tap on a number opened its editor in Move mode: " + JSON.stringify(info.field));
  check(info.field.picked?.count === 1 && info.field.picked.single, "a tap on a value in Move did not pick that block alone: " + JSON.stringify(info.field.picked));
  await shoot("pick_6_field.png");
  await touch("touchStart", 5, 300); await touch("touchEnd");    // a tap on empty space closes the editor, and puts down
  await sleep(400);
  check((await state()).picked === null, "a tap on empty space did not put down");

  // 7. Delete, then undo: one step brings all of them back; redo does it again
  await tap(...await left(1));
  const counted = await evaluate("window.bfStatements().length");
  await tap(...await evaluate('window.bfButton("Delete")'));
  const deleted = await evaluate("({ count: window.bfStatements().length, picked: window.bfEditor.picked(), canUndo: window.bfEditor.canUndo() })");
  info.deleted = { counted, deleted };
  check(deleted.count === counted - 4 && deleted.picked === null && deleted.canUndo, "Delete did not delete the picked blocks: " + JSON.stringify(info.deleted));
  await shoot("pick_7_deleted.png");
  info.undone = await evaluate("(() => { const had = window.bfEditor.undo(); return new Promise((r) => setTimeout(() => r({ had, count: window.bfStatements().length, canRedo: window.bfEditor.canRedo() }), 300)); })()");
  check(info.undone.had && info.undone.count === counted && info.undone.canRedo, "undo did not bring the deleted blocks back in one step: " + JSON.stringify(info.undone));
  const redone = await evaluate("(() => { window.bfEditor.redo(); return new Promise((r) => setTimeout(() => r(window.bfStatements().length), 300)); })()");
  check(redone === counted - 4, "redo did not delete them again: " + redone);
  await evaluate("window.bfEditor.undo()");
  await sleep(300);

  // 8. Add mode: the row of kinds shows; find a block is its first icon; typing shows the matches; a tap adds one under the marked block
  await evaluate('window.bfEditor.mode("add")');
  await sleep(300);
  await tap(...await left(1));                                   // mark "two" ("one" was moved out in step 4)
  const searchIcon = await evaluate(`(() => { const r = document.querySelector(".blocklyToolboxCategoryContainer").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const name = await evaluate(`document.querySelector(".blocklyToolboxCategoryContainer").getAttribute("aria-label")`);
  check(name === "Find a block", "the first item of the row is not the search: " + name);
  await tap(...searchIcon);
  await sleep(300);
  info.searchOpen = { box: await evaluate("window.bfSearch()"), hint: await evaluate("window.bfFlyoutTypes()"), bar: await evaluate("window.bfBar()") };
  check(info.searchOpen.box?.visible && info.searchOpen.box.focused, "the search box is not shown and focused: " + JSON.stringify(info.searchOpen));
  check(/Tap a block in the list to add it under this one/.test(info.searchOpen.bar ?? ""), "the bar does not say a tap adds: " + info.searchOpen.bar);
  await shoot("pick_8_search_open.png");
  await cdp.send("Input.insertText", { text: "circle" });
  await sleep(400);
  info.searchCircle = await evaluate("window.bfFlyoutTypes()");
  check(info.searchCircle.includes("circle"), "the search for circle found: " + JSON.stringify(info.searchCircle));
  await shoot("pick_9_search_circle.png");
  const target = await evaluate('window.bfFlyoutBlock("bf_circle")');
  const namesBefore = await evaluate("window.bfStatements()");
  await tap(...target);
  const added = await evaluate(`({ names: window.bfStatements(), under: window.bfEditor.workspace.getBlockById(window.bfIds[1]).getNextBlock()?.type, picked: window.bfEditor.picked(),
    flyoutOpen: window.bfEditor.workspace.getFlyout().isVisible(), canUndo: window.bfEditor.canUndo() })`);
  info.added = { namesBefore, added };
  check(added.names.length === namesBefore.length + 1 && added.under === "bf_circle", "a tap did not add the circle under the picked block: " + JSON.stringify(info.added));
  check(added.picked?.single && added.picked.count === 1, "the new block is not marked alone: " + JSON.stringify(added.picked));
  check(added.flyoutOpen, "the flyout closed after an add");
  // the new block is in sight: above the bar and the search box, below the top of the screen
  info.addedInView = await evaluate(`(() => {
    const block = window.bfEditor.workspace.getBlockById(window.bfIds[1]).getNextBlock();
    const r = block.getSvgRoot().querySelector(":scope > .blocklyPath").getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), dockTop: Math.round(document.querySelector(".bf-dock").getBoundingClientRect().top) };
  })()`);
  check(info.addedInView.top >= 0 && info.addedInView.bottom <= info.addedInView.dockTop, "the new block is hidden: " + JSON.stringify(info.addedInView));
  await shoot("pick_10_added.png");
  // a second tap adds another one under the new block
  await tap(...target);
  const twice = await evaluate("window.bfStatements().length");
  check(twice === namesBefore.length + 2, "a second tap did not add a second block: " + twice);
  // each add is one step to undo
  await evaluate("window.bfEditor.undo()"); await sleep(300);
  check(await evaluate("window.bfStatements().length") === namesBefore.length + 1, "one undo did not take back one add");
  await evaluate("window.bfEditor.undo()"); await sleep(300);
  check(await evaluate("window.bfStatements().length") === namesBefore.length, "a second undo did not take back the first add");

  // 9. a value goes into the first empty slot of the picked block: "square" finds "square root of"
  await tap(...await left(4));                                   // the "set v to 0" block (marked)
  check((await evaluate("window.bfSearch()"))?.visible, "picking another block closed the search");
  // the search is still open (a tap on a block does not close it); a tap on its icon would close it
  await evaluate("document.querySelector('.bf-find input').select()");
  await cdp.send("Input.insertText", { text: "square" });
  await sleep(400);
  info.searchSquare = await evaluate("window.bfFlyoutTypes()");
  check(info.searchSquare.includes("sqrt"), "the search for square found: " + JSON.stringify(info.searchSquare));
  await tap(...await evaluate('window.bfFlyoutBlock("bf_sqrt")'));
  const slot = await evaluate(`window.bfEditor.workspace.getBlockById(window.bfIds[4]).getInputTargetBlock("VALUE")?.type`);
  check(slot === "bf_sqrt", "the value did not go into the slot of the picked block: " + slot);
  await shoot("pick_11_value_added.png");
  // the slot is now full: a second value is refused, and the bar says so
  await tap(...await evaluate('window.bfFlyoutBlock("bf_sqrt")'));
  info.refused = await evaluate("({ bar: window.bfBar(), sqrts: window.bfEditor.workspace.getBlocksByType('bf_sqrt', false).length })");
  check(info.refused.sqrts === 1 && /No empty slot/.test(info.refused.bar ?? ""), "a second value was not refused in plain words: " + JSON.stringify(info.refused));
  await shoot("pick_12_refused.png");

  // 10. a search with nothing typed shows a hint; words with no block say so
  await evaluate("document.querySelector('.bf-find input').select()");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await sleep(300);
  info.empty = await evaluate(`({ value: document.querySelector('.bf-find input').value, labels: [...document.querySelectorAll('.blocklyFlyout .blocklyFlyoutLabelText')].map((t) => t.textContent), blocksStillThere: window.bfEditor.workspace.getAllBlocks(false).length > 3 })`);
  check(info.empty.value === "" && info.empty.labels.some((t) => /Type a word/.test(t)), "an empty field does not show the hint: " + JSON.stringify(info.empty));
  check(info.empty.blocksStillThere, "Backspace in the search box deleted a block");
  await shoot("pick_13_empty.png");
  await cdp.send("Input.insertText", { text: "zzzz" });
  await sleep(300);
  info.nothing = await evaluate(`[...document.querySelectorAll('.blocklyFlyout .blocklyFlyoutLabelText')].map((t) => t.textContent)`);
  check(info.nothing.some((t) => /No block has these words/.test(t)), "words with no match do not say so: " + JSON.stringify(info.nothing));

  // 11. Done puts down
  await tap(...await evaluate('window.bfButton("Done")'));
  check((await state()).picked === null, "Done did not put down");
}

/**
 * The wide layout: a mouse drags a block as it always did, and the search is the top of the column. Blockly's zoom buttons and
 * bin are still there and there are no modes. The stacks are in one column here too: dragging the first below the second
 * swaps them, and one Undo takes the drag and the move into place back.
 */
export async function wideChecks({ evaluate, cdp, shoot, report, sleep }) {
  const check = (ok, message) => { if (!ok) report.problems.push("wide: " + message); };
  const info = {};
  report.wide = info;
  await evaluate(`(() => {
    const say = (text) => ({ type: "bf_say", extraState: { items: 1 }, inputs: { ARG0: { block: { type: "bf_text", fields: { TEXT: text } } } } });
    window.bfEditor.load({ blocks: { languageVersion: 0, blocks: [{ ...say("one"), x: 40, y: 40 }, { ...say("two"), x: 40, y: 200 }] } });
    const ids = window.bfEditor.workspace.getTopBlocks(true).map((b) => b.id);
    window.bfWide = (i = 0) => {
      const block = window.bfEditor.workspace.getBlockById(ids[i]);
      const r = block.getSvgRoot().querySelector(":scope > .blocklyPath").getBoundingClientRect();
      const p = block.getRelativeToSurfaceXY();
      return { grab: [r.x + 10, r.y + r.height / 2], at: [Math.round(p.x), Math.round(p.y)] };
    };
  })()`);
  await sleep(700);
  info.controls = await evaluate(`({ zoom: !!document.querySelector(".blocklyZoom"), bin: !!document.querySelector(".blocklyTrash"), mode: window.bfEditor.mode() })`);
  check(info.controls.zoom && info.controls.bin && info.controls.mode === null, "the wide layout lost Blockly's controls or has modes: " + JSON.stringify(info.controls));
  info.column = await evaluate("[window.bfWide(0).at, window.bfWide(1).at]");
  check(info.column[0][0] === info.column[1][0] && info.column[0][1] < info.column[1][1], "the two stacks are not in one column after a load: " + JSON.stringify(info.column));
  info.first = await evaluate(`(() => { const first = document.querySelector(".blocklyToolboxCategoryContainer"); return { name: first.getAttribute("aria-label"), x: Math.round(first.getBoundingClientRect().x) }; })()`);
  check(info.first.name === "Find a block", "the first item of the column is not the search: " + JSON.stringify(info.first));
  const mouse = (type, x, y) => cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  const start = await evaluate("window.bfWide(0)");
  await mouse("mousePressed", ...start.grab);
  for (let step = 1; step <= 10; step += 1) { await mouse("mouseMoved", start.grab[0] + step * 3, start.grab[1] + step * 30); await sleep(25); }
  await mouse("mouseReleased", start.grab[0] + 30, start.grab[1] + 300);
  await sleep(600);
  const end = await evaluate("[window.bfWide(0).at, window.bfWide(1).at]");
  info.drag = { start: info.column, end };
  check(end[0][1] > end[1][1] && end[0][0] === end[1][0], "a mouse drag of the first stack below the second did not swap them, in one column: " + JSON.stringify(info.drag));
  check(await evaluate("window.bfEditor.canUndo()"), "the drag is not a step to undo");
  check(await evaluate("window.bfEditor.picked()") === null, "the wide layout picks blocks");
  // the search: the box lies over the top of the flyout, and a result is a block that can be dragged out
  // Blockly picks a category on pointerdown: a real mouse click on the icon, not element.click()
  const icon = await evaluate(`(() => { const r = document.querySelector(".blocklyToolboxCategoryContainer").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await mouse("mousePressed", ...icon);
  await mouse("mouseReleased", ...icon);
  await sleep(400);
  info.box = await evaluate(`(() => { const box = document.querySelector(".bf-find"); const fly = document.querySelector(".blocklyFlyout").getBoundingClientRect();
    const r = box.getBoundingClientRect(); return { hidden: box.hidden, top: Math.round(r.top), left: Math.round(r.left), flyTop: Math.round(fly.top), flyLeft: Math.round(fly.left), width: Math.round(r.width), flyWidth: Math.round(fly.width) }; })()`);
  check(!info.box.hidden && Math.abs(info.box.top - info.box.flyTop) <= 2 && Math.abs(info.box.left - info.box.flyLeft) <= 2, "the search box is not over the top of the flyout: " + JSON.stringify(info.box));
  await cdp.send("Input.insertText", { text: "circle" });
  await sleep(400);
  info.found = await evaluate("window.bfEditor.workspace.getFlyout().getWorkspace().getTopBlocks(true).map((b) => b.type.replace('bf_', ''))");
  check(info.found.includes("circle"), "the wide search for circle found: " + JSON.stringify(info.found));
  await shoot("wide_search.png");
  // undo and redo are the same in the wide layout
  const undone = await evaluate("(() => { const can = window.bfEditor.canUndo(); window.bfEditor.undo(); return new Promise((r) => setTimeout(() => r({ can, now: [window.bfWide(0).at, window.bfWide(1).at] }), 400)); })()");
  info.undo = undone;
  check(undone.can && undone.now[0][1] < undone.now[1][1], "undo did not take the drag back in the wide layout: " + JSON.stringify(undone));
}
