// The one table that describes every block (Blocks_And_Words_Note.md).
//
// Per block:
//   type      the id, without the "bf_" prefix that register.js adds
//   kind      "statement" or "value"; top: true = a stack of its own (a def); hat: true = drawn with a rounded top
//   cat       the category (CATEGORIES)
//   scratch   the label in Scratch's words
//   python    the label in Python's words
//   line      the Python line shown under the label (a string, or {if, elseif, else})
//   fields    the named fields: name (a typed Python name), var (a name chosen from the program's), text, number,
//             code, params, dropdown, label (a name shown, not edited)
//   body      the names of the statement inputs (the C-shaped part)
//   mutator   "items" | "args" | "if": the gear
//   own       true = a call of a block the learner made: the name as a label, a count of slots, no gear
//   order     true = the block carries the precedence of the Python it holds (extraState.order)
//   catalogue a label used instead of scratch when funground's catalogue is given (Funground_Calls_Note.md, section 7);
//             a field with catalogue: true gets the searchable name list (FieldCatalogueName)
//
// Label tokens: {NAME} is a value input, [NAME] is a field. In a line, [NAME] is replaced by the field's value
// and the letters A, B, N, S, x, L stand for the slots.
// A gear block has a label of {head, first, sep, tail}: the head, then the items (the text "first" before the first
// one, "sep" before every other), then the tail.

/** The prefix of every block type the editor registers ("bf_" + the type of the table). */
export const PREFIX = "bf_";

export const CATEGORIES = [
  { id: "saying", name: "Saying and asking", colour: 290 },
  { id: "values", name: "Values", colour: 160 },
  { id: "variables", name: "Variables", colour: 330 },
  { id: "maths", name: "Numbers and maths", colour: 120 },
  { id: "logic", name: "Comparing and logic", colour: 210 },
  { id: "control", name: "Control", colour: 40 },
  { id: "lists", name: "Lists and text", colour: 15 },
  { id: "functions", name: "Your own blocks", colour: 260 },
  { id: "drawing", name: "Drawing", colour: 60 },
  { id: "calls", name: "Calling anything else", colour: 185 },
  { id: "code", name: "Python code", colour: "#6e6e6e" },
];

const opt = (value, scratch, python = scratch) => ({ value, scratch, python });

const NAME = (def) => ({ kind: "name", default: def });
// a variable or loop variable: a dropdown of the names used in the program (FieldName in register.js)
const VARNAME = (def) => ({ kind: "var", default: def });

// The name of a general call is looked up in funground's catalogue when one is given (section 5)
const CALL_NAME = { ...NAME("name"), catalogue: true };

const CALL_FN = {
  cat: "calls",
  mutator: "args",
  fields: { NAME: CALL_NAME },
  scratch: { head: "call [NAME]", first: "with", sep: ",", tail: "" },
  python: { head: "[NAME](", first: "", sep: ",", tail: ")" },
  line: "name(a, b, k=v)",
};

const CALL_METHOD = {
  cat: "calls",
  mutator: "args",
  fields: { NAME: CALL_NAME },
  scratch: { head: "call [NAME] on {OBJ}", first: "with", sep: ",", tail: "" },
  // with the catalogue: "f . text align" (section 7)
  catalogue: { scratch: { head: "{OBJ} . [NAME]", first: "with", sep: ",", tail: "" } },
  python: { head: "{OBJ}.[NAME](", first: "", sep: ",", tail: ")" },
  line: "x.name(a, b, k=v)",
};

// The call of a block made with "make a block". The name is a label, so renaming a def does not rename its
// calls (a known limit). The toolbox offers one of these for each def in the workspace (ownBlocks in register.js).
const OWN_CALL = {
  cat: "functions",
  own: true,
  fields: { NAME: { kind: "label", default: "name" } },
  scratch: { head: "[NAME]", first: "", sep: "", tail: "" },
  python: { head: "[NAME](", first: "", sep: ",", tail: ")" },
  line: "[NAME](a, b)",
};

