// The editor in a page: blocks on the left, their Python on the right, and the two settings as toggles.
//
// Phase C: both ways, and Run. Editing the blocks rewrites the Python at once. Editing the Python greys the blocks, and
// they follow when the learner leaves the text, presses Ctrl+Enter or clicks them (BF-D-006: converted on a switch, not
// while typing). Text that does not parse keeps the old blocks greyed, with the line to look at, and nothing is lost.
// Run gives the Python to funground-web's runner (plain Python, `packages: []`), with the answers box as input() lines.

import { createBlocksEditor } from "../editor/index.js";
import { toolboxBlock } from "../editor/blocks/register.js";
import { fetchConverter, runnerConverter } from "../editor/python_bridge.js";

const SAMPLE = {
  blocks: {
    languageVersion: 0,
    blocks: [{
      type: "bf_set", x: 20, y: 20, fields: { VAR: "name" },
      inputs: { VALUE: { block: { type: "bf_ask", inputs: { Q: { block: { type: "bf_text", fields: { TEXT: "What is your name? " } } } } } } },
      next: {
        block: {
          type: "bf_repeat",
          inputs: {
            N: { block: { type: "bf_number", fields: { NUM: "3" } } },
            DO: {
              block: {
                type: "bf_say", extraState: { items: 2 },
                inputs: {
                  ARG0: { block: { type: "bf_text", fields: { TEXT: "Hello," } } },
                  ARG1: { block: { type: "bf_variable", fields: { VAR: "name" } } },
                },
              },
            },
          },
        },
      },
    }],
  },
};

const python = document.getElementById("python");
const words = document.getElementById("words");
const pythonLine = document.getElementById("pythonLine");
const note = document.getElementById("note");
const stale = document.getElementById("stale");
const staleText = document.getElementById("staleText");
const output = document.getElementById("output");
const runButton = document.getElementById("run");
const stopButton = document.getElementById("stop");
const status = document.getElementById("status");
const pythonStatus = document.getElementById("pythonStatus");

const hash = location.hash;

// The Python pane's text is the program while `edited` is true (typed in, not yet blocks); otherwise the blocks are.
let edited = false;
let convert = null;          // set when the runner is ready
let runner = null;
const timings = { ready: null, switches: [] };   // for the browser check (tools/browser_check.mjs) and the console

const editor = createBlocksEditor({
  element: document.getElementById("blocks"),
  words: words.value,
  pythonLine: pythonLine.checked,
  onChange: (text) => { if (!edited) python.value = text; },
  convert: (source) => {
    if (!convert) return { ok: false, line: 0, message: "Python is still loading, so the text cannot become blocks yet." };
    return convert(source);
  },
});
editor.load(SAMPLE);

function showStale(message, error = false) {
  staleText.textContent = message;
  stale.classList.toggle("error", error);
  stale.style.display = message ? "flex" : "none";
}

python.addEventListener("input", () => {
  if (!edited) note.textContent = "";
  edited = true;
  showStale("The Python changed. The blocks follow when you leave the text, or click here.");
});

/** Python -> blocks, if the text was edited. Resolves true when the blocks are the program again. */
async function toBlocks() {
  if (!edited) return true;
  const source = python.value;
  const started = performance.now();
  const result = await editor.fromPython(source);
  const ms = Math.round(performance.now() - started);
  if (python.value !== source) return false;           // typed again meanwhile: the next switch converts that
  if (!result.ok) {
    showStale(result.message + " The blocks stay as they were until it is.", true);
    return false;
  }
  timings.switches.push({ ms, lines: source.split("\n").length - 1 });
  edited = false;
  python.value = editor.toPython();
  showStale("");
  const notes = [];
  if (result.tidied) notes.push(`Switching tidied ${result.tidied} line${result.tidied === 1 ? "" : "s"} into the plain style.`);
  if (result.raw) notes.push(`${result.raw} part${result.raw === 1 ? " has" : "s have"} no block yet: see the "Python code" blocks.`);
  note.textContent = notes.join(" ");
  return true;
}

