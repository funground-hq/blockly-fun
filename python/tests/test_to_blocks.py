"""to_blocks: the blocks a piece of Python becomes (the JSON side; tests/roundtrip.test.js checks the text side)."""

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from blockly_fun import SourceError, convert, count_code_blocks, is_name, to_blocks  # noqa: E402


def tops(source):
    return to_blocks(source)["blocks"]["blocks"]


def first(source):
    return tops(source)[0]


def chain(block):
    while block:
        yield block
        block = block.get("next", {}).get("block")


def kinds(source):
    return [b["type"][3:] for top in tops(source) for b in chain(top)]


def slot(block, name):
    value = block["inputs"][name]
    return value.get("block") or value.get("shadow")


# -- values --------------------------------------------------------------------------------------------------------

def test_literals_in_slots_are_shadows_and_others_blocks():
    block = first("x = 3\n")
    assert block["inputs"]["VALUE"] == {"shadow": {"type": "bf_number", "fields": {"NUM": "3"}}}
    block = first("x = y\n")
    assert block["inputs"]["VALUE"] == {"block": {"type": "bf_variable", "fields": {"VAR": "y"}}}


def test_numbers_keep_their_text_and_odd_ones_are_python_code():
    assert slot(first("x = 1.50\n"), "VALUE")["fields"]["NUM"] == "1.50"
    assert slot(first("x = -5\n"), "VALUE") == {"type": "bf_number", "fields": {"NUM": "-5"}}
    assert slot(first("x = -y\n"), "VALUE")["type"] == "bf_negate"
    hexa = slot(first("x = 0xff\n"), "VALUE")
    assert hexa["type"] == "bf_code_value" and hexa["fields"]["TEXT"] == "0xff"


def test_none_is_an_empty_slot_except_where_empty_means_something_else():
    assert "inputs" not in first("x = None\n")
    assert "inputs" not in first("def f():\n    return\n")["inputs"]["DO"]["block"]
    returned = first("def f():\n    return None\n")["inputs"]["DO"]["block"]
    assert slot(returned, "VALUE")["fields"]["TEXT"] == "None"


def test_code_values_say_how_tightly_they_bind():
    def order(expression):
        return slot(first(f"x = {expression}\n"), "VALUE")["extraState"]["order"]

    assert order("a[1:2]") == "CALL"
    assert order("a if b else c") == "CONDITIONAL"
    assert order("a | b") == "BITWISE_OR"
    assert order("a is None") == "RELATIONAL"
    assert order("1, 2") == "LOWEST"
    assert order("(1, 2)") == "ATOMIC"
    assert order('f"{a}"') == "ATOMIC"
    assert order("lambda: 1") == "LOWEST"


def test_and_or_chains_lean_left():
    block = slot(first("x = a and b and c\n"), "VALUE")
    assert block["type"] == "bf_logic"
    assert slot(block, "A")["type"] == "bf_logic"
    assert slot(block, "B")["fields"]["VAR"] == "c"


def test_named_blocks_win_over_general_calls():
    assert slot(first("x = round(y)\n"), "VALUE")["type"] == "bf_round"
    assert slot(first("x = round(y, 2)\n"), "VALUE")["type"] == "bf_call_value"
    assert slot(first("x = len(y)\n"), "VALUE")["type"] == "bf_length"
    assert slot(first("x = input()\n"), "VALUE") == {"type": "bf_ask"}


def test_a_call_of_the_programs_own_function_is_its_own_block():
    source = "def greet(name):\n    print(name)\n\ngreet(\"Mia\")\nx = greet(\"Jo\")\ngreet(name=\"Al\")\n"
    statements = list(chain(tops(source)[1]))
    assert statements[0]["type"] == "bf_own_call"
    assert statements[0]["fields"] == {"NAME": "greet"} and statements[0]["extraState"]["args"] == 1
    assert slot(statements[1], "VALUE")["type"] == "bf_own_call_value"
    assert statements[2]["type"] == "bf_call"  # with a keyword: the general block


def test_general_calls_keep_keyword_arguments():
    block = first('print("a", end="")\n')
    assert block["type"] == "bf_call"
    assert block["extraState"] == {"args": ["p", "k"]}
    assert block["fields"] == {"NAME": "print", "KW1": "end"}


