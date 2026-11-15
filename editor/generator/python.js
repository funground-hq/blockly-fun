// Blocks to Python, in the plain style (Architecture section 5). Our own CodeGenerator (BF-D-007): not Blockly's
// Python generator, which writes `global` lines, `x = None` lines and renames names.
//
// The plain style: 4-space indents, double quotes, one space around `=`, comparisons and binary operators,
// `, ` between arguments, `k=v` for keyword arguments, brackets only where Python's precedence needs them.

import * as Blockly from "blockly";
import { typeOf, setLineProvider } from "../blocks/register.js";

/**
 * Python's precedence, tightest first. A value block returns [code, order]; a slot says the weakest order it takes
 * without brackets (its `maxOrder`). Code of a weaker order than that is put in brackets.
 */
export const ORDER = {
  ATOMIC: 0, // literals, names, brackets
  CALL: 1, // x.name, x[i], f(x)
  AWAIT: 2, // await x
  EXPONENT: 3, // **   (right to left)
  UNARY: 4, // -x
  MULTIPLICATIVE: 5, // * / // %
  ADDITIVE: 6, // + -
  SHIFT: 7, // << >>
  BITWISE_AND: 8, // &
  BITWISE_XOR: 9, // ^
  BITWISE_OR: 10, // |
  RELATIONAL: 11, // == != < > <= >= in
  NOT: 12, // not x
  AND: 13,
  OR: 14,
  CONDITIONAL: 15, // x if c else y
  LOWEST: 16, // lambda, and anything we know nothing about
  NONE: 99, // a slot that takes anything (arguments, the right side of =)
};
// Strictly tighter than relational: both sides of a comparison, so a < b < c is never made by two blocks.
const BELOW_RELATIONAL = ORDER.RELATIONAL - 1;

const IMPORT_ORDER = ["math", "random", "time"];
// funground's libraries, imported as `from funground import sound`; the lines are written in this (alphabetical) order
const LIBRARIES = ["camera", "ml", "sangeet", "sound"];

class PythonGenerator extends Blockly.CodeGenerator {
  constructor() {
    super("Python");
    this.INDENT = "    ";
    this.modules = new Set();
    this.headerOnly = false; // true while a block's own lines are made for its Python line: bodies are left out
  }

  init(workspace) {
    super.init(workspace);
    this.modules = new Set();
    this.imported = importedByCode(workspace);
    this.ending = null;
  }

  /** Asks for `import name` at the top of the program. */
  needs(module) {
    this.modules.add(module);
  }

  /** Indents every line that has text; blank lines stay empty. */
  prefixLines(text, prefix) {
    return text.split("\n").map((line) => (line === "" ? line : prefix + line)).join("\n");
  }

  /** The code of the block in a slot, in brackets if its order is weaker than maxOrder. "" if the slot is empty. */
  valueToCode(block, name, maxOrder) {
    const target = block.getInputTargetBlock(name);
    if (!target) return "";
    const result = this.blockToCode(target);
    if (result === "") return "";
    if (!Array.isArray(result)) throw new TypeError(`Block ${target.type} in ${block.type}.${name} makes no value`);
    const [code, order] = result;
    return order > maxOrder ? `(${code})` : code;
  }

  /** Like valueToCode, but a slot left empty gives `None`, never nothing. */
  need(block, name, maxOrder = ORDER.NONE) {
    return this.valueToCode(block, name, maxOrder) || "None";
  }

  /** The indented body of a C-shaped input; `pass` if nothing is in it. */
  body(block, name) {
    if (this.headerOnly) return "";
    return this.statementToCode(block, name) || this.INDENT + "pass\n";
  }

  /** Blank lines and comments around a statement; value blocks are left as they are. */
  scrub_(block, code, thisOnly) {
    if (block.outputConnection) return code;
    const data = block.bfData || { blank: 0, trailing: false };
    const comment = block.getCommentText();
    let out = "\n".repeat(data.blank);
    if (comment && !data.trailing) {
      out += comment.split("\n").map((line) => (line === "" ? "#" : "# " + line)).join("\n") + "\n";
    }
    if (comment && data.trailing) {
      const line = comment.split("\n").join(" ");
      code = code.replace("\n", `  # ${line}\n`);
    }
    out += code;
    const next = block.getNextBlock();
    return next && !thisOnly ? out + this.blockToCode(next) : out;
  }

