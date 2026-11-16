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
    assert kinds("import math\n\nx = math.pi\n") == ["set"]   # an attribute of the module needs it too (BF-D-037)
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
    source = "import funground as f\n\nx = f.mouse_x\ny = f.key\nz = f.is_key_pressed\nf.show()\n"
    statements = list(chain(tops(source)[0]))
    assert slot(statements[0], "VALUE") == {"type": "bf_sketch_value", "fields": {"WHAT": "mouse_x"}}
    assert slot(statements[1], "VALUE") == {"type": "bf_sketch_value", "fields": {"WHAT": "key"}}   # BF-D-034
    other = slot(statements[2], "VALUE")   # not in the kit: the general attribute block
    assert other["type"] == "bf_attribute" and other["fields"] == {"NAME": "is_key_pressed"}
    assert slot(other, "OBJ") == {"type": "bf_variable", "fields": {"VAR": "f"}}


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


def test_a_comment_above_the_imports_is_a_header_and_a_blank_line_after_it_keeps_them_as_written():
    # BF-7: straight under the comment the imports are taken in (the comment is a stack of its own); a blank line in
    # between would be lost in the round trip, so they stay as written, the comment above them
    assert stack_kinds("# my sketch\nimport funground as f\n\nf.circle(1, 2, 3)\nf.show()\n") == [["code"], ["circle"]]
    source = "# my sketch\n\nimport funground as f\n\nf.circle(1, 2, 3)\nf.show()\n"
    assert kinds(source) == ["code", "code", "circle", "method"]
    assert tops(source)[0]["fields"]["TEXT"] == "# my sketch"


def stack_kinds(source):
    """The kinds of blocks in each stack."""
    return [[b["type"][3:] for b in chain(top)] for top in tops(source)]


def test_imports_after_a_header_are_taken_in_and_the_header_is_a_stack_of_its_own():
    # BF-7: a docstring and/or comment lines, then the imports on the next line
    roll = "x = random.randint(1, 6)\n"
    assert stack_kinds('"""A."""\nimport random\n\n' + roll) == [["code"], ["set"]]
    assert stack_kinds("# A.\n# B.\nimport random\n\n" + roll) == [["code"], ["set"]]
    # (a comment straight above the docstring is the docstring's own)
    assert stack_kinds('# A.\n"""B."""\n# C.\nimport random\n\n' + roll) == [["code", "code"], ["set"]]
    assert stack_kinds('"""A."""\nfrom funground import sound\n\nsound.b()\n') == [["code"], ["method"]]
    # the blank lines after the imports stay on the first block of the code, less the one the generator writes
    assert first_blank('"""A."""\nimport random\n\n\n' + roll) == 1
    assert first_blank('"""A."""\nimport random\n\n' + roll) == 0
    # the kit applies below a header, and its import is taken in
    sketch = '"""A."""\nimport funground as f\n\nf.circle(1, 2, 3)\nf.show()\n'
    assert stack_kinds(sketch) == [["code"], ["circle"]]
    # kept as written (the imports are Python code): two blank lines, none, a note on the docstring's line, two strings,
    # a string that is a call, an import no block uses
    for source in [
        '"""A."""\n\nimport random\n\n' + roll,
        '"""A."""\n\n\nimport random\n\n' + roll,
        "# A.\n\nimport random\n\n" + roll,
        '"""A."""  # note\nimport random\n\n' + roll,
        '"A" "B"\nimport random\n\n' + roll,
        '"""A."""\n"""B."""\nimport random\n\n' + roll,
        '"{}".format(1)\nimport random\n\n' + roll,
        '"""A."""\nimport random\n\nx = 1\n',
    ]:
        assert "import random" in code_texts(source), source
    # the kit's blocks apply when its import stays as written, too
    kit = '"""A."""\nimport funground as f\n\nf.circle(1, 2, 3)\n'
    assert "circle" in [kind for stack in stack_kinds(kit) for kind in stack]
    # with no header the program is one stack, as before; a lone comment before a def would look like a header to the
    # generator, so the imports are kept
    assert stack_kinds("import random\n\n# Roll.\n" + roll) == [["set"]]
    assert "import random" in code_texts("import random\n\n# Roll.\n\ndef f():\n    return random.random()\n")