def test_awkward_calls_are_python_code():
    assert first("print(*items)\n")["type"] == "bf_code"
    assert slot(first("x = sum(n for n in y)\n"), "VALUE")["type"] == "bf_code_value"


# -- statements ----------------------------------------------------------------------------------------------------

def test_range_loops():
    assert first("for _ in range(3):\n    pass\n")["type"] == "bf_repeat"
    count = first("for i in range(5):\n    pass\n")
    assert count["type"] == "bf_count" and "A" not in count["inputs"]
    assert first("for i in range(1, 5):\n    pass\n")["type"] == "bf_count"
    assert first("for i in range(1, 5, 2):\n    pass\n")["type"] == "bf_count_by"
    assert first("for x in things:\n    pass\n")["type"] == "bf_for_each"
    assert first("for a, b in pairs:\n    pass\n")["type"] == "bf_code"


def test_while_forms():
    assert first("while True:\n    pass\n")["type"] == "bf_forever"
    assert first("while not done:\n    pass\n")["type"] == "bf_until"
    assert first("while x < 3:\n    pass\n")["type"] == "bf_while"
    assert first("while x:\n    pass\nelse:\n    pass\n")["type"] == "bf_code"


def test_elif_is_one_block_and_else_if_is_two():
    elif_block = first("if a:\n    pass\nelif b:\n    pass\nelse:\n    pass\n")
    assert elif_block["extraState"] == {"elifs": 1, "else": True}
    nested = first("if a:\n    pass\nelse:\n    if b:\n        pass\n")
    assert nested["extraState"] == {"elifs": 0, "else": True}
    assert nested["inputs"]["ELSE"]["block"]["type"] == "bf_if"


def test_a_body_of_only_pass_is_empty_and_a_pass_with_a_comment_stays():
    assert "inputs" not in first("while True:\n    pass\n")
    kept = first("while True:\n    pass  # later\n")["inputs"]["DO"]["block"]
    assert kept == {"type": "bf_code", "fields": {"TEXT": "pass  # later"}}


def test_list_statements():
    assert kinds("items.append(3)\nitems.pop(0)\nitems[0] = 1\n") == ["add_to", "remove_item", "set_item"]
    assert first("items.pop()\n")["type"] == "bf_method"


def test_a_code_block_holds_the_exact_text_without_its_indentation():
    source = "while True:\n    try:\n        x = 1\n    except ValueError:  # oops\n        pass\n"
    inner = first(source)["inputs"]["DO"]["block"]
    assert inner["fields"]["TEXT"] == "try:\n    x = 1\nexcept ValueError:  # oops\n    pass"


def test_decorated_and_nested_defs_are_python_code():
    assert first("@cache\ndef f():\n    pass\n")["fields"]["TEXT"] == "@cache\ndef f():\n    pass"
    outer = first("def f():\n    def g():\n        pass\n")
    assert outer["inputs"]["DO"]["block"]["type"] == "bf_code"
    assert first("def f(a=1):\n    pass\n")["type"] == "bf_code"


def test_semicolons_make_two_blocks():
    assert kinds("a = 1; b = 2\n") == ["set", "set"]


# -- imports, stacks, layout ---------------------------------------------------------------------------------------

def test_imports_a_block_needs_are_taken_in_and_others_kept():
    assert kinds("import random\n\nx = random.randint(1, 6)\n") == ["set"]
    assert kinds("import random\n\nx = random.choice(y)\n") == ["set"]  # a call on the module needs it too
    assert kinds("import math\n\nx = math.pi\n") == ["code", "set"]
    assert kinds("import os\n\nx = 1\n") == ["code", "set"]


