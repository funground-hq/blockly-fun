"""Makes editor/catalogue/python.json: Python's own built-in functions and the methods of its main types.

blockly-fun keeps this file (funground's catalogue is the host's; Python's is not). The name list of a bare call
`name(...)` and the list on an object whose type the type rule works out as a Python type (BF-D-040, BF-D-044) read it.

Run it with the project's Python, from anywhere:

    C:/Projects/playground/.venv/Scripts/python.exe tools/make_python_catalogue.py

With a path after it, the file is written there instead (the tests do that to check the checked-in file is current).

Standard library only. The output is the same on every run for one Python version; the version is written in the header.
The signatures and the first line of each summary come from `inspect` and the docstrings; the plain sentences, the
order (rank), the few signatures that `inspect` cannot give, and what each call gives back are written by hand below.
"""

import builtins
import inspect
import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "editor" / "catalogue" / "python.json"

FUNCTIONS = "https://docs.python.org/3/library/functions.html#"
STDTYPES = "https://docs.python.org/3/library/stdtypes.html#"

# Built-ins a learner does not call (advanced, or they need what a learner has not met). Exceptions and dunder names are
# left out by the filter below.
SKIP = {
    "aiter", "anext", "breakpoint", "classmethod", "compile", "delattr", "eval", "exec", "globals", "locals",
    "memoryview", "object", "property", "setattr", "slice", "staticmethod", "super", "vars", "complex", "bytearray",
    "bytes", "frozenset", "callable", "issubclass",
}

# Signatures that inspect cannot give, or that are better for a learner (each required name makes a slot when the name
# is chosen). Names that are not here use inspect.signature.
SIGNATURES = {
    "print": "print(value, sep=' ', end='\\n')",
    "range": "range(stop)",
    "min": "min(a, b)",
    "max": "max(a, b)",
    "iter": "iter(items)",
    "next": "next(iterator)",
    "input": "input(prompt='')",
    "str": "str(value)",
    "int": "int(value)",
    "float": "float(value)",
    "bool": "bool(value)",
    "list": "list(items)",
    "dict": "dict()",
    "set": "set(items)",
    "tuple": "tuple(items)",
    "type": "type(value)",
    "enumerate": "enumerate(items, start=0)",
    "zip": "zip(first, second)",
    "map": "map(function, items)",
    "filter": "filter(function, items)",
    "reversed": "reversed(items)",
    "sorted": "sorted(items, key=None, reverse=False)",
    "sum": "sum(items, start=0)",
    "round": "round(number, digits=None)",
    "open": "open(file, mode='r')",
    "getattr": "getattr(object, name)",
    "hasattr": "hasattr(object, name)",
    "isinstance": "isinstance(value, kind)",
    "pow": "pow(base, exp)",
    "divmod": "divmod(a, b)",
}

# First lines that are no use as they stand (a signature, or nothing)
SUMMARIES = {
    "dict": "Make a new dictionary.",
    "list": "Make a new list.",
    "tuple": "Make a new tuple.",
    "set": "Make a new set, which keeps each value once.",
    "type": "Return the type of a value.",
    "range": "Make a row of whole numbers, counting up (or down).",
    "zip": "Walk through several lists together, item by item.",
}

# The same for methods, by "type.name": where inspect gives (*args) or a default no learner should see
METHOD_SIGNATURES = {
    "str.count": "count(sub)", "str.endswith": "endswith(suffix)", "str.find": "find(sub)", "str.index": "index(sub)",
    "str.rfind": "rfind(sub)", "str.rindex": "rindex(sub)", "str.startswith": "startswith(prefix)",
    "str.maketrans": "maketrans(x)", "list.index": "index(value)", "tuple.index": "index(value)",
    "dict.pop": "pop(key)", "dict.update": "update(other)", "set.update": "update(other)",
}
METHOD_SUMMARIES = {
    "str.find": "Return the lowest position of a piece in the text, or -1.",
    "str.rfind": "Return the highest position of a piece in the text, or -1.",
    "str.index": "Return the lowest position of a piece in the text.",
    "str.rindex": "Return the highest position of a piece in the text.",
    "range.count": "Return how many times a value is in the row.",
    "range.index": "Return the position of a value in the row.",
    "dict.update": "Add the pairs of another dictionary to this one.",
}

# What a call gives back, where the type rule needs it. A name of a class in CLASSES gives that class's methods.
RETURNS = {
    "str": "str", "int": "int", "float": "float", "list": "list", "dict": "dict", "set": "set", "tuple": "tuple",
    "range": "range", "len": "int", "sorted": "list", "input": "str", "chr": "str", "ord": "int",
    "repr": "str", "ascii": "str", "bin": "str", "hex": "str", "oct": "str", "format": "str", "id": "int",
    "hash": "int", "bool": "bool", "any": "bool", "all": "bool", "isinstance": "bool", "hasattr": "bool",
}

