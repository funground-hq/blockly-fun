// Blockly's sample fields (editor/editors/plugins.js) are UMD files. Loaded as classic scripts after Blockly (see
// index.html), each puts its names on window, built on the page's Blockly. The editor's `import x from "@blockly/..."`
// reads the default import, which this gives for all five (the import map in index.html points every name here).
const w = globalThis;
export default {
  FieldAngle: w.FieldAngle,
  FieldColour: w.FieldColour,
  FieldGridDropdown: w.FieldGridDropdown,
  FieldMultilineInput: w.FieldMultilineInput,
  FieldSlider: w.FieldSlider,
};