def test_a_library_import_is_taken_in_only_when_the_generator_writes_it_back_as_it_stands():
    call = "sound.melody(\"c d e\")\n"
    assert kinds("from funground import sound\n\n" + call) == ["method"]
    source = "import random\n\nfrom funground import ml\nfrom funground import sound\n\nml.a()\nsound.b()\nx = random.randint(1, 6)\n"
    assert kinds(source) == ["method", "method", "set"]
    both = "import funground as f\nfrom funground import sound\n\nf.circle(1, 2, 3)\nsound.b()\nf.show()\n"
    assert kinds(both) == ["circle", "method"]
    # kept as written, as Python code: two names on a line, another order, a comment, a rename, a second copy,
    # a blank line missing or in the wrong place, an import the program does not use (and the lines after it)
    for source in [
        "from funground import ml, sound\n\nml.a()\nsound.b()\n",
        "from funground import sound\nfrom funground import ml\n\nml.a()\nsound.b()\n",
        "# mine\nfrom funground import sound\n\n" + call,
        "from funground import sound  # play\n\n" + call,
        "from funground import sound as s\n\ns.b()\n",
        "from funground import sound\nfrom funground import sound\n\n" + call,
        "from funground import sound\n" + call,
        "from funground import sound\n# play\n" + call,
        "import random\nfrom funground import sound\n\n" + call,
        "from funground import sound\n\nfrom funground import ml\n\nml.a()\n" + call,
        "from funground import ml\nfrom funground import sound\n\n" + call,
        "from funground import sound\n\nx = 1\n",
        "import math\n\nfrom funground import sound\n\n" + call,
    ]:
        assert "code" in kinds(source), source
    # a library name the program does not import is its own: the call is a block, its object Python code, so no import is made
    play = list(chain(first("sound = load()\nsound.play()\n")))[1]
    assert (play["type"], slot(play, "OBJ")["type"]) == ("bf_method", "bf_code_value")
    # an unused last line is left out, and so is the line above it: no blank line would follow it
    assert kinds("from funground import ml\nfrom funground import sound\n\nml.a()\nx = 1\n") == ["code", "code", "method", "set"]
    # with a blank line after it the line above stays taken in
    assert kinds("from funground import ml\n\nfrom funground import sound\n\nml.a()\nx = 1\n") == ["code", "method", "set"]


def test_each_def_is_a_stack_of_its_own_in_the_order_written():
    source = "x = 1\n\ndef f():\n    pass\n\ny = 2\nz = 3\n"
    stacks = tops(source)
    assert [[b["type"][3:] for b in chain(top)] for top in stacks] == [["set"], ["def"], ["set", "set"]]
    assert [top["y"] for top in stacks] == sorted(top["y"] for top in stacks)


def test_empty_text_is_an_empty_workspace():
    assert to_blocks("") == {}
    assert to_blocks("\n\n") == {}


# -- comments and blank lines --------------------------------------------------------------------------------------

def test_blank_lines_are_counted_on_the_next_block():
    statements = list(chain(first("a = 1\n\n\nb = 2\n")))
    assert statements[1]["extraState"] == {"blank": 2}
    assert "extraState" not in statements[0]


def test_comments_above_and_at_the_end_of_a_line():
    block = first("# one\n# two\nx = 1\n")
    assert block["icons"]["comment"]["text"] == "one\ntwo"
    block = first("x = 1  # one\n")
    assert block["icons"]["comment"]["text"] == "one" and block["extraState"] == {"trailing": True}


def test_a_comment_followed_by_a_blank_line_is_its_own_code_block():
    statements = list(chain(first("# alone\n\nx = 1\n")))
    assert (statements[0]["type"], statements[0]["fields"]) == ("bf_code", {"TEXT": "# alone"})
    assert statements[1]["extraState"] == {"blank": 1}


def test_a_block_with_an_end_of_line_comment_leaves_the_one_above_as_code():
    statements = list(chain(first("# above\nx = 1  # after\n")))
    assert statements[0]["fields"]["TEXT"] == "# above"
    assert statements[1]["icons"]["comment"]["text"] == "after"


def test_a_comment_inside_a_statement_of_several_lines_makes_it_code():
    block = first("x = [\n    1,  # one\n    2,\n]\n")
    assert block["type"] == "bf_code" and "# one" in block["fields"]["TEXT"]


def test_a_comment_on_an_else_line_makes_the_if_code():
    assert first("if a:\n    pass\nelse:  # otherwise\n    pass\n")["type"] == "bf_code"


def test_comments_at_the_end_of_a_body_stay_in_it():
    loop = first("for i in x:\n    y = i\n    # done\nz = 1\n")
    body = list(chain(loop["inputs"]["DO"]["block"]))
    assert body[-1] == {"type": "bf_code", "fields": {"TEXT": "# done"}}


