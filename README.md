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

## On a phone

`createBlocksEditor({ element, layout })` takes `layout: "wide"` (the default: the kinds of blocks are a column of icons on
the left) or `layout: "phone"` (a row along the bottom, within reach of a thumb; each kind is 44 px square, the row
scrolls sideways, and a tap opens its blocks above the row). The page decides. The rule (BF-D-049) is that a phone is a
screen whose narrow side is under 600 CSS px; `isPhoneScreen(screen.width, screen.height)` asks it.

`editor.layout("phone")` changes the layout of an open editor. The program stays and the Python does not change. The undo
history does not stay: it belongs to the old workspace. `editor.layout()` says which layout is in use.

`demo/phone.html` shows it (it needs `npm run build`), and `node tools/phone_check.mjs` checks it in Chrome with a
touch screen at 360 x 720.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
