// The editor as one file for a page that hosts it (Play, phase D): Blockly's core and its English messages are inside,
// so the host loads one module and nothing else. Built by `npm run build` (tools/build.mjs) into dist/.
//
//   const bf = await import("./vendor/blockly-fun.js");
//   const editor = bf.createBlocksEditor({ element, onChange, convert: bf.runnerConverter(runner, files) });

import * as Blockly from "blockly";
import * as English from "blockly/msg/en";

Blockly.setLocale(English);

export { createBlocksEditor, toPython, tidiedLines, isPhoneScreen, LAYOUTS } from "./index.js";
export { MODES } from "./modes.js";
export { CONVERTER_FILES, fetchConverter, runnerConverter } from "./python_bridge.js";
export const BLOCKLY_VERSION = Blockly.VERSION;
