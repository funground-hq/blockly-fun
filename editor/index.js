// The host API (Architecture section 7), phase A: blocks to Python only.
//
//   import { createBlocksEditor, toPython } from "./editor/index.js";
//   const editor = createBlocksEditor({ element, words: "scratch", pythonLine: true, onChange });
//   editor.toPython();                                      // the program's text
//   editor.settings({ words: "python", pythonLine: false }); // redraws the blocks; the Python stays the same
//   toPython(workspaceJson);                                 // the same, with no page (tests, tools)

import * as Blockly from "blockly";
import { registerBlocks, registeredSettings, toolbox, watchLines } from "./blocks/register.js";
import { generator } from "./generator/python.js";

function ensureRegistered() {
  if (!registeredSettings()) registerBlocks();
}

/** Python for a workspace's JSON (Blockly's serialisation), with no page needed. */
export function toPython(workspaceJson) {
  ensureRegistered();
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(workspaceJson, workspace);
    return generator.workspaceToCode(workspace);
  } finally {
    workspace.dispose();
  }
}

export function createBlocksEditor({ element, words = "scratch", pythonLine = true, onChange = () => {} }) {
  let settings = { words, pythonLine };
  let workspace = null;

  const changed = (event) => {
    if (event.isUiEvent) return;
    onChange(generator.workspaceToCode(workspace));
  };

  function open(json) {
    registerBlocks(settings);
    element.replaceChildren();
    workspace = Blockly.inject(element, {
      toolbox: toolbox(),
      renderer: "zelos",
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      move: { scrollbars: true, drag: true, wheel: true },
    });
    if (json) Blockly.serialization.workspaces.load(json, workspace);
    watchLines(workspace);
    workspace.addChangeListener(changed);
    onChange(generator.workspaceToCode(workspace));
  }

  open(null);

  return {
    get workspace() {
      return workspace;
    },
    toPython: () => generator.workspaceToCode(workspace),
    /** The program as Blockly JSON, to keep. */
    save: () => Blockly.serialization.workspaces.save(workspace),
    /** Replaces the program with this JSON. */
    load(json) {
      Blockly.serialization.workspaces.load(json, workspace);
      onChange(generator.workspaceToCode(workspace));
    },
    /** Changes what blocks show. The program is saved, the blocks are drawn again, the Python does not change. */
    settings(next) {
      if (next === undefined) return { ...settings };
      const json = Blockly.serialization.workspaces.save(workspace);
      settings = { ...settings, ...next };
      workspace.dispose();
      open(json);
      return { ...settings };
    },
  };
}
