// Phase C, in a real browser: headless Edge (or Chrome) driven over the DevTools protocol, the demo served by
// tools/serve.py with funground-web's runner beside it.
//
//   export PATH=/c/sw/nodejs:$PATH; node tools/browser_check.mjs [--screenshots <folder>]
//
// Checks, and prints as JSON:
//   1. parity: to_blocks in Pyodide gives the same JSON as in CPython, for every contract program, every program
//      outside the subset and every snippet;
//   2. timings: Python ready (cold, fresh profile), each switch (Python -> blocks), a 200-line program;
//   3. the loop: type Python, it becomes blocks; edit a block, the Python follows; text that does not parse is refused
//      with its line; Run prints, and answers input() from the answers box.
// Needs the network once per run (Pyodide from jsDelivr). Environment: BF_PYTHON (the venv's python.exe), BF_BROWSER.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SNIPPETS } from "../tests/snippets.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";
const BROWSER = process.env.BF_BROWSER || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 8766;
const DEBUG_PORT = 9339;
const screenshots = process.argv.includes("--screenshots") ? process.argv[process.argv.indexOf("--screenshots") + 1] : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readPrograms(folder) {
  return readdirSync(join(ROOT, "contract", folder)).filter((f) => f.endsWith(".py")).sort()
    .map((f) => [`${folder}/${f}`, readFileSync(join(ROOT, "contract", folder, f), "utf8").replace(/\r\n/g, "\n")]);
}