def code_texts(source):
    return [b["fields"]["TEXT"] for top in tops(source) for b in chain(top) if b["type"] == "bf_code"]


def first_blank(source):
    """The blank lines on the first block of the code, under a header."""
    return tops(source)[1].get("extraState", {}).get("blank", 0)


# -- the drawing kit, part 2 (BF-D-033) ------------------------------------------------------------------------------

KIT = "import funground as f\n\n"


def test_five_more_drawing_blocks():
    source = KIT + "f.no_stroke()\nf.no_fill()\nf.stroke_width(3)\nf.text_size(24)\nf.text_align(\"right\")\nf.show()\n"
    assert kinds(source) == ["no_outline", "no_fill", "outline_width", "text_size", "text_align"]
    blocks = list(chain(tops(source)[0]))
    assert slot(blocks[2], "N") == {"type": "bf_number", "fields": {"NUM": "3"}}
    assert blocks[4]["fields"] == {"ALIGN": "right"}


def test_a_call_with_other_arguments_stays_a_call_block():
    for call in ["f.text_align(\"centre\")",   # not one of the three words
                 "f.text_align(where)", "f.text_align(\"left\", vertical=\"top\")", "f.text_align(\"left\", \"top\")",
                 "f.no_stroke(1)", "f.stroke_width(1, 2)"]:
        assert first(KIT + call + "\n")["type"] == "bf_code"   # the import is kept: no block needs it
        assert kinds(KIT + call + "\n") == ["code", "method"], call


# -- the events kit (BF-D-034) ---------------------------------------------------------------------------------------

EVENTS = (KIT + "score = 0\n\n\ndef key_pressed():\n    global score\n\n    score += 1\n\n\n"
          "def mouse_pressed():\n    f.circle(f.mouse_x, f.mouse_y, 20)\n\n\nf.run()\n")


def test_event_hats_are_stacks_of_their_own_and_a_program_with_one_ends_with_run():
    assert kinds(EVENTS) == ["set", "key_pressed", "mouse_pressed"]
    assert [len(list(chain(top))) for top in tops(EVENTS)] == [1, 1, 1]


def test_an_event_hat_keeps_the_generators_global_rule():
    # `global score, other`: the generator would write `global score` only, so the def stays an ordinary def
    source = EVENTS.replace("global score", "global score, other")
    assert kinds(source) == ["set", "def", "mouse_pressed"]
    # with arguments it is not an event hat
    assert "key_pressed" not in kinds(KIT + "def key_pressed(key):\n    pass\n\n\nf.run()\n")


def last(source):
    """The last block of the first stack (the imports kept as code come before it)."""
    return list(chain(tops(source)[0]))[-1]


# -- the sound, camera and ml kits (BF-D-035, BF-D-036) ----------------------------------------------------------------

def test_library_calls_with_exactly_the_blocks_arguments_are_blocks_when_the_program_imports_the_library():
    source = ("from funground import camera\nfrom funground import ml\nfrom funground import sound\n\n\n"
              "cam = camera.open()\nbody = ml.pose(cam)\nhand = ml.hand(cam)\nguess = ml.guess(cam)\nwords = ml.words(mic)\n"
              "heard = ml.sound(mic)\nml.teach(\"fist\", cam)\nsong = sound.melody(\"C D E\")\n"
              "a = sound.note(\"C4\", 1)\nb = sound.tone(440, 1)\nmic = sound.microphone()\n")
    top = tops(source)[0]
    assert [b["type"][3:] for b in chain(top)] == ["set"] * 6 + ["ml_teach"] + ["set"] * 4
    values = [slot(b, "VALUE")["type"][3:] for b in chain(top) if b["type"] == "bf_set"]
    assert values == ["camera_open", "ml_pose", "ml_hand", "ml_guess", "ml_words", "ml_sound", "sound_melody",
                      "sound_note", "sound_tone", "sound_microphone"]
    body = slot(list(chain(top))[1], "VALUE")
    assert slot(body, "SRC") == {"type": "bf_variable", "fields": {"VAR": "cam"}}


