// The editor in a page: blocks on the left, the Python they make on the right, and the two settings as toggles.

import { createBlocksEditor } from "../editor/index.js";

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

const apply = () => editor.settings({ words: words.value, pythonLine: pythonLine.checked });
words.addEventListener("change", apply);
pythonLine.addEventListener("change", apply);

// for tests and for trying things in the console
window.bfEditor = editor;
document.getElementById("status").textContent = "ready";

// #selftest: changes both settings, checks the Python stays the same, and puts every block on the page (for a
// headless check; see tools/). The result is written into #status.
if (location.hash.startsWith("#selftest")) {
  const Blockly = window.Blockly;
  const problems = [];
  window.addEventListener("error", (e) => problems.push(String(e.message)));
  const before = editor.toPython();
  for (const s of [{ words: "python", pythonLine: false }, { words: "python", pythonLine: true },
    { words: "scratch", pythonLine: false }, { words: "scratch", pythonLine: true }]) {
    editor.settings(s);
    if (editor.toPython() !== before) problems.push(`Python changed under ${JSON.stringify(s)}`);
  }
  const ws = editor.workspace;
  if (location.hash === "#selftest-python") editor.settings({ words: "python", pythonLine: true });
  const wanted = Object.keys(Blockly.Blocks).filter((t) => t.startsWith("bf_") && !t.startsWith("bf_m_"));
  wanted.forEach((type, i) => {
    try {
      Blockly.serialization.blocks.append({ type, x: 420 + Math.floor(i / 14) * 330, y: 20 + (i % 14) * 60 }, editor.workspace);
    } catch (e) {
      problems.push(`${type}: ${e.message}`);
    }
  });
  // the gear, on the screen: open it, add an item, compose
  try {
    const say = editor.workspace.getBlocksByType("bf_say")[0];
    const root = say.decompose(editor.workspace);
    const extra = editor.workspace.newBlock("bf_m_item");
    extra.initSvg();
    let last = root.getInputTargetBlock("STACK");
    while (last.getNextBlock()) last = last.getNextBlock();
    last.nextConnection.connect(extra.previousConnection);
    say.compose(root);
    root.dispose(false);
    if (say.saveExtraState().items !== 3) problems.push("the gear did not add an item");
    const icon = say.getIcon(Blockly.icons.MutatorIcon.TYPE);
    icon.setBubbleVisible(true).then(() => {
      if (!icon.bubbleIsVisible()) problems.push("the gear bubble did not open");
    });
  } catch (e) {
    problems.push("gear: " + e.message);
  }
  document.getElementById("status").textContent = problems.length ? "PROBLEMS: " + problems.join("; ") : `selftest ok, ${wanted.length} blocks`;
}
