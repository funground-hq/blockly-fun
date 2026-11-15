// A small builder for fixtures: each function makes one block and returns Blockly's JSON for it, so a fixture
// reads one-to-one like the blocks on the screen.
//
//   stmt.set("name", val.ask(text("What is your name? ")))
//   program([stmt.say(text("Hi"), name("x"))], [stmt.def("f", "a", [stmt.ret(name("a"))])])
//
// A JS number in a slot is a number block. Text and names must be made with text() and name().

class Node {
  constructor(json) {
    this.json = json;
  }

  /** `count` blank lines before this statement. */
  blank(count) {
    this.json.extraState = { ...this.json.extraState, blank: count };
    return this;
  }

  /** A block comment; trailing = at the end of the statement's line, otherwise on its own line(s) before it. */
  comment(text, { trailing = false } = {}) {
    if (trailing) this.json.extraState = { ...this.json.extraState, trailing: true };
    this.json.icons = { comment: { text, pinned: false, height: 80, width: 160 } };
    return this;
  }
}

const json = (node) => (node instanceof Node ? node.json : typeof node === "number" ? num(node).json : node);

function chain(nodes) {
  const blocks = nodes.map(json);
  for (let i = 0; i + 1 < blocks.length; i++) blocks[i].next = { block: blocks[i + 1] };
  return blocks[0];
}

function make(type, { fields, inputs = {}, body = {}, extra } = {}) {
  const block = { type: "bf_" + type };
  if (fields) block.fields = fields;
  if (extra) block.extraState = extra;
  const wired = {};
  for (const [slot, value] of Object.entries(inputs)) {
    if (value !== undefined && value !== null) wired[slot] = { block: json(value) };
  }
  for (const [slot, statements] of Object.entries(body)) {
    if (statements && statements.length) wired[slot] = { block: chain(statements) };
  }
  if (Object.keys(wired).length) block.inputs = wired;
  return new Node(block);
}

export const text = (value) => make("text", { fields: { TEXT: value } });
export const num = (value) => make("number", { fields: { NUM: String(value) } });
export const name = (value) => make("variable", { fields: { VAR: value } });
/** A keyword argument for call() and method(): kw("end", text("")) makes end="". */
export const kw = (key, value) => ({ keyword: key, value });

function args(items) {
  return {
    extra: { args: items.map((a) => (a && a.keyword !== undefined ? "k" : "p")) },
    fields: Object.fromEntries(items.flatMap((a, i) => (a && a.keyword !== undefined ? [["KW" + i, a.keyword]] : []))),
    inputs: Object.fromEntries(items.map((a, i) => ["ARG" + i, a && a.keyword !== undefined ? a.value : a])),
  };
}

function callBlock(type, fnName, items, object) {
  const a = args(items);
  return make(type, {
    fields: { NAME: fnName, ...a.fields },
    inputs: { ...(object ? { OBJ: object } : {}), ...a.inputs },
    extra: a.extra,
  });
}

/** A call of a block made with "make a block": positional arguments only, a count in extraState. */
function ownBlock(type, fnName, items) {
  return make(type, {
    fields: { NAME: fnName },
    extra: { args: items.length },
    inputs: Object.fromEntries(items.map((a, i) => ["ARG" + i, a])),
  });
}

const binary = (type, fields) => (a, b) => make(type, { fields, inputs: { A: a, B: b } });
const unary = (type) => (x) => make(type, { inputs: { X: x } });

