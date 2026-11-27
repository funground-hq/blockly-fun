// The parts the phone check shares with a page driver (BF-D-053: tools/phone_check.mjs): a page server, a headless Chrome
// driven over the DevTools protocol with a 360 x 720 touch screen, and the helpers to run a script in the page, touch, take a screenshot.
// Environment: BF_PYTHON (python.exe, for tools/serve.py), BF_CHROME (chrome.exe).

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";
const BROWSER = process.env.BF_CHROME || "C:\\Users\\samirj\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function connect(url) {
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
  // a call the browser never answers is a failure, not a wait without end
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => reject(new Error("no answer from the browser to " + method)), 20000);
  });
  return { send, close: () => socket.close() };
}

/**
 * Starts the server and the browser. `root` is the repository, `tag` names the temporary profile, `screenshots` is a folder or null.
 * Gives {cdp, evaluate, shoot, touch, open, load, python, stop}; `stop()` ends only what this started.
 */
export async function launch({ root, tag, port, debugPort, screenshots = null }) {
  const server = spawn(PYTHON, ["-I", join(root, "tools", "serve.py"), "--port", String(port)], { stdio: "ignore" });
  const profile = mkdtempSync(join(tmpdir(), `bf-${tag}-`));
  const browser = spawn(BROWSER, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, "--window-size=1000,800", "about:blank"], { stdio: "ignore" });
  let cdp = null;
  const stop = async () => {
    cdp?.close();
    browser.kill();
    server.kill();
    await sleep(1000);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file: left in the temp folder */ }
  };
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
      await sleep(500);
      try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((t) => t.type === "page"); } catch { /* not up yet */ }
    }
    if (!target) throw new Error("the browser did not start");
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
  } catch (error) {
    await stop();
    throw error;
  }
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
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const open = async (query) => {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 720, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/demo/phone.html${query}` });
    for (let i = 0; i < 80; i += 1) {
      await sleep(250);
      try { if (await evaluate("window.bfReady === true")) return; } catch { /* loading */ }
    }
    throw new Error("the page did not start (is dist/ built? npm run build)");
  };
  const load = async (json) => {
    await evaluate(`window.bfEditor.load(${JSON.stringify(json)})`);
    await sleep(1200);
  };
  const python = () => evaluate("window.bfEditor.toPython()");
  return { cdp, evaluate, shoot, touch, open, load, python, stop };
}