python.addEventListener("blur", () => { toBlocks(); });
python.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); toBlocks(); }
  if (event.key === "Tab" && !event.shiftKey) {          // a tab key that indents, as in any code editor
    event.preventDefault();
    python.setRangeText("    ", python.selectionStart, python.selectionEnd, "end");
    python.dispatchEvent(new Event("input"));
  }
});
stale.addEventListener("click", () => { toBlocks(); });

// ---- Run, in funground-web's runner (served at ../runner/ by tools/serve.py)

function print(text, stream) {
  const line = document.createElement("span");
  if (stream === "stderr") line.className = "stderr";
  line.textContent = text + "\n";
  output.append(line);
  output.scrollTop = output.scrollHeight;
}

async function run() {
  if (!runner || runButton.disabled) return;
  if (!(await toBlocks())) return;                     // text that does not parse is not run: the grey note says why
  output.replaceChildren();
  const lines = document.getElementById("stdin").value.split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  runButton.disabled = true;
  stopButton.disabled = false;
  return runner.run(python.value, { filename: "main.py", ...(lines.length ? { stdin: lines } : {}) });
}

runButton.addEventListener("click", run);
stopButton.addEventListener("click", () => runner?.stop());
document.addEventListener("keydown", (event) => {
  if (event.key === "r" && event.ctrlKey) { event.preventDefault(); run(); }
});

const loading = (async () => {
  pythonStatus.textContent = "Python is loading…";
  const started = performance.now();
  try {
    const { createRunner } = await import("../runner/runner.js");
    const [made, files] = await Promise.all([
      createRunner({
        canvas: document.getElementById("canvas"),
        output: print,
        packages: [],                  // plain Python: Pyodide alone
        reuse: true,                   // one worker for every run and every switch (about 0.1 s each, not seconds)
        onFinish: () => { runButton.disabled = false; stopButton.disabled = true; },
      }),
      fetchConverter(new URL("../python/", import.meta.url)),
    ]);
    runner = made;
    convert = runnerConverter(runner, files);
    timings.ready = Math.round(performance.now() - started);
    runButton.disabled = false;
    pythonStatus.textContent = `Python ${runner.info.versions?.python ?? "?"} ready in ${(timings.ready / 1000).toFixed(1)} s`;
  } catch (error) {
    pythonStatus.textContent = "No Python: " + (error.message ?? error) + ". Blocks to Python still works.";
  }
})();

// With Python words there is no Python line, so its switch is off the table
const apply = () => {
  pythonLine.disabled = words.value === "python";
  editor.settings({ words: words.value, pythonLine: pythonLine.checked });
};
words.addEventListener("change", apply);
pythonLine.addEventListener("change", apply);

// for tests and for trying things in the console
window.bfEditor = editor;
window.bfDemo = { toBlocks, run, loading, timings, get runner() { return runner; }, convert: (source) => convert(source) };

// #toolbox-sample and #toolbox-sample-python: a "repeat" and an "if" fresh from the toolbox, with their defaults.
// #selftest: for a headless check (see tools/serve.py). Changes both settings and checks the Python stays the same,
// checks every block of the toolbox has an editable default in every value slot, edits one and watches the Python line
// follow, puts every block on the page, and opens the gear. The result is written into #status.
const Blockly = window.Blockly;

if (hash.startsWith("#toolbox-sample")) {
  if (hash === "#toolbox-sample-python") {
    words.value = "python";
    apply();
  }
  editor.workspace.clear();
  [["repeat", 20, 20], ["if", 20, 150], ["set", 20, 330]].forEach(([id, x, y]) => {
    Blockly.serialization.blocks.append({ ...toolboxBlock(id), x, y }, editor.workspace);
  });
  status.textContent = "toolbox sample";
}

// #load=<url>: opens a workspace JSON, e.g. one written by `python -m blockly_fun`.
if (hash.startsWith("#load=")) {
  const url = decodeURIComponent(hash.slice("#load=".length));
  fetch(url).then((response) => response.json()).then((json) => {
    editor.load(json.workspace ?? json);
    // the converter's positions give the order only; Blockly stacks them by their drawn height, keeping the order
    editor.workspace.cleanUp();
    status.textContent = "loaded " + url;
  }).catch((error) => { status.textContent = "PROBLEMS: " + error.message; });
}