function cpythonConvert(sources) {
  const script = `import sys; sys.path.insert(0, ${JSON.stringify(join(ROOT, "python"))}); from blockly_fun.__main__ import main; main()`;
  const result = spawnSync(PYTHON, ["-I", "-c", script], { input: JSON.stringify({ sources }), encoding: "utf8", maxBuffer: 1 << 26 });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

/** A minimal DevTools protocol client: send(method, params) -> result. */
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
  const programs = [...readPrograms("programs"), ...readPrograms("outside"),
    ...SNIPPETS.map((s, i) => [`snippet ${i}`, s])];
  const expected = cpythonConvert(programs.map(([, text]) => text));
  let long = "";
  while (long.split("\n").length - 1 < 200) long += readPrograms("programs").map(([, t]) => t).join("\n");

  const server = spawn(PYTHON, ["-I", join(ROOT, "tools", "serve.py"), "--port", String(PORT)], { stdio: "ignore" });
  const profile = mkdtempSync(join(tmpdir(), "bf-browser-check-"));
  const browser = spawn(BROWSER, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`, "--window-size=1400,900", "about:blank"], { stdio: "ignore" });
  const report = { problems: [] };
  let cdp = null;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i += 1) {
      await sleep(500);
      try {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
        target = list.find((t) => t.type === "page");
      } catch { /* not up yet */ }
    }
    if (!target) throw new Error("the browser did not start");
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });   // focus and blur, as in a window with focus
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

    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/demo/index.html` });
    for (let i = 0; i < 40; i += 1) {
      await sleep(250);
      try { if (await evaluate("!!window.bfDemo")) break; } catch { /* loading */ }
    }
    await evaluate("window.bfDemo.loading");
    const status = await evaluate("document.getElementById('pythonStatus').textContent");
    report.status = status;
    if (!(await evaluate("!!window.bfDemo.runner"))) throw new Error("no Python in the page: " + status);
    report.readyMs = await evaluate("window.bfDemo.timings.ready");
    report.versions = await evaluate("window.bfDemo.runner.info.versions");

    // 1. parity, and 2. the time of each conversion
    const answers = await evaluate(`(async () => {
      const sources = ${JSON.stringify(programs.map(([, t]) => t))};
      const out = [];
      for (const s of sources) {
        const t = performance.now();
        const r = await window.bfDemo.convert(s);
        out.push({ ms: performance.now() - t, json: JSON.stringify(r) });
      }
      return out;
    })()`);
    const mismatched = programs.filter((_, i) => answers[i].json !== JSON.stringify(expected[i])).map(([name]) => name);
    report.parity = { same: programs.length - mismatched.length, of: programs.length, mismatched };
    const times = answers.map((a) => a.ms).sort((a, b) => a - b);
    report.convertMs = { median: Math.round(times[times.length >> 1]), max: Math.round(times[times.length - 1]) };
    report.longProgram = await evaluate(`(async () => {
      const s = ${JSON.stringify(long)};
      const t = performance.now();
      const r = await window.bfDemo.convert(s);
      return { lines: s.split("\\n").length - 1, ms: Math.round(performance.now() - t), ok: r.ok };
    })()`);

    // 3. the loop, through the page as a learner uses it
    const program = 'name = input("Your name? ")\nfor _ in range(2):\n    print(\'Hello,\', name)\n';
    const typed = await evaluate(`(async () => {
      const python = document.getElementById("python");
      python.focus();
      python.value = ${JSON.stringify(program)};
      python.dispatchEvent(new Event("input"));
      const staleShown = document.getElementById("stale").style.display;
      python.blur();
      await new Promise((r) => setTimeout(r, 50));
      for (let i = 0; i < 400 && document.getElementById("stale").style.display !== "none"; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const ws = window.bfEditor.workspace;
      return { staleShown, types: ws.getAllBlocks(true).map((b) => b.type), python: python.value,
               note: document.getElementById("note").textContent };
    })()`);
    report.typed = typed;
    if (typed.staleShown !== "flex") report.problems.push("the blocks were not greyed while the Python was edited");
    if (!typed.types.includes("bf_repeat") || !typed.types.includes("bf_ask")) report.problems.push("typed Python did not become blocks: " + typed.types);
    if (!typed.python.includes('print("Hello,", name)')) report.problems.push("the text was not tidied into the plain style");
    if (!/tidied 1 line/.test(typed.note)) report.problems.push("no note about the tidying: " + typed.note);
    await shoot("c_typed_python_became_blocks.png");

    const edited = await evaluate(`(async () => {
      const repeat = window.bfEditor.workspace.getBlocksByType("bf_repeat")[0];
      repeat.getInputTargetBlock("N").setFieldValue("5", "NUM");
      await new Promise((r) => setTimeout(r, 50));
      return document.getElementById("python").value;
    })()`);
    if (!edited.includes("range(5)")) report.problems.push("editing a block did not change the Python: " + edited);

    const refused = await evaluate(`(async () => {
      const python = document.getElementById("python");
      const before = window.bfEditor.toPython();
      python.focus();
      python.value = "x = 1\\nif x > 0\\n    print(x)\\n";
      python.dispatchEvent(new Event("input"));
      const ok = await window.bfDemo.toBlocks();
      const stale = document.getElementById("stale");
      return { ok, error: stale.classList.contains("error"), text: stale.textContent, blocksKept: window.bfEditor.toPython() === before,
               textKept: python.value };
    })()`);
    report.refused = refused.text;
    if (refused.ok || !refused.error || !/^Line 2 /.test(refused.text) || !refused.blocksKept || !refused.textKept.startsWith("x = 1\nif x > 0"))
      report.problems.push("text that does not parse was not refused cleanly: " + JSON.stringify(refused));
    await shoot("c_line_2_refused.png");

    const ran = await evaluate(`(async () => {
      const python = document.getElementById("python");
      python.value = ${JSON.stringify(program)};
      python.dispatchEvent(new Event("input"));
      document.getElementById("stdin").value = "Ada\\n";
      const t = performance.now();
      await window.bfDemo.run();
      const run = document.getElementById("run");
      while (run.disabled) await new Promise((r) => setTimeout(r, 50));
      return { ms: Math.round(performance.now() - t), output: document.getElementById("output").textContent };
    })()`);
    report.run = ran;
    if (ran.output !== "Your name? \nHello, Ada\nHello, Ada\n") report.problems.push("the run printed " + JSON.stringify(ran.output));
    await shoot("c_run_with_input.png");

    // a switch after a run: the same worker, reused
    report.switches = await evaluate("window.bfDemo.timings.switches");
  } catch (error) {
    report.problems.push(String(error.stack ?? error));
  } finally {
    cdp?.close();
    browser.kill();
    server.kill();
    await sleep(1000);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Edge still holds a file: left in the temp folder */ }
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.problems.length || report.parity?.mismatched.length ? 1 : 0);
}

await main();
