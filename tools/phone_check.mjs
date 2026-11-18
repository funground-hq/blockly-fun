// BF-15, in a real browser: the phone layout of the editor, driven over the DevTools protocol with a touch screen.
//
//   export PATH=/c/sw/nodejs:$PATH; npm run build; node tools/phone_check.mjs [--screenshots <folder>]
//
// Chrome is emulated as a phone (360 x 720 CSS px, touch, mobile) and opens demo/phone.html, which loads the built
// bundle (dist/). Checks, and prints as JSON:
//   1. the layout follows the screen: "phone" at 360 x 720, "wide" at 1000 x 700, and switching keeps the blocks;
//   2. on the phone the toolbox is a row along the bottom, one icon per kind, each with a name, and fits the screen;
//   3. a tap opens a flyout above the row; the zoom controls and the trashcan are not under the row;
//   4. a touch drag takes a block out of the flyout into the work area;
//   5. the page does not scroll sideways.
// No network is needed. Environment: BF_PYTHON (python.exe, for tools/serve.py), BF_CHROME (chrome.exe).

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";
const BROWSER = process.env.BF_CHROME || "C:\\Users\\samirj\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 8767;
const DEBUG_PORT = 9341;
const screenshots = process.argv.includes("--screenshots") ? process.argv[process.argv.indexOf("--screenshots") + 1] : null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const waiting = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { send, close: () => socket.close() };
}

