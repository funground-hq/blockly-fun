# blockly-fun

Blocks that say Scratch's words and make real Python, and Python that opens as blocks.

blockly-fun is a bridge from Scratch to Python. You build a program with blocks that read like Scratch
("repeat 10 times"), and each block shows the Python it makes (`for _ in range(10):`). Switch to the Python text
at any time, change it, and switch back to blocks. The file you keep is always an ordinary Python file: it runs
anywhere Python runs.

It is built with [Blockly](https://developers.google.com/blockly) and Python's own `ast` module, and it is made to be
embedded: in funground's Play first, and in other editors later.

## Status

Early work. The first version covers the basic Python language: saying and asking, variables, numbers, `if`, loops,
lists and your own functions. Nothing is ready to use yet.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