export const val = {
  text, num, name,
  bool: (value) => make("boolean", { fields: { VALUE: value ? "True" : "False" } }),
  ask: (question) => make("ask", { inputs: { Q: question } }),
  int: unary("to_int"),
  float: unary("to_float"),
  str: unary("to_str"),
  add: binary("arith", { OP: "+" }),
  sub: binary("arith", { OP: "-" }),
  mul: binary("arith", { OP: "*" }),
  div: binary("arith", { OP: "/" }),
  floordiv: binary("floordiv"),
  mod: binary("mod"),
  pow: binary("power"),
  neg: unary("negate"),
  randint: binary("randint"),
  round: unary("round"),
  sqrt: unary("sqrt"),
  abs: unary("abs"),
  eq: binary("compare", { OP: "==" }),
  ne: binary("compare", { OP: "!=" }),
  lt: binary("compare", { OP: "<" }),
  gt: binary("compare", { OP: ">" }),
  le: binary("compare", { OP: "<=" }),
  ge: binary("compare", { OP: ">=" }),
  and: binary("logic", { OP: "and" }),
  or: binary("logic", { OP: "or" }),
  not: unary("not"),
  emptyList: () => make("empty_list"),
  listOf: (...items) => {
    return make("list_of", {
      extra: { items: items.length },
      inputs: Object.fromEntries(items.map((a, i) => ["ARG" + i, a])),
    });
  },
  itemAt: (n, list) => make("item_at", { inputs: { N: n, LIST: list } }),
  length: unary("length"),
  contains: (list, x) => make("contains", { inputs: { LIST: list, X: x } }),
  call: (fnName, ...items) => callBlock("call_value", fnName, items),
  own: (fnName, ...items) => ownBlock("own_call_value", fnName, items),
  method: (object, methodName, ...items) => callBlock("method_value", methodName, items, object),
  /** Python with no block; order (a key of the generator's ORDER) is what the converter writes, if it knows it. */
  code: (source, order) => make("code_value", { fields: { TEXT: source }, extra: order ? { order } : undefined }),
};

export const stmt = {
  say: (...items) => make("say", {
    extra: { items: items.length },
    inputs: Object.fromEntries(items.map((a, i) => ["ARG" + i, a])),
  }),
  set: (variable, value) => make("set", { fields: { VAR: variable }, inputs: { VALUE: value } }),
  change: (variable, value) => make("change", { fields: { VAR: variable }, inputs: { VALUE: value } }),
  subtract: (variable, value) => make("subtract", { fields: { VAR: variable }, inputs: { VALUE: value } }),
  repeat: (n, body) => make("repeat", { inputs: { N: n }, body: { DO: body } }),
  /** count i from a (null = from 0, written range(b)) up to but not b. */
  count: (variable, a, b, body) => make("count", { fields: { VAR: variable }, inputs: { A: a, B: b }, body: { DO: body } }),
  countBy: (variable, a, b, step, body) => make("count_by", {
    fields: { VAR: variable }, inputs: { A: a, B: b, S: step }, body: { DO: body },
  }),
  forEach: (variable, list, body) => make("for_each", { fields: { VAR: variable }, inputs: { LIST: list }, body: { DO: body } }),
  forever: (body) => make("forever", { body: { DO: body } }),
  while: (cond, body) => make("while", { inputs: { COND: cond }, body: { DO: body } }),
  until: (cond, body) => make("until", { inputs: { COND: cond }, body: { DO: body } }),
  /** if([[cond, body], [cond, body]...], elseBody): the first pair is "if", the others "else if". */
  if: (pairs, elseBody) => {
    const inputs = {};
    const body = {};
    pairs.forEach(([cond, statements], i) => {
      inputs["IF" + i] = cond;
      body["DO" + i] = statements;
    });
    if (elseBody !== undefined) body.ELSE = elseBody;
    return make("if", { extra: { elifs: pairs.length - 1, else: elseBody !== undefined }, inputs, body });
  },
  break: () => make("break"),
  continue: () => make("continue"),
  wait: (n) => make("wait", { inputs: { N: n } }),
  addTo: (x, list) => make("add_to", { inputs: { X: x, LIST: list } }),
  setItem: (n, list, x) => make("set_item", { inputs: { N: n, LIST: list, X: x } }),
  removeItem: (n, list) => make("remove_item", { inputs: { N: n, LIST: list } }),
  def: (fnName, params, body) => make("def", { fields: { NAME: fnName, PARAMS: params }, body: { DO: body } }),
  ret: (x) => make("return", { inputs: { VALUE: x } }),
  call: (fnName, ...items) => callBlock("call", fnName, items),
  own: (fnName, ...items) => ownBlock("own_call", fnName, items),
  method: (object, methodName, ...items) => callBlock("method", methodName, items, object),
  code: (source) => make("code", { fields: { TEXT: source } }),
};

/** A list of statements as one stack. */
export const stack = (...statements) => statements;

/**
 * A workspace's JSON from stacks (arrays of statements); the stacks are put at y = 0, 100, 200 ... in the order
 * given. A statement given alone is a stack of one.
 */
export function program(...stacks) {
  return {
    blocks: {
      languageVersion: 0,
      blocks: stacks.map((s, i) => ({ ...chain(Array.isArray(s) ? s : [s]), x: 0, y: i * 100 })),
    },
  };
}