# The plain sentences, most used first: the order here is the order of the list (rank).
PLAIN_NAMES = [
    ("print", "Shows the values on the screen."),
    ("input", "Asks the person a question and gives back what they typed, as text."),
    ("len", "Counts the items in a list, or the letters in some text."),
    ("range", "Counts through whole numbers, from 0 up to but not including the number given."),
    ("int", "Makes a whole number from a number or from text."),
    ("float", "Makes a decimal number from a number or from text."),
    ("str", "Makes text from any value."),
    ("abs", "Gives how far a number is from 0, so always 0 or more."),
    ("round", "Rounds a number to the nearest whole number."),
    ("min", "Gives the smallest of the values."),
    ("max", "Gives the largest of the values."),
    ("sum", "Adds up all the numbers in a list."),
    ("sorted", "Gives a new list with the items in order."),
    ("list", "Makes a list from the items given."),
    ("dict", "Makes a dictionary, which keeps values under names."),
    ("enumerate", "Pairs each item with its position, for looping."),
    ("zip", "Walks through two lists together, item by item."),
    ("type", "Tells you what kind of value this is."),
    ("bool", "Makes True or False from a value."),
    ("chr", "Gives the letter for a character number."),
    ("ord", "Gives the character number of a letter."),
    ("any", "Is True if at least one item is true."),
    ("all", "Is True only if every item is true."),
    ("reversed", "Walks through the items from the end to the start."),
    ("isinstance", "Checks if a value is of a kind, such as int or str."),
]

# The same for the main methods, most used first, by type.
PLAIN_METHODS = {
    "str": [
        ("upper", "Gives the text in capital letters."),
        ("lower", "Gives the text in small letters."),
        ("strip", "Takes spaces off both ends of the text."),
        ("split", "Cuts the text into a list of words, or at a mark you give."),
        ("join", "Joins the items of a list into one text, with this text between them."),
        ("replace", "Gives the text with one piece swapped for another."),
        ("startswith", "Is True if the text begins with this piece."),
        ("format", "Fills the {} gaps in the text with the values given."),
    ],
    "list": [
        ("append", "Adds an item at the end of the list."),
        ("pop", "Takes an item out of the list and gives it back (the last one if no position)."),
        ("insert", "Puts an item into the list at a position."),
        ("remove", "Takes the first item with this value out of the list."),
        ("sort", "Puts the items of the list in order."),
        ("index", "Gives the position of the first item with this value."),
    ],
    "dict": [
        ("get", "Gives the value under a key, or a fallback if there is none."),
        ("keys", "Gives all the keys."),
        ("values", "Gives all the values."),
        ("items", "Gives every key with its value, as pairs."),
    ],
}

# The type of the call's result where it is plain to see (the rest give nothing: unknown is fine).
METHOD_RETURNS = {
    "str": {n: "str" for n in (
        "capitalize casefold center expandtabs format join ljust lower lstrip replace rjust rstrip strip swapcase "
        "title translate upper zfill removeprefix removesuffix").split()}
    | {"split": "list", "rsplit": "list", "splitlines": "list", "find": "int", "index": "int", "count": "int",
       "rfind": "int", "rindex": "int"},
    "list": {"copy": "list", "index": "int", "count": "int"},
    "dict": {"copy": "dict"},
    "int": {"bit_length": "int", "bit_count": "int"},
    "float": {"hex": "str"},
    "set": {n: "set" for n in "copy difference intersection symmetric_difference union".split()},
    "tuple": {"index": "int", "count": "int"},
    "range": {"index": "int", "count": "int"},
}

CLASSES = [str, list, dict, int, float, set, tuple, range]

# Pages: where the stdtypes page has no anchor of the method's own
TYPE_PAGES = {"tuple": "tuples", "range": "ranges"}
# Functions that are classes documented with the types: their anchor in functions.html starts with func-
FUNC_PREFIX = {"str", "list", "dict", "set", "tuple", "range"}


def summary(obj, name):
    """The first sentence of the docstring, skipping signature lines."""
    text = inspect.getdoc(obj) or ""
    paragraph = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            if paragraph:
                break
            continue
        if not paragraph and ("->" in line or line.startswith(name + "(") or line.startswith("--")):
            continue
        paragraph.append(line)
    sentence = " ".join(paragraph)
    end = sentence.find(". ")
    if end > 0:
        sentence = sentence[: end + 1]
    return sentence