  /** The whole program: the top blocks in order, top to bottom, then left to right (BF-D-013). */
  workspaceToCode(workspace) {
    this.init(workspace);
    const tops = workspace.getTopBlocks(false)
      .filter((block) => !block.outputConnection)
      .map((block) => ({ block, at: block.getRelativeToSurfaceXY() }))
      .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
    let code = "";
    for (const { block } of tops) {
      const part = this.blockToCode(block);
      if (typeof part === "string") code += part;
    }
    this.ending = sketchEnding(tops.map(({ block }) => block));
    return this.finish(code);
  }

  /**
   * The imports, then the code. After the imports one blank line always, and the first block's blank lines more (two
   * before a def, as PEP 8 has it); with no imports the program starts at its first line.
   */
  finish(code) {
    // the standard library's modules, then funground (a group of its own, as PEP 8 and funground's examples have it)
    const groups = [
      IMPORT_ORDER.filter((m) => this.modules.has(m) && !this.imported?.has(m)).map((m) => `import ${m}\n`).join(""),
      // `import funground as f`, then one `from funground import name` for each library the program calls
      (this.modules.has("funground") && !this.imported?.has("funground") ? "import funground as f\n" : "")
        + LIBRARIES.filter((m) => this.modules.has(m) && !this.imported?.has(m)).map((m) => `from funground import ${m}\n`).join(""),
    ].filter(Boolean);
    let text = groups.length ? groups.join("\n") + "\n" + code : code.replace(/^\n+/, "");
    text = text.replace(/\n+$/, "") + (text.trim() === "" ? "" : "\n");
    // A sketch starts itself (BF-D-022): f.run() after an "every frame" hat, two blank lines below the code;
    // f.show() straight after a drawing with none. Not when the program already does (f.run(fps=30), say).
    if (this.modules.has("funground") && !this.imported?.has("funground") && !this.ending?.written) {
      text += this.ending?.frame ? "\n\nf.run()\n" : "f.show()\n";
    }
    return text;
  }
}

/**
 * The modules a "Python code" block already imports: `import math` kept where it was written (below a docstring, or
 * inside a function). The generator writes an import only for a program that has none; writing it again at the top
 * would change the program (a second import, a docstring that is no longer first).
 */
