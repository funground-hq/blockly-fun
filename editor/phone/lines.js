// Which line of the Python is which block (BF-D-053): for the error line. A run says "line 7"; the block that wrote it
// is marked. No page: Blockly's blocks and the generator.

import * as Blockly from "blockly";
import { generator } from "../generator/python.js";
import { topStacks } from "./variables.js";

/** The first non-blank line of each block's code, in program order, found in the program's lines: the 1-based line of each. */
export function matchLines(lines, firsts) {
  const out = [];
  let cursor = 0;
  for (const first of firsts) {
    let found = -1;
    for (let i = cursor; i < lines.length && first; i += 1) {
      if (lines[i].trim() === first) { found = i; break; }
    }
    if (found >= 0) cursor = found + 1;
    out.push(found + 1);          // 0 when not found
  }
  return out;
}

/** The statements of a stack in program order, the blocks inside a C after the C's own line. */
export function inOrder(first, out = []) {
  for (let b = first; b; b = b.getNextBlock()) {
    out.push(b);
    for (const input of b.inputList) {
      if (input.type === Blockly.inputs.inputTypes.STATEMENT && input.connection?.targetBlock()) inOrder(input.connection.targetBlock(), out);
    }
  }
  return out;
}

/** The block of each line of the program: `[{block, line}]` for every statement whose line could be found. */
export function blockLines(workspace) {
  const text = generator.workspaceToCode(workspace);
  const tops = topStacks(workspace).map((t) => t.block);
  const blocks = tops.flatMap((top) => inOrder(top));
  const firsts = blocks.map((block) => {
    try {
      return (generator.blockToCode(block, true) ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    } catch (error) {
      return "";
    }
  });
  const lines = matchLines(text.split("\n"), firsts);
  return blocks.map((block, i) => ({ block, line: lines[i] })).filter((b) => b.line > 0);
}

/**
 * The block that wrote line `line` of the Python (the last line before it, when that line is no block's first), or null.
 */
export function blockAtLine(workspace, line) {
  const lines = blockLines(workspace);
  const exact = lines.find((l) => l.line === line);
  return (exact ?? [...lines].reverse().find((l) => l.line < line))?.block ?? null;
}
