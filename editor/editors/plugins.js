// Blockly's sample fields (BF-D-029), loaded in one place.
//
// The plugins are UMD files. A bundler or Node gives the whole module as the default import; the demo has no bundler,
// so its import map points these names at demo/blockly-plugins.js, which gives what the plugin scripts set on window.
// Either way the names are read from the default import.

import angle from "@blockly/field-angle";
import colour from "@blockly/field-colour";
import gridDropdown from "@blockly/field-grid-dropdown";
import multilineInput from "@blockly/field-multilineinput";
import slider from "@blockly/field-slider";

export const { FieldAngle } = angle;
export const { FieldColour } = colour;
export const { FieldGridDropdown } = gridDropdown;
export const { FieldMultilineInput } = multilineInput;
export const { FieldSlider } = slider;