if (hash.startsWith("#selftest")) {
  const problems = [];
  window.addEventListener("error", (e) => problems.push(String(e.message)));
  const before = editor.toPython();
  for (const s of [{ words: "python", pythonLine: false }, { words: "python", pythonLine: true },
    { words: "scratch", pythonLine: false }, { words: "scratch", pythonLine: true }]) {
    editor.settings(s);
    if (editor.toPython() !== before) problems.push(`Python changed under ${JSON.stringify(s)}`);
  }
  const ws = editor.workspace;
  const types = Object.keys(Blockly.Blocks).filter((t) => t.startsWith("bf_") && !t.startsWith("bf_m_"));

  // every value slot of every toolbox block holds a block, a shadow's fields can be edited
  const noDefault = new Set(["bf_call", "bf_call_value", "bf_method", "bf_method_value"]); // their slots come with the gear
  const allDescendants = (b) => [b, ...b.getChildren(false).flatMap(allDescendants)];
  ws.clear();
  types.forEach((type, i) => {
    try {
      const block = Blockly.serialization.blocks.append({
        ...toolboxBlock(type.slice(3)), x: 420 + Math.floor(i / 14) * 330, y: 20 + (i % 14) * 60,
      }, ws);
      for (const b of allDescendants(block)) {
        for (const input of b.inputList) {
          if (input.type !== Blockly.inputs.inputTypes.VALUE) continue;
          const target = input.connection.targetBlock();
          if (!target) problems.push(`${b.type}.${input.name} is empty in the toolbox`);
          else if (target.isShadow()) {
            for (const f of target.inputList.flatMap((x) => x.fieldRow)) {
              if (f.name && !f.EDITABLE) problems.push(`${target.type}.${f.name} cannot be edited`);
            }
          }
        }
      }
    } catch (e) {
      problems.push(`${type}: ${e.message}`);
    }
  });
  void noDefault;

  // editing a shadow changes the block's Python line (Blockly draws a moment later, so look a moment later)
  const lineCheck = () => {
    try {
      Blockly.serialization.blocks.append({ ...toolboxBlock("repeat"), x: 20, y: 200 }, editor.workspace);
      const repeat = editor.workspace.getBlocksByType("bf_repeat")[0];
      const line = repeat.inputList.flatMap((x) => x.fieldRow).find((f) => f.lineText);
      repeat.getInputTargetBlock("N").setFieldValue("7", "NUM");
      if (!line.lineText().includes("range(7)")) problems.push("the Python line did not follow: " + line.lineText());
      // the field's change event (which redraws the line) is fired on a timer, so wait for it before the render
      setTimeout(() => Blockly.renderManagement.finishQueuedRenders().then(() => {
        const shown = repeat.getSvgRoot().textContent;
        if (!shown.includes("range(7)")) problems.push("the Python line is not on the screen: " + shown);
        report();
      }), 50);
    } catch (e) {
      problems.push("line: " + e.message);
    }
  };

  // the gear, on the screen: open it, add an item, compose
  try {
    editor.workspace.clear();
    Blockly.serialization.blocks.append({ ...toolboxBlock("say"), x: 20, y: 20 }, editor.workspace);
    const say = editor.workspace.getBlocksByType("bf_say")[0];
    const root = say.decompose(editor.workspace);
    const extra = editor.workspace.newBlock("bf_m_item");
    extra.initSvg();
    let last = root.getInputTargetBlock("STACK");
    while (last.getNextBlock()) last = last.getNextBlock();
    last.nextConnection.connect(extra.previousConnection);
    say.compose(root);
    root.dispose(false);
    if (say.saveExtraState().items !== 2) problems.push("the gear did not add an item");
    const icon = say.getIcon(Blockly.icons.MutatorIcon.TYPE);
    icon.setBubbleVisible(true).then(() => {
      if (!icon.bubbleIsVisible()) problems.push("the gear bubble did not open");
    });
  } catch (e) {
    problems.push("gear: " + e.message);
  }
  const report = () => {
    status.textContent = problems.length ? "PROBLEMS: " + problems.join("; ") : `selftest ok, ${types.length} blocks`;
  };
  report();
  setTimeout(lineCheck, 300);
}
