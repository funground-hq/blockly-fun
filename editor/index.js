// The host API (Architecture section 7).
//
//   import { createBlocksEditor, toPython } from "./editor/index.js";
//   const editor = createBlocksEditor({ element, words: "scratch", pythonLine: true, onChange, convert });
//   editor.toPython();                                      // the program's text
//   await editor.fromPython(source);                        // {ok, raw, tidied} or {ok: false, line, message}
//   editor.settings({ words: "python", pythonLine: false }); // redraws the blocks; the Python stays the same
//   editor.layout("phone");                                  // the kinds of blocks as a row at the bottom (BF-D-049); "wide" is the column
//   toPython(workspaceJson);                                 // the same, with no page (tests, tools)
//
// `convert(source)` is how the editor reaches Python (python_bridge.js: blockly_fun.convert in funground-web's runner);
// without it, fromPython says so.
//
// `catalogue` is funground's catalogue (completions.json, parsed) and `helpBase` the address its relative `url`s are
// read against, or a function url -> address. With a catalogue the two general call blocks get a searchable name list, labelled slots, a tooltip and
// Help (Funground_Calls_Note.md), and a number or colour slot gets a dial, a slider or a grid of colours (editor/editors/);
// without a catalogue the editor is exactly what it was. blockly-fun never fetches it.
//
// `layout` is "wide" (the default: the kinds of blocks are a column of icons on the left) or "phone" (a row along the
// bottom, within reach of a thumb, and bigger touch targets). The host decides from the screen: BF-D-049 says a phone is a
// screen whose narrow side is under 600 CSS px (`isPhoneScreen()` below asks). `editor.layout(next)` changes it on an open
// editor: the program is saved and loaded again, so it is kept; the undo history is not (it belongs to the old workspace).

import * as Blockly from "blockly";
import {
  registerBlocks, registeredSettings, toolbox, watchLines, forgetOrderOnEdit, ownBlocks, ownStaticBlocks, OWN_CATEGORY,
} from "./blocks/register.js";
import { generator } from "./generator/python.js";
import { createCatalogue } from "./catalogue/index.js";
import { TypeTracker } from "./catalogue/types.js";
import { refreshCall } from "./catalogue/call_block.js";
import { EditorTracker } from "./editors/index.js";

export const LAYOUTS = ["wide", "phone"];

/** The screen size rule of BF-D-049: a phone is a screen whose narrow side is under 600 CSS px. */
export function isPhoneScreen(width, height) {
  return Math.min(width, height) < 600;
}

/** The options of Blockly.inject that depend on the layout. */
export function layoutOptions(layout) {
  if (!LAYOUTS.includes(layout)) throw new Error(`layout must be "wide" or "phone", not ${layout}`);
  if (layout === "wide") return {};
  // "end" with a horizontal layout is Blockly's bottom toolbox; its flyout is a row of blocks above it. pinch zooms by touch.
  return { toolboxPosition: "end", horizontalLayout: true, zoom: { controls: true, wheel: true, startScale: 0.9, pinch: true } };
}

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

/**
 * How many lines of `after` are not in `before`, counted as a multiset: the lines switching tidied (BF-D-012).
 * Lines only moved count as unchanged; that is all the note needs.
 */
export function tidiedLines(before, after) {
  const left = new Map();
  for (const line of before.split("\n")) left.set(line, (left.get(line) ?? 0) + 1);
  let changed = 0;
  for (const line of after.split("\n")) {
    const n = left.get(line) ?? 0;
    if (n) left.set(line, n - 1);
    else changed += 1;
  }
  return changed;
}

/**
 * `media` is the folder of Blockly's icons and sounds (node_modules/blockly/media/, or dist/media/ beside the bundle).
 */
export function createBlocksEditor({
  element, words = "scratch", pythonLine = true, onChange = () => {}, convert = null, media, catalogue = null, helpBase = null, layout = "wide",
}) {
  layoutOptions(layout);               // refuses a name that is not a layout, before anything is drawn
  let settings = { words, pythonLine };
  let workspace = null;
  const index = catalogue ? createCatalogue(catalogue, { helpBase }) : null;

  /** Works the types of objects out again, and brings the call blocks' labels up to date (after a load). */
  const refreshCalls = () => {
    if (!index) return;
    workspace.bfTypes.update();
    for (const block of workspace.getAllBlocks(false)) if (block.bfCatalogue) refreshCall(block);
    workspace.bfEditors.update();
  };

  const changed = (event) => {
    if (event.isUiEvent) return;
    onChange(generator.workspaceToCode(workspace));
  };

  function open(json) {
    registerBlocks({ ...settings, catalogue: index });
    element.replaceChildren();
    workspace = Blockly.inject(element, {
      toolbox: toolbox(),
      ...(media ? { media } : {}),
      renderer: "zelos",
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      move: { scrollbars: true, drag: true, wheel: true },
      ...layoutOptions(layout),
    });
    workspace.getInjectionDiv().classList.toggle("bf-phone", layout === "phone");   // the style hangs on this
    workspace.registerToolboxCategoryCallback(OWN_CATEGORY, (ws) => [...ownStaticBlocks(), ...ownBlocks(ws)]);
    // the type rule (section 4): worked out again on change events, at most once per frame
    if (index) workspace.bfTypes = new TypeTracker(workspace, index, () => refreshCalls());
    // the editors of slots (section 6): a dial, a slider, a grid of colours; worked out again on change events too
    if (index) workspace.bfEditors = new EditorTracker(workspace, index);
    if (json) Blockly.serialization.workspaces.load(json, workspace);
    refreshCalls();
    watchLines(workspace);
    forgetOrderOnEdit(workspace);
    workspace.addChangeListener(changed);
    onChange(generator.workspaceToCode(workspace));
  }

  open(null);

  return {
    get workspace() {
      return workspace;
    },
    toPython: () => generator.workspaceToCode(workspace),
    /** Measures the page again: call it after the editor's element is shown or changes size. */
    resize: () => Blockly.svgResize(workspace),
    /** The program as Blockly JSON, to keep. */
    save: () => Blockly.serialization.workspaces.save(workspace),
    /** Replaces the program with this JSON. */
    load(json) {
      Blockly.serialization.workspaces.load(json, workspace);
      refreshCalls();
      onChange(generator.workspaceToCode(workspace));
    },
    /**
     * Replaces the program with the blocks `source` becomes (Architecture section 4, "Switch to blocks"). Text that does
     * not parse leaves the blocks as they are and says which line. `tidied` counts the lines the plain style rewrote.
     */
    async fromPython(source) {
      if (!convert) return { ok: false, line: 0, message: "Python is not available on this page, so text cannot become blocks." };
      const result = await convert(source);
      if (!result.ok) return result;
      Blockly.serialization.workspaces.load(result.workspace, workspace);
      workspace.cleanUp();               // the converter's positions give the order; Blockly stacks them by drawn height
      refreshCalls();
      const text = generator.workspaceToCode(workspace);
      onChange(text);
      return { ok: true, raw: result.raw, tidied: tidiedLines(source, text) };
    },
    /**
     * The layout ("wide" or "phone"); with a name, changes it. The program is saved and loaded into a new workspace, so it
     * stays and the Python does not change. The undo history does not: it goes with the old workspace.
     */
    layout(next) {
      if (next === undefined) return layout;
      layoutOptions(next);
      if (next === layout) return layout;
      const json = Blockly.serialization.workspaces.save(workspace);
      layout = next;
      workspace.dispose();
      open(json);
      return layout;
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