function importedByCode(workspace) {
  const found = new Set();
  for (const block of workspace.getAllBlocks(false)) {
    if (block.type !== "bf_code") continue;
    for (const line of String(block.getFieldValue("TEXT") ?? "").split("\n")) {
      const match = /^\s*import\s+([\w.,\s]+?)\s*(#.*)?$/.exec(line);   // import math / import os, sys, time
      for (const name of match ? match[1].split(",").map((n) => n.trim()) : []) {
        if (IMPORT_ORDER.includes(name)) found.add(name);
      }
      if (/^\s*import funground as f\s*(#.*)?$/.test(line)) found.add("funground");
    }
    // from funground import ml, sound / sound as s / (ml,\n sound) / *: each library named, whatever it is renamed to
    const text = String(block.getFieldValue("TEXT") ?? "");
    for (const match of text.matchAll(/^[ \t]*from[ \t]+funground[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gm)) {
      for (const part of match[1].replace(/#[^\n]*/g, "").replace(/[()]/g, "").split(",")) {
        const name = part.trim().split(/\s+/)[0];
        if (LIBRARIES.includes(name)) found.add(name);
        if (name === "*") LIBRARIES.forEach((library) => found.add(library));
      }
    }
  }
  return found;
}

/**
 * How a sketch ends: `frame` when an "every frame" hat is there (f.run()); `written` when a top-level statement
 * already calls f.run(...) or f.show(...) (a general call block, or Python code), so the generator adds none.
 */
function sketchEnding(tops) {
  let frame = false;
  let written = false;
  for (const top of tops) {
    if (top.type === typeOf("sketch_frame")) frame = true;
    for (let block = top; block; block = block.getNextBlock()) {
      if (block.type === typeOf("method")) {
        const object = block.getInputTargetBlock("OBJ");
        if (object?.type === typeOf("variable") && object.getFieldValue("VAR") === "f"
            && ["run", "show"].includes(block.getFieldValue("NAME"))) written = true;
      }
      if (block.type === typeOf("code") && /^f\.(run|show)\(/m.test(block.getFieldValue("TEXT"))) written = true;
    }
  }
  return { frame, written };
}

export function quote(text) {
  let out = "\"";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "\"") out += "\\\"";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f) out += "\\x" + code.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + "\"";
}

const SIMPLE_ATOM = /^(?:[A-Za-z_][\w.]*|[rRbBfFuU]{0,2}"(?:[^"\\\n]|\\.)*"|[rRbBfFuU]{0,2}'(?:[^'\\\n]|\\.)*')$/;

export const generator = new PythonGenerator();
const g = generator;
const F = g.forBlock;
const define = (id, fn) => { F[typeOf(id)] = fn; };

/** A statement from one line of code. */
const line = (code) => code + "\n";

// Values -------------------------------------------------------------------------------------------------------
define("text", (b) => [quote(b.getFieldValue("TEXT")), ORDER.ATOMIC]);
define("number", (b) => {
  const num = b.getFieldValue("NUM");
  return [num, num.startsWith("-") ? ORDER.UNARY : ORDER.ATOMIC];
});
define("boolean", (b) => [b.getFieldValue("VALUE"), ORDER.ATOMIC]);
define("variable", (b) => [b.getFieldValue("VAR"), ORDER.ATOMIC]);
define("empty_list", () => ["[]", ORDER.ATOMIC]);

// Saying and asking --------------------------------------------------------------------------------------------
const items = (b, state = b.bfState) => Array.from({ length: state.items }, (_, i) => g.need(b, "ARG" + i));
define("say", (b) => line(`print(${items(b).join(", ")})`));
define("list_of", (b) => [`[${items(b).join(", ")}]`, ORDER.ATOMIC]);
define("ask", (b) => [`input(${g.valueToCode(b, "Q", ORDER.NONE)})`, ORDER.CALL]);
const call1 = (id, fn) => define(id, (b) => [`${fn}(${g.need(b, "X")})`, ORDER.CALL]);
call1("to_int", "int");
call1("to_float", "float");
call1("to_str", "str");
call1("round", "round");
call1("abs", "abs");
call1("length", "len");
define("sqrt", (b) => { g.needs("math"); return [`math.sqrt(${g.need(b, "X")})`, ORDER.CALL]; });
define("randint", (b) => {
  g.needs("random");
  return [`random.randint(${g.need(b, "A")}, ${g.need(b, "B")})`, ORDER.CALL];
});

// Variables ----------------------------------------------------------------------------------------------------
define("set", (b) => line(`${b.getFieldValue("VAR")} = ${g.need(b, "VALUE")}`));
define("change", (b) => line(`${b.getFieldValue("VAR")} += ${g.need(b, "VALUE")}`));
define("subtract", (b) => line(`${b.getFieldValue("VAR")} -= ${g.need(b, "VALUE")}`));

// Operators ----------------------------------------------------------------------------------------------------
// leftMax / rightMax: the weakest order each side takes without brackets. Left to right operators take their own
// order on the left and a tighter one on the right, so a - (b - c) keeps its brackets and (a - b) - c loses them.
function binary(operator, order, leftMax, rightMax) {
  return (b) => [`${g.need(b, "A", leftMax)} ${operator} ${g.need(b, "B", rightMax)}`, order];
}
define("arith", (b) => {
  const op = b.getFieldValue("OP");
  const order = op === "+" || op === "-" ? ORDER.ADDITIVE : ORDER.MULTIPLICATIVE;
  return binary(op, order, order, order - 1)(b);
});
define("floordiv", binary("//", ORDER.MULTIPLICATIVE, ORDER.MULTIPLICATIVE, ORDER.MULTIPLICATIVE - 1));
define("mod", binary("%", ORDER.MULTIPLICATIVE, ORDER.MULTIPLICATIVE, ORDER.MULTIPLICATIVE - 1));
// ** goes right to left, and binds less tightly than a name or a call on its left, more tightly than - on its right
define("power", binary("**", ORDER.EXPONENT, ORDER.CALL, ORDER.UNARY));
define("negate", (b) => [`-${g.need(b, "X", ORDER.UNARY)}`, ORDER.UNARY]);
define("compare", (b) => [
  `${g.need(b, "A", BELOW_RELATIONAL)} ${b.getFieldValue("OP")} ${g.need(b, "B", BELOW_RELATIONAL)}`, ORDER.RELATIONAL,
]);
define("contains", (b) => [`${g.need(b, "X", BELOW_RELATIONAL)} in ${g.need(b, "LIST", BELOW_RELATIONAL)}`, ORDER.RELATIONAL]);
define("logic", (b) => {
  const op = b.getFieldValue("OP");
  const order = op === "and" ? ORDER.AND : ORDER.OR;
  return binary(op, order, order, order - 1)(b);
});
define("not", (b) => [`not ${g.need(b, "X", ORDER.NOT)}`, ORDER.NOT]);
define("item_at", (b) => [`${g.need(b, "LIST", ORDER.CALL)}[${g.need(b, "N")}]`, ORDER.CALL]);

// Control ------------------------------------------------------------------------------------------------------
define("repeat", (b) => `for _ in range(${g.need(b, "N")}):\n${g.body(b, "DO")}`);
define("count", (b) => {
  const start = g.valueToCode(b, "A", ORDER.NONE);
  const range = start ? `${start}, ${g.need(b, "B")}` : g.need(b, "B");
  return `for ${b.getFieldValue("VAR")} in range(${range}):\n${g.body(b, "DO")}`;
});
define("count_by", (b) => {
  const start = g.valueToCode(b, "A", ORDER.NONE) || "0";
  return `for ${b.getFieldValue("VAR")} in range(${start}, ${g.need(b, "B")}, ${g.need(b, "S")}):\n${g.body(b, "DO")}`;
});
define("for_each", (b) => `for ${b.getFieldValue("VAR")} in ${g.need(b, "LIST")}:\n${g.body(b, "DO")}`);
define("forever", (b) => `while True:\n${g.body(b, "DO")}`);
define("while", (b) => `while ${g.need(b, "COND")}:\n${g.body(b, "DO")}`);
define("until", (b) => `while not ${g.need(b, "COND", ORDER.NOT)}:\n${g.body(b, "DO")}`);
define("if", (b) => {
  let code = "";
  for (let i = 0; i <= b.bfState.elifs; i++) {
    code += `${i === 0 ? "if" : "elif"} ${g.need(b, "IF" + i)}:\n${g.body(b, "DO" + i)}`;
  }
  if (b.bfState.else) code += `else:\n${g.body(b, "ELSE")}`;
  return code;
});
define("break", () => line("break"));
define("continue", () => line("continue"));
define("wait", (b) => { g.needs("time"); return line(`time.sleep(${g.need(b, "N")})`); });

// Lists --------------------------------------------------------------------------------------------------------
define("add_to", (b) => line(`${g.need(b, "LIST", ORDER.CALL)}.append(${g.need(b, "X")})`));
define("set_item", (b) => line(`${g.need(b, "LIST", ORDER.CALL)}[${g.need(b, "N")}] = ${g.need(b, "X")}`));
define("remove_item", (b) => line(`${g.need(b, "LIST", ORDER.CALL)}.pop(${g.need(b, "N")})`));

// Your own blocks ----------------------------------------------------------------------------------------------
define("def", (b) => `def ${b.getFieldValue("NAME")}(${b.getFieldValue("PARAMS")}):\n${g.body(b, "DO")}`);
define("return", (b) => {
  const value = g.valueToCode(b, "VALUE", ORDER.NONE);
  return line(value ? `return ${value}` : "return");
});

// Drawing (phase C+, BF-D-022) ---------------------------------------------------------------------------------
const VARIABLE_FIELD_BLOCKS = ["set", "change", "subtract", "variable", "count", "count_by", "for_each"].map(typeOf);
const ASSIGNING = ["set", "change", "subtract"].map(typeOf);
// The names a "Python code" text uses: comments and strings left out, and a name after a dot is an attribute.
// The converter reads them the same way (to_blocks.py _CODE_NOISE, _CODE_NAME), so the global line round-trips.
const CODE_NOISE = /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|#[^\n]*/g;
const CODE_NAME = /(?<![.\w])[A-Za-z_]\w*/g;

/** A block and every block in it, in order: the block, its slots' blocks, then the block after it. */
function* walk(block) {
  yield block;
  for (const input of block.inputList) {
    const inner = input.connection?.targetBlock();
    if (inner) yield* walk(inner);
  }
  const after = block.getNextBlock();
  if (after) yield* walk(after);
}

/**
 * The `global` names of a hat: those it sets (set, change, subtract) that the program also uses outside it, at the
 * top or in the other hat, in the order the hat first sets them. Without the line Python would make each a new
 * name inside the function, and draw() would never see what setup() set, nor keep a change from frame to frame.
 */
export function sharedNames(hat) {
  const set = [];
  for (const block of walk(hat)) {
    if (ASSIGNING.includes(block.type) && !set.includes(block.getFieldValue("VAR"))) set.push(block.getFieldValue("VAR"));
  }
  if (!set.length) return [];
  const outside = new Set();
  for (const top of hat.workspace.getTopBlocks(false)) {
    if (top === hat || top.outputConnection) continue;
    for (const block of walk(top)) {
      if (VARIABLE_FIELD_BLOCKS.includes(block.type)) outside.add(block.getFieldValue("VAR"));
      if (block.type === typeOf("code") || block.type === typeOf("code_value")) {
        const text = String(block.getFieldValue("TEXT")).replace(CODE_NOISE, " ");
        for (const word of text.match(CODE_NAME) ?? []) outside.add(word);
      }
    }
  }
  return set.filter((name) => outside.has(name));
}

const hat = (header) => (b) => {
  g.needs("funground");
  if (g.headerOnly) return `${header}:\n`;
  const shared = sharedNames(b);
  const global = shared.length ? `${g.INDENT}global ${shared.join(", ")}\n` : "";
  return `${header}:\n${global}${g.body(b, "DO")}`;
};
define("sketch_start", hat("def setup()"));
define("sketch_frame", hat("def draw()"));

const drawing = (id, name, slots) => define(id, (b) => {
  g.needs("funground");
  return line(`f.${name}(${slots.map((slot) => g.need(b, slot)).join(", ")})`);
});
drawing("canvas_size", "size", ["W", "H"]);
drawing("background", "background", ["COLOR"]);
drawing("fill", "fill", ["COLOR"]);
drawing("outline", "stroke", ["COLOR"]);
drawing("circle", "circle", ["X", "Y", "D"]);
drawing("rectangle", "rect", ["X", "Y", "W", "H"]);
drawing("line", "line", ["X1", "Y1", "X2", "Y2"]);
drawing("write", "text", ["TEXT", "X", "Y"]);
define("sketch_value", (b) => { g.needs("funground"); return [`f.${b.getFieldValue("WHAT")}`, ORDER.CALL]; });

// Calling anything else ----------------------------------------------------------------------------------------
const MODULES = new Set([...IMPORT_ORDER, ...LIBRARIES]);
function argumentList(b) {
  return b.bfState.args.map((kind, i) => {
    const value = g.need(b, "ARG" + i);
    return kind === "k" ? `${b.getFieldValue("KW" + i)}=${value}` : value;
  }).join(", ");
}
const callCode = (b) => `${b.getFieldValue("NAME")}(${argumentList(b)})`;
const methodCode = (b) => {
  const object = b.getInputTargetBlock("OBJ");
  if (object && object.type === typeOf("variable") && MODULES.has(object.getFieldValue("VAR"))) {
    g.needs(object.getFieldValue("VAR"));
  }  return `${g.need(b, "OBJ", ORDER.CALL)}.${callCode(b)}`;
};
// a call of a block the learner made: a count of positional arguments, a name that is only a label
const ownCode = (b) => {
  const values = Array.from({ length: b.bfState.args }, (_, i) => g.need(b, "ARG" + i));
  return `${b.getFieldValue("NAME")}(${values.join(", ")})`;
};
define("own_call", (b) => line(ownCode(b)));
define("own_call_value", (b) => [ownCode(b), ORDER.CALL]);
define("call", (b) => line(callCode(b)));
define("call_value", (b) => [callCode(b), ORDER.CALL]);
define("method", (b) => line(methodCode(b)));
define("method_value", (b) => [methodCode(b), ORDER.CALL]);

// Python code --------------------------------------------------------------------------------------------------
define("code", (b) => {
  const text = b.getFieldValue("TEXT");
  return text.endsWith("\n") ? text : line(text);
});
// The converter knows the precedence of the Python it holds and says so (extraState.order); a block made in the
// editor has none, and its text is judged by its look.
define("code_value", (b) => {
  const text = b.getFieldValue("TEXT");
  if (b.bfOrder) return [text, ORDER[b.bfOrder] ?? ORDER.LOWEST];
  return [text, SIMPLE_ATOM.test(text) ? ORDER.ATOMIC : ORDER.LOWEST];
});

// The Python line under a block (register.js): the block's own lines, the ones that start in column 0, with its
// real values. For an if block, line 0 is the "if", line 1 an "elif" and so on.
export function headerLines(block) {
  const make = F[block.type];
  if (!make) return [];
  g.headerOnly = true;
  try {
    const code = make(block, g);
    return typeof code === "string" ? code.split("\n").filter((l) => /^\S/.test(l)) : [];
  } finally {
    g.headerOnly = false;
  }
}

setLineProvider((block, index) => headerLines(block)[index] ?? null);