const CODE = {
  cat: "code",
  fields: { TEXT: { kind: "code", default: "pass" } },
  scratch: "Python code: [TEXT]",
  python: "Python code: [TEXT]",
};

export const BLOCKS = [
  // Saying and asking
  {
    type: "say", kind: "statement", cat: "saying", mutator: "items",
    scratch: { head: "say", first: "", sep: "and", tail: "" },
    python: { head: "print(", first: "", sep: ",", tail: ")" },
    line: "print(x, y)",
  },
  { type: "ask", kind: "value", cat: "saying", scratch: "ask {Q}", python: "input({Q})", line: "input(S)" },
  { type: "to_int", kind: "value", cat: "saying", scratch: "number from {X}", python: "int({X})", line: "int(x)" },
  { type: "to_float", kind: "value", cat: "saying", scratch: "decimal number from {X}", python: "float({X})", line: "float(x)" },
  { type: "to_str", kind: "value", cat: "saying", scratch: "text from {X}", python: "str({X})", line: "str(x)" },

  // Values
  {
    type: "text", kind: "value", cat: "values", fields: { TEXT: { kind: "text", default: "" } },
    scratch: "\"[TEXT]\"", python: "\"[TEXT]\"", line: null,
  },
  {
    type: "number", kind: "value", cat: "values", fields: { NUM: { kind: "number", default: "0" } },
    scratch: "[NUM]", python: "[NUM]", line: null,
  },
  {
    type: "boolean", kind: "value", cat: "values",
    fields: { VALUE: { kind: "dropdown", default: "True", options: [opt("True", "true", "True"), opt("False", "false", "False")] } },
    scratch: "[VALUE]", python: "[VALUE]", line: null,
  },

  // Variables
  {
    type: "variable", kind: "value", cat: "variables", fields: { VAR: VARNAME("v") },
    scratch: "[VAR]", python: "[VAR]", line: null,
  },
  {
    type: "set", kind: "statement", cat: "variables", fields: { VAR: VARNAME("v") },
    scratch: "set [VAR] to {VALUE}", python: "[VAR] = {VALUE}", line: "[VAR] = x",
  },
  {
    type: "change", kind: "statement", cat: "variables", fields: { VAR: VARNAME("v") },
    scratch: "change [VAR] by {VALUE}", python: "[VAR] += {VALUE}", line: "[VAR] += x",
  },
  {
    type: "subtract", kind: "statement", cat: "variables", fields: { VAR: VARNAME("v") },
    scratch: "subtract {VALUE} from [VAR]", python: "[VAR] -= {VALUE}", line: "[VAR] -= x",
  },

  // Numbers and maths
  {
    type: "arith", kind: "value", cat: "maths",
    fields: {
      OP: {
        kind: "dropdown", default: "+",
        options: [opt("+", "+"), opt("-", "−", "-"), opt("*", "×", "*"), opt("/", "÷", "/")],
      },
    },
    scratch: "{A} [OP] {B}", python: "{A} [OP] {B}", line: "A [OP] B",
  },
  { type: "floordiv", kind: "value", cat: "maths", scratch: "{A} ÷ {B}, whole part", python: "{A} // {B}", line: "A // B" },
  { type: "mod", kind: "value", cat: "maths", scratch: "remainder of {A} ÷ {B}", python: "{A} % {B}", line: "A % B" },
  { type: "power", kind: "value", cat: "maths", scratch: "{A} to the power {B}", python: "{A} ** {B}", line: "A ** B" },
  { type: "negate", kind: "value", cat: "maths", scratch: "minus {X}", python: "-{X}", line: "-x" },
  { type: "randint", kind: "value", cat: "maths", scratch: "pick random {A} to {B}", python: "random.randint({A}, {B})", line: "random.randint(A, B)" },
  { type: "round", kind: "value", cat: "maths", scratch: "round {X}", python: "round({X})", line: "round(x)" },
  { type: "sqrt", kind: "value", cat: "maths", scratch: "square root of {X}", python: "math.sqrt({X})", line: "math.sqrt(x)" },
  { type: "abs", kind: "value", cat: "maths", scratch: "distance from 0 of {X}", python: "abs({X})", line: "abs(x)" },

  // Comparing and logic
  {
    type: "compare", kind: "value", cat: "logic",
    fields: {
      OP: {
        kind: "dropdown", default: "==",
        options: [opt("==", "=", "=="), opt("!=", "≠", "!="), opt("<", "<"), opt(">", ">"), opt("<=", "≤", "<="), opt(">=", "≥", ">=")],
      },
    },
    scratch: "{A} [OP] {B}", python: "{A} [OP] {B}", line: "A [OP] B",
  },
  {
    type: "logic", kind: "value", cat: "logic",
    fields: { OP: { kind: "dropdown", default: "and", options: [opt("and", "and"), opt("or", "or")] } },
    scratch: "{A} [OP] {B}", python: "{A} [OP] {B}", line: "A [OP] B",
  },
  { type: "not", kind: "value", cat: "logic", scratch: "not {X}", python: "not {X}", line: "not x" },

  // Control
  {
    type: "repeat", kind: "statement", cat: "control", body: ["DO"],
    scratch: "repeat {N} times", python: "for _ in range({N})", line: "for _ in range(N):",
  },
  {
    type: "count", kind: "statement", cat: "control", body: ["DO"], fields: { VAR: VARNAME("i") },
    scratch: "count [VAR] from {A}, up to but not {B}", python: "for [VAR] in range({A}, {B})",
    line: "for [VAR] in range(A, B):",
  },
  {
    type: "count_by", kind: "statement", cat: "control", body: ["DO"], fields: { VAR: VARNAME("i") },
    scratch: "count [VAR] from {A}, up to but not {B}, by {S}", python: "for [VAR] in range({A}, {B}, {S})",
    line: "for [VAR] in range(A, B, S):",
  },
  {
    type: "for_each", kind: "statement", cat: "control", body: ["DO"], fields: { VAR: VARNAME("item") },
    scratch: "for each [VAR] in {LIST}", python: "for [VAR] in {LIST}", line: "for [VAR] in L:",
  },
  { type: "forever", kind: "statement", cat: "control", body: ["DO"], scratch: "forever", python: "while True", line: "while True:" },
  { type: "while", kind: "statement", cat: "control", body: ["DO"], scratch: "repeat while {COND}", python: "while {COND}", line: "while x:" },
  { type: "until", kind: "statement", cat: "control", body: ["DO"], scratch: "repeat until {COND}", python: "while not {COND}", line: "while not x:" },
  {
    type: "if", kind: "statement", cat: "control", mutator: "if",
    scratch: { if: "if {IF} then", elseif: "else if {IF} then", else: "else" },
    python: { if: "if {IF}", elseif: "elif {IF}", else: "else" },
    line: { if: "if x:", elseif: "elif y:", else: "else:" },
  },
  { type: "break", kind: "statement", cat: "control", scratch: "stop this loop", python: "break", line: "break" },
  { type: "continue", kind: "statement", cat: "control", scratch: "skip to the next turn", python: "continue", line: "continue" },
  { type: "wait", kind: "statement", cat: "control", scratch: "wait {N} seconds", python: "time.sleep({N})", line: "time.sleep(N)" },

  // Lists and text
  { type: "empty_list", kind: "value", cat: "lists", scratch: "empty list", python: "[]", line: "[]" },
  {
    type: "list_of", kind: "value", cat: "lists", mutator: "items",
    scratch: { head: "list of", first: "", sep: ",", tail: "" },
    python: { head: "[", first: "", sep: ",", tail: "]" },
    line: "[x, y]",
  },
  { type: "add_to", kind: "statement", cat: "lists", scratch: "add {X} to {LIST}", python: "{LIST}.append({X})", line: "L.append(x)" },
  { type: "item_at", kind: "value", cat: "lists", scratch: "item at position {N} of {LIST} (from 0)", python: "{LIST}[{N}]", line: "L[N]" },
  {
    type: "set_item", kind: "statement", cat: "lists",
    scratch: "set item at position {N} of {LIST} to {X}", python: "{LIST}[{N}] = {X}", line: "L[N] = x",
  },
  {
    type: "remove_item", kind: "statement", cat: "lists",
    scratch: "remove item at position {N} of {LIST}", python: "{LIST}.pop({N})", line: "L.pop(N)",
  },
  { type: "length", kind: "value", cat: "lists", scratch: "length of {X}", python: "len({X})", line: "len(x)" },
  { type: "contains", kind: "value", cat: "lists", scratch: "{LIST} contains {X}?", python: "{X} in {LIST}", line: "x in L" },

  // Your own blocks
  {
    type: "def", kind: "statement", top: true, cat: "functions", body: ["DO"],
    fields: { NAME: NAME("name"), PARAMS: { kind: "params", default: "" } },
    scratch: "make a block [NAME] with [PARAMS]", python: "def [NAME]([PARAMS])", line: "def [NAME]([PARAMS]):",
  },
  { type: "return", kind: "statement", cat: "functions", scratch: "give back {VALUE}", python: "return {VALUE}", line: "return x" },
  { type: "own_call", kind: "statement", ...OWN_CALL },
  { type: "own_call_value", kind: "value", ...OWN_CALL },

  // Drawing (phase C+, BF-D-022): a sketch with funground, `import funground as f`. The two hats are setup() and
  // draw(); the generator writes the import, the `global` line of each hat and the f.run() (or f.show()) at the end.
  {
    type: "sketch_start", kind: "statement", top: true, hat: true, cat: "drawing", body: ["DO"],
    scratch: "when the sketch starts", python: "def setup()", line: "def setup():",
  },
  {
    type: "sketch_frame", kind: "statement", top: true, hat: true, cat: "drawing", body: ["DO"],
    scratch: "every frame", python: "def draw()", line: "def draw():",
  },
  { type: "canvas_size", kind: "statement", cat: "drawing", scratch: "canvas size {W} by {H}", python: "f.size({W}, {H})", line: "f.size(W, H)" },
  { type: "background", kind: "statement", cat: "drawing", scratch: "background {COLOR}", python: "f.background({COLOR})", line: "f.background(x)" },
  { type: "fill", kind: "statement", cat: "drawing", scratch: "fill colour {COLOR}", python: "f.fill({COLOR})", line: "f.fill(x)" },
  { type: "outline", kind: "statement", cat: "drawing", scratch: "outline colour {COLOR}", python: "f.stroke({COLOR})", line: "f.stroke(x)" },
  {
    type: "circle", kind: "statement", cat: "drawing",
    scratch: "circle at x {X} y {Y} size {D}", python: "f.circle({X}, {Y}, {D})", line: "f.circle(x, y, d)",
  },
  {
    type: "rectangle", kind: "statement", cat: "drawing",
    scratch: "rectangle at x {X} y {Y} width {W} height {H}", python: "f.rect({X}, {Y}, {W}, {H})", line: "f.rect(x, y, w, h)",
  },
  {
    type: "line", kind: "statement", cat: "drawing",
    scratch: "line from x {X1} y {Y1} to x {X2} y {Y2}", python: "f.line({X1}, {Y1}, {X2}, {Y2})", line: "f.line(x1, y1, x2, y2)",
  },
  {
    type: "write", kind: "statement", cat: "drawing",
    scratch: "write {TEXT} at x {X} y {Y}", python: "f.text({TEXT}, {X}, {Y})", line: "f.text(t, x, y)",
  },
  {
    type: "sketch_value", kind: "value", cat: "drawing",
    fields: {
      WHAT: {
        kind: "dropdown", default: "mouse_x",
        options: [opt("mouse_x", "mouse x", "f.mouse_x"), opt("mouse_y", "mouse y", "f.mouse_y"), opt("width", "width", "f.width"),
          opt("height", "height", "f.height"), opt("frame_count", "frame count", "f.frame_count")],
      },
    },
    scratch: "[WHAT]", python: "[WHAT]", line: null,
  },

  // Calling anything else
  { type: "call", kind: "statement", ...CALL_FN },
  { type: "call_value", kind: "value", ...CALL_FN },
  { type: "method", kind: "statement", ...CALL_METHOD },
  { type: "method_value", kind: "value", ...CALL_METHOD },

  // Python code
  { type: "code", kind: "statement", ...CODE, line: null },
  { type: "code_value", kind: "value", order: true, ...CODE, line: null },
];