def test_library_calls_need_the_import_and_the_exact_arguments():
    # no import: the name is the program's own
    assert slot(first("body = ml.pose(cam)\n"), "VALUE")["type"] == "bf_method_value"
    assert slot(first("song = sound.melody(\"c\")\n"), "VALUE")["type"] == "bf_method_value"
    imported = "from funground import ml\nfrom funground import sound\n\n"
    for text in ["ml.pose(cam, 2)", "ml.pose()", "ml.pose(cam, count=2)", "ml.guess(cam, k=3)", "ml.pose(*cams)",
                 "sound.melody(\"c\", tempo=90)", "sound.tone(440)", "sound.note(\"C\", 1, wave=\"saw\")",
                 "sound.microphone(\"usb\")"]:
        value = slot(last(imported + "x = " + text + "\n"), "VALUE")
        assert value["type"] in ("bf_method_value", "bf_code_value"), text
    # a value block is not a statement, and a statement block is not a value
    assert last(imported + "sound.melody(\"c\")\n")["type"] == "bf_method"
    assert slot(last(imported + "x = ml.teach(\"a\", cam)\n"), "VALUE")["type"] == "bf_method_value"
    assert last(imported + "ml.teach(\"a\", cam)\n")["type"] == "bf_ml_teach"


def test_methods_are_never_kit_blocks():
    imported = "from funground import sound\n\n"
    assert slot(last(imported + "x = song.melody(\"c\")\n"), "VALUE")["type"] == "bf_method_value"
    assert last(imported + "tune.play()\n")["type"] == "bf_method"


# -- an attribute as a block (BF-D-037) -----------------------------------------------------------------------------

def test_an_attribute_read_is_a_value_block_and_chains_nest():
    value = slot(first("x = body.nose.x\n"), "VALUE")
    assert value["type"] == "bf_attribute" and value["fields"] == {"NAME": "x"}
    inner = slot(value, "OBJ")
    assert inner["type"] == "bf_attribute" and inner["fields"] == {"NAME": "nose"}
    assert slot(inner, "OBJ") == {"type": "bf_variable", "fields": {"VAR": "body"}}


def test_an_attribute_is_the_object_of_a_call_and_a_call_the_object_of_an_attribute():
    call = first("snap.size.count(1)\n")
    assert call["type"] == "bf_method" and slot(call, "OBJ")["type"] == "bf_attribute"
    value = slot(first("w = cam.picture().width\n"), "VALUE")
    assert value["type"] == "bf_attribute"
    assert slot(value, "OBJ")["type"] == "bf_method_value"


def test_setting_an_attribute_stays_python_code():
    assert kinds("body.score = 1\nbody.score += 1\ndel body.score\n") == ["code", "code", "code"]
    assert kinds("body.points[0] = 1\n") == ["set_item"]   # the list is an attribute read
    assert slot(first("body.points[0] = 1\n"), "LIST")["type"] == "bf_attribute"


def test_an_attribute_of_a_module_needs_its_import_and_a_library_name_with_no_import_is_code():
    assert kinds("import time\n\nx = time.time\n") == ["set"]
    assert kinds("import os\n\nx = os.path\n") == ["code", "set"]
    assert slot(slot(first("x = sound.something\n"), "VALUE"), "OBJ")["type"] == "bf_code_value"   # no import, no line
    assert kinds("from funground import sound\n\nx = sound.something\n") == ["set"]