def format_signature(name, obj, drop_self):
    """name(a, b=1, *more) from inspect, or None when inspect cannot tell or a default has no clear text."""
    try:
        parameters = list(inspect.signature(obj).parameters.values())
    except (TypeError, ValueError):
        return None
    if drop_self and parameters and parameters[0].name in ("self", "cls"):
        parameters = parameters[1:]
    parts = []
    for p in parameters:
        if p.kind is p.VAR_POSITIONAL:
            parts.append("*" + p.name)
        elif p.kind is p.VAR_KEYWORD:
            parts.append("**" + p.name)
        elif p.default is p.empty:
            parts.append(p.name)
        else:
            shown = repr(p.default)
            if "<" in shown:
                return None
            parts.append(f"{p.name}={shown}")
    return f"{name}({', '.join(parts)})"


def with_rank(entries, plain):
    """Puts the plain sentence and the rank on each entry named in `plain`; the others keep their summary, rank 0."""
    order = {name: i for i, (name, _) in enumerate(plain)}
    sentences = dict(plain)
    for entry in entries:
        if entry["name"] in order:
            entry["plain"] = sentences[entry["name"]]
            entry["rank"] = 100 - order[entry["name"]]
    return entries


def build_names():
    plain_order = [name for name, _ in PLAIN_NAMES]
    entries = []
    for name in sorted(dir(builtins)):
        obj = getattr(builtins, name)
        public = not name.startswith("_") and name not in SKIP
        is_exception = inspect.isclass(obj) and issubclass(obj, BaseException)
        if not public or is_exception or not (inspect.isbuiltin(obj) or inspect.isclass(obj)):
            continue
        signature = SIGNATURES.get(name) or format_signature(name, obj, False) or f"{name}(*args)"
        anchor = ("func-" if name in FUNC_PREFIX else "") + name
        entry = {"name": name, "kind": "function", "signature": signature, "summary": SUMMARIES.get(name) or summary(obj, name),
                 "url": FUNCTIONS + anchor}
        if name in RETURNS:
            entry["returns"] = RETURNS[name]
        entries.append(entry)
    missing = [n for n in plain_order if n not in {e["name"] for e in entries}]
    assert not missing, f"plain sentences for names that are not built-ins here: {missing}"
    return with_rank(entries, PLAIN_NAMES)


# Methods left out: complex-number arithmetic on int and float, which a learner does not call and the docs give no anchor.
SKIP_METHODS = {"conjugate"}


def build_class(cls):
    name = cls.__name__
    entries = []
    for member in sorted(dir(cls)):
        if member.startswith("_") or member in SKIP_METHODS or not callable(getattr(cls, member)):
            continue
        obj = getattr(cls, member)
        key = f"{name}.{member}"
        signature = METHOD_SIGNATURES.get(key) or format_signature(member, obj, True) or f"{member}(*args)"
        entry = {"name": member, "kind": "method", "signature": signature,
                 "summary": METHOD_SUMMARIES.get(key) or summary(obj, member),
                 "url": f"{STDTYPES}{TYPE_PAGES[name]}" if name in TYPE_PAGES else f"{STDTYPES}{name}.{member}"}
        returns = METHOD_RETURNS.get(name, {}).get(member)
        if returns:
            entry["returns"] = returns
        entries.append(entry)
    if name in PLAIN_METHODS:
        known = {e["name"] for e in entries}
        missing = [m for m, _ in PLAIN_METHODS[name] if m not in known]
        assert not missing, f"plain sentences for methods {name} does not have: {missing}"
    return with_rank(entries, PLAIN_METHODS.get(name, []))


def dumps(data):
    """JSON with one entry on each line, so a change shows in a diff."""
    lines = ["{"]
    keys = list(data)
    for k, key in enumerate(keys):
        value = data[key]
        tail = "," if k < len(keys) - 1 else ""
        if isinstance(value, list):
            lines.append(f"{json.dumps(key)}: [")
            lines.extend(json.dumps(item, ensure_ascii=False) + ("," if i < len(value) - 1 else "")
                         for i, item in enumerate(value))
            lines.append("]" + tail)
        elif isinstance(value, dict) and key == "classes":
            lines.append(f"{json.dumps(key)}: {{")
            names = list(value)
            for c, cls in enumerate(names):
                lines.append(f"{json.dumps(cls)}: {{\"members\": [")
                members = value[cls]["members"]
                lines.extend(json.dumps(item, ensure_ascii=False) + ("," if i < len(members) - 1 else "")
                             for i, item in enumerate(members))
                lines.append("]}" + ("," if c < len(names) - 1 else ""))
            lines.append("}" + tail)
        else:
            lines.append(f"{json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}{tail}")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main(out):
    data = {
        "made_by": "tools/make_python_catalogue.py (do not edit by hand: run it again)",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "stdlib": sorted(m for m in sys.stdlib_module_names if not m.startswith("_")),
        "names": build_names(),
        "classes": {cls.__name__: {"members": build_class(cls)} for cls in CLASSES},
    }
    out.write_text(dumps(data), encoding="utf-8", newline="\n")
    print(f"{out}: {out.stat().st_size} bytes, Python {data['python']}, {len(data['names'])} names")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else OUT)
