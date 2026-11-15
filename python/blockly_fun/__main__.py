"""`python -m blockly_fun`: reads {"sources": [text, ...]} as JSON on stdin and writes [convert(text), ...] as JSON.

One process converts many programs, so a test (tests/roundtrip.test.js) does not start Python once per program.
"""

import json
import sys

from .to_blocks import convert


def main() -> None:
    request = json.load(sys.stdin)
    json.dump([convert(source) for source in request["sources"]], sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