def test_every_comment_has_a_place():
    source = ("# top\n\nimport random\n\n# a\nx = 1  # b\nif x:\n    # c\n    y = 2  # d\n    # e\n# f\nelse:\n"
              "    pass\n\n# g\n")
    text = repr(to_blocks(source))
    for letter in "abcdefg":
        assert f"'{letter}'" in text or f"# {letter}" in text, letter


# -- names, errors, the host's call --------------------------------------------------------------------------------

def test_names_the_editor_accepts():
    assert is_name("score") and is_name("_") and is_name("é2")
    assert not is_name("2x") and not is_name("for") and not is_name("")


def test_text_that_does_not_parse_says_which_line():
    with pytest.raises(SourceError) as error:
        to_blocks("x = 1\nif x\n")
    assert error.value.line == 2
    assert convert("print(\n")["ok"] is False


def test_convert_counts_the_python_code_blocks():
    result = convert("x = [i for i in y]\nprint(x)\n")
    assert result["ok"] and result["raw"] == 1 == count_code_blocks(result["workspace"])


def test_a_200_line_program_converts_quickly():
    programs = sorted((Path(__file__).resolve().parents[2] / "contract" / "programs").glob("*.py"))
    text = ""
    while text.count("\n") < 200:
        text += "\n".join(p.read_text(encoding="utf-8") for p in programs)
    started = time.perf_counter()
    to_blocks(text)
    elapsed = time.perf_counter() - started
    print(f"\n{text.count(chr(10))} lines in {elapsed * 1000:.1f} ms")
    assert elapsed < 1.0


# -- a sketch: the drawing kit (phase C+, BF-D-022) ----------------------------------------------------------------

SKETCH = "import funground as f\n\nx = 0\n\n\ndef draw():\n    global x\n\n    f.circle(x, 200, 40)\n    x += 1\n\n\nf.run()\n"


def test_a_sketch_has_hats_and_drawing_blocks_and_the_generator_writes_import_and_run():
    assert kinds(SKETCH) == ["set", "sketch_frame"]
    frame = tops(SKETCH)[1]
    body = list(chain(frame["inputs"]["DO"]["block"]))
    assert [b["type"] for b in body] == ["bf_circle", "bf_change"]
    assert body[0]["extraState"] == {"blank": 1}   # the blank line after `global x`


def test_the_kit_needs_import_funground_as_f():
    assert first("f.circle(1, 2, 3)\n")["type"] == "bf_method"
    assert first("import funground as f\nf.circle(1, 2, 3)\nf.show()\n")["type"] == "bf_circle"
    assert first("import funground\nfunground.circle(1, 2, 3)\n")["type"] == "bf_code"


def test_sketch_values_and_other_attributes():
    source = "import funground as f\n\nx = f.mouse_x\ny = f.key\nf.show()\n"
    statements = list(chain(tops(source)[0]))
    assert slot(statements[0], "VALUE") == {"type": "bf_sketch_value", "fields": {"WHAT": "mouse_x"}}
    assert slot(statements[1], "VALUE")["type"] == "bf_code_value"


def test_a_global_line_other_than_the_generators_keeps_an_ordinary_def():
    # y is set in draw but used nowhere else: the generator would write `global x` only
    source = "import funground as f\n\nx = 0\n\n\ndef draw():\n    global x, y\n\n    x += 1\n    y = 2\n\n\nf.run()\n"
    assert "sketch_frame" not in kinds(source)
    assert kinds(source) == ["code", "set", "def", "method"]   # nothing needs funground: its import stays code


def test_an_ending_the_generator_would_not_write_stays_as_written():
    # f.run() with no draw hat: the import stays Python code at the top, the ending a block of its own
    source = "import funground as f\n\nf.circle(1, 2, 3)\nf.run()\n"
    assert kinds(source) == ["code", "circle", "method"]
    with_frames = "import funground as f\n\nf.circle(1, 2, 3)\nf.run(max_frames=5)\n"
    assert kinds(with_frames)[-1] == "method"


def test_a_comment_above_the_imports_keeps_them_as_written():
    source = "# my sketch\nimport funground as f\n\nf.circle(1, 2, 3)\nf.show()\n"
    assert kinds(source) == ["code", "circle", "method"]
    assert tops(source)[0]["fields"]["TEXT"] == "import funground as f"
