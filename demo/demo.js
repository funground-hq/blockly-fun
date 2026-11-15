// The editor in a page: blocks on the left, the Python they make on the right, and the two settings as toggles.

import { createBlocksEditor } from "../editor/index.js";
import { toolboxBlock } from "../editor/blocks/register.js";

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

const editor = createBlocksEditor({
  element: document.getElementById("blocks"),
  words: words.value,
  pythonLine: pythonLine.checked,
  onChange: (text) => { python.textContent = text; },
});
editor.load(SAMPLE);

// With Python words there is no Python line, so its switch is off the table
const apply = () => {
  pythonLine.disabled = words.value === "python";
  editor.settings({ words: words.value, pythonLine: pythonLine.checked });
};
words.addEventListener("change", apply);
pythonLine.addEventListener("change", apply);

// for tests and for trying things in the console
window.bfEditor = editor;
document.getElementById("status").textContent = "ready";

// #toolbox-sample and #toolbox-sample-python: a "repeat" and an "if" fresh from the toolbox, with their defaults.
// #selftest: for a headless check (see tools/serve.py). Changes both settings and checks the Python stays the same,
// checks every block of the toolbox has an editable default in every value slot, edits one and watches the Python line
// follow, puts every block on the page, and opens the gear. The result is written into #status.
const hash = location.hash;
const Blockly = window.Blockly;
const status = document.getElementById("status");

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

// #load=<url>: opens a workspace JSON, e.g. one written by `python -m blockly_fun` (Python in the browser is phase C).
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
      Blockly.renderManagement.finishQueuedRenders().then(() => {
        const shown = repeat.getSvgRoot().textContent;
        if (!shown.includes("range(7)")) problems.push("the Python line is not on the screen: " + shown);
        report();
      });
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
