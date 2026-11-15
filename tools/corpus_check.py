"""Python's side of tools/corpus_check.mjs: reads JSON on stdin, writes JSON on stdout.

    {"convert": [text, ...]}            -> [{"ok", "workspace", "raw"} | {"ok": false, "line", "message"} | {"crash"}]
    {"compare": [[before, after], ...]} -> [{"ast": same?, "comments": same?, "error"?}]

Unlike `python -m blockly_fun`, one program that crashes the converter does not stop the batch: it is the finding.
"""

import ast
import io
import json
import re
import sys
import tokenize
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "python"))

from blockly_fun import convert  # noqa: E402


def comments(text):
    """The comments, in order, as the generator writes them back ("#x" is read as "# x")."""
    found = [t.string for t in tokenize.generate_tokens(io.StringIO(text).readline) if t.type == tokenize.COMMENT]
    return [re.sub(r"^#\s?", "", c) for c in found]


def safe_convert(text):
    try:
        return convert(text)
    except Exception:   # noqa: BLE001 - every crash is reported, not raised
        return {"ok": False, "crash": traceback.format_exc(limit=-3)}


def compare(before, after):
    try:
        same_ast = ast.dump(ast.parse(before)) == ast.dump(ast.parse(after))
    except SyntaxError as error:
        return {"ast": False, "comments": False, "error": f"the regenerated text does not parse: {error}"}
    return {"ast": same_ast, "comments": comments(before) == comments(after)}


def main():
    # UTF-8 both ways, whatever the console's code page (cp1252 on Windows cannot hold most of Unicode)
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    request = json.load(sys.stdin)
    if "convert" in request:
        answer = [safe_convert(text) for text in request["convert"]]
    else:
        answer = [compare(before, after) for before, after in request["compare"]]
    json.dump(answer, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