export const BY_TYPE = Object.fromEntries(BLOCKS.map((b) => [b.type, b]));

// What a block brings from the toolbox in each value slot, so it can be edited at once, as in Scratch:
//   {number: 10}  a number shadow         {text: "Hello!"}  a text shadow
//   {name: "list"} a variable shadow      {cond: true}      a real comparison (v = 0) with shadows in it
// A shadow is typed over, or covered by dropping a block on it. A comparison is a block like any other, so it is
// edited or replaced; a shadow may not hold a real block, which is why the condition is not a shadow.
const number = (value) => ({ number: value });
const text = (value) => ({ text: value });
const name = (value) => ({ name: value });
const cond = { cond: true };

export const DEFAULTS = {
  say: { ARG0: text("Hello!") },
  ask: { Q: text("What is your name? ") },
  to_int: { X: text("5") },
  to_float: { X: text("3.5") },
  to_str: { X: number(0) },
  set: { VALUE: number(0) },
  change: { VALUE: number(1) },
  subtract: { VALUE: number(1) },
  arith: { A: number(0), B: number(0) },
  floordiv: { A: number(0), B: number(1) },
  mod: { A: number(0), B: number(1) },
  power: { A: number(0), B: number(2) },
  negate: { X: number(0) },
  randint: { A: number(1), B: number(6) },
  round: { X: number(0) },
  sqrt: { X: number(0) },
  abs: { X: number(0) },
  // the left side is a name, so a condition is ready to choose (or type) a variable in, as a learner expects
  compare: { A: name("v"), B: number(0) },
  logic: { A: cond, B: cond },
  not: { X: cond },
  repeat: { N: number(10) },
  count: { A: number(0), B: number(10) },
  count_by: { A: number(0), B: number(10), S: number(1) },
  for_each: { LIST: name("list") },
  while: { COND: cond },
  until: { COND: cond },
  if: { IF0: cond },
  wait: { N: number(1) },
  list_of: { ARG0: number(1), ARG1: number(2) },
  add_to: { X: text("thing"), LIST: name("list") },
  item_at: { N: number(0), LIST: name("list") },
  set_item: { N: number(0), LIST: name("list"), X: number(0) },
  remove_item: { N: number(0), LIST: name("list") },
  length: { X: text("Hello") },
  contains: { LIST: name("list"), X: text("a") },
  return: { VALUE: number(0) },
  canvas_size: { W: number(640), H: number(400) },
  background: { COLOR: text("white") },
  fill: { COLOR: text("tomato") },
  outline: { COLOR: text("black") },
  circle: { X: number(320), Y: number(200), D: number(80) },
  rectangle: { X: number(100), Y: number(100), W: number(200), H: number(120) },
  line: { X1: number(0), Y1: number(0), X2: number(640), Y2: number(400) },
  write: { TEXT: text("Hello!"), X: number(20), Y: number(40) },
  method: { OBJ: name("x") },
  method_value: { OBJ: name("x") },
};

// What a slot added in the gear gets (loading JSON adds none: the JSON gives the children). An else-if gets the
// same condition as the toolbox's "if".
export const NEW_SLOTS = {
  say: text(""),
  list_of: number(0),
  call: number(0),
  call_value: number(0),
  method: number(0),
  method_value: number(0),
  if: cond,
};
