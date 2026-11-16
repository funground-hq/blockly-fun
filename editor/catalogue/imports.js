// The names a sketch imports, read from its Python code blocks (BF-D-040).
//
// An import is a line of Python the converter keeps as a "Python code" block, so the code blocks are the source (the
// generator reads them the same way, importedByCode in generator/python.js). `from funground import circle, fill` and
// `from random import randint as pick` give bare names: [{module: "funground", name: "circle", alias: "circle"}, ...].
// `import math` gives a module, which is used with a dot, so it is not a bare name and is not listed here.

import { PREFIX } from "../blocks/table.js";

const CODE = PREFIX + "code";
const FROM = /^[ \t]*from[ \t]+([\w.]+)[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gm;

/** The names imported by `from X import ...` lines in a text. */
export function importsInText(text) {
  const found = [];
  for (const match of String(text).matchAll(FROM)) {
    const module = match[1];
    if (module.startsWith(".")) continue;
    const list = match[2].replace(/#[^\n]*/g, "").replace(/[()\\]/g, " ");
    for (const part of list.split(",")) {
      const words = part.trim().split(/\s+/);
      const name = words[0];
      if (!name) continue;
      found.push({ module, name, alias: words[1] === "as" && words[2] ? words[2] : name });
    }
  }
  return found;
}

/** Every name the workspace's code blocks import, in the order the blocks are on the page. */
export function importsInWorkspace(workspace) {
  const found = [];
  for (const block of workspace?.getAllBlocks?.(true) ?? []) {
    if (block.type === CODE) found.push(...importsInText(block.getFieldValue("TEXT") ?? ""));
  }
  return found;
}