async function main() {
  const server = spawn(PYTHON, ["-I", join(ROOT, "tools", "serve.py"), "--port", String(PORT)], { stdio: "ignore" });
  const profile = mkdtempSync(join(tmpdir(), "bf-phone-check-"));
  const browser = spawn(BROWSER, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`, "--window-size=1000,800", "about:blank"], { stdio: "ignore" });
  const report = { problems: [] };
  let cdp = null;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
      await sleep(500);
      try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
    }
    if (!target) throw new Error("the browser did not start");
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value;
    };
    const shoot = async (name) => {
      if (!screenshots) return;
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
      mkdirSync(screenshots, { recursive: true });
      writeFileSync(join(screenshots, name), Buffer.from(data, "base64"));
    };
    const open = async (query, width, height, phone) => {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: phone, maxTouchPoints: phone ? 5 : 1 });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/demo/phone.html${query}` });
      for (let i = 0; i < 80; i += 1) {
        await sleep(250);
        try { if (await evaluate("window.bfReady === true")) return; } catch { /* loading */ }
      }
      throw new Error("the page did not start (is dist/ built? npm run build)");
    };
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });   // a touch that ends has no points left
    const tap = async (x, y) => { await touch("touchStart", x, y); await sleep(60); await touch("touchEnd", x, y); await sleep(300); };

    // 1 and 2. the phone: the layout follows the screen, and the toolbox is a row at the bottom
    await open("", 360, 720, true);
    report.layout = await evaluate("window.bfEditor.layout()");
    if (report.layout !== "phone") report.problems.push("a 360 x 720 touch screen did not get the phone layout: " + report.layout);
    const row = await evaluate(`(() => {
      const toolbox = document.querySelector(".blocklyToolbox").getBoundingClientRect();
      const items = [...document.querySelectorAll(".blocklyToolboxCategoryContainer")];
      const rects = items.map((i) => i.getBoundingClientRect());
      return { toolbox: { x: toolbox.x, y: toolbox.y, w: toolbox.width, h: toolbox.height, bottom: toolbox.bottom },
        count: items.length, named: items.filter((i) => i.title && i.getAttribute("aria-label") === i.title && i.querySelector("svg")).length,
        sameRow: new Set(rects.map((r) => Math.round(r.top))).size === 1, itemW: Math.round(rects[0].width), itemH: Math.round(rects[0].height),
        scrollW: document.querySelector(".blocklyToolbox").scrollWidth, innerW: window.innerWidth, innerH: window.innerHeight };
    })()`);
    report.row = row;
    if (row.toolbox.y < row.innerH / 2 || row.toolbox.bottom > row.innerH + 1) report.problems.push("the toolbox is not along the bottom: " + JSON.stringify(row.toolbox));
    if (row.toolbox.w > row.innerW + 1) report.problems.push("the toolbox is wider than the screen");
    if (!row.sameRow) report.problems.push("the categories are not in one row");
    if (!row.count || row.named !== row.count) report.problems.push("a category has no name or no icon: " + JSON.stringify(row));
    if (row.itemW < 44 || row.itemH < 44) report.problems.push("a category is smaller than a finger: " + row.itemW + " x " + row.itemH);
    await shoot("phone_1_row.png");

    // 3. the zoom controls and the trashcan are above the row; a tap opens the flyout above it
    const controls = await evaluate(`(() => {
      const top = document.querySelector(".blocklyToolbox").getBoundingClientRect().top;
      return [".blocklyZoom", ".blocklyTrash"].map((n) => {
        const r = document.querySelector(n)?.getBoundingClientRect();
        return { n, bottom: r && r.bottom, top };
      });
    })()`);
    report.controls = controls;
    for (const c of controls) if (c.bottom === undefined || c.bottom > c.top + 1) report.problems.push(`${c.n} is under the row: ` + JSON.stringify(c));
    const first = await evaluate(`(() => { const r = document.querySelector(".blocklyToolboxCategoryContainer").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await tap(first[0], first[1]);
    const flyout = await evaluate(`(() => {
      const f = window.bfEditor.workspace.getFlyout();
      const r = document.querySelector(".blocklyFlyout").getBoundingClientRect();
      const t = document.querySelector(".blocklyToolbox").getBoundingClientRect();
      return { open: f.isVisible(), horizontal: f.horizontalLayout, top: r.top, bottom: r.bottom, rowTop: t.top };
    })()`);
    report.flyout = flyout;
    if (!flyout.open) report.problems.push("a tap did not open the flyout");
    else if (flyout.bottom > flyout.rowTop + 1) report.problems.push("the flyout is not above the row: " + JSON.stringify(flyout));
    await shoot("phone_2_flyout.png");

    // 4. a touch drag takes a block out of the flyout, up into the work area
    const grab = await evaluate(`(() => {
      const block = window.bfEditor.workspace.getFlyout().getWorkspace().getTopBlocks(true)[0];
      const r = block.getSvgRoot().getBoundingClientRect();
      return { type: block.type, x: r.x + 14, y: r.y + r.height / 2 };
    })()`);
    const before = await evaluate("window.bfEditor.workspace.getTopBlocks(false).length");
    await touch("touchStart", grab.x, grab.y);
    for (let step = 1; step <= 12; step += 1) { await touch("touchMove", grab.x + step * 6, grab.y - step * 25); await sleep(30); }
    await touch("touchEnd");
    await sleep(400);
    const after = await evaluate("window.bfEditor.workspace.getTopBlocks(false).map((b) => b.type)");
    report.drag = { grabbed: grab.type, before, after: after.length };
    if (after.length !== before + 1 || !after.includes(grab.type)) report.problems.push("a touch drag did not put the block in the work area: " + JSON.stringify(report.drag));
    await shoot("phone_3_dragged.png");

    // 5. no sideways scroll
    const scroll = await evaluate("({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, inner: window.innerWidth })");
    report.scroll = scroll;
    if (scroll.doc > scroll.inner || scroll.body > scroll.inner) report.problems.push("the page scrolls sideways: " + JSON.stringify(scroll));

    // 1 again. a switch keeps the program; the wide layout is a column on the left
    const kept = await evaluate(`(() => {
      const editor = window.bfEditor;
      const text = editor.toPython();
      editor.layout("wide");
      const wide = document.querySelector(".blocklyToolbox").getBoundingClientRect();
      const same = editor.toPython() === text && editor.workspace.getAllBlocks(false).length > 0;
      editor.layout("phone");
      return { same, wideIsColumn: wide.x < 5 && wide.height > wide.width, phoneAgain: editor.layout() === "phone",
        blocks: editor.workspace.getAllBlocks(false).length };
    })()`);
    report.switch = kept;
    if (!kept.same || !kept.wideIsColumn || !kept.phoneAgain) report.problems.push("switching the layout lost the program or is not a column: " + JSON.stringify(kept));

    await open("", 1000, 700, false);
    report.desktop = await evaluate("window.bfEditor.layout()");
    if (report.desktop !== "wide") report.problems.push("a 1000 x 700 screen did not get the wide layout: " + report.desktop);
  } catch (error) {
    report.problems.push(String(error.stack ?? error));
  } finally {
    cdp?.close();
    browser.kill();
    server.kill();
    await sleep(1000);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file: left in the temp folder */ }
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.problems.length ? 1 : 0);
}

await main();
