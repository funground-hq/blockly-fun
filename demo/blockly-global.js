// Blockly 13.4.0 ships its browser build as a classic script (blockly_compressed.js, which sets window.Blockly)
// and its ES module only for bundlers and Node. The page loads the classic script; this module gives the editor's
// `import * as Blockly from "blockly"` the names it uses (see the import map in index.html).
const Blockly = globalThis.Blockly;
export const {
  Blocks, CodeGenerator, dialog, Events, FieldDropdown, FieldLabel, FieldLabelSerializable,
  FieldTextInput, Workspace, icons, inject, serialization,
} = Blockly;
