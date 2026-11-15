"""Serve this repository on http://localhost:8765/ (127.0.0.1 only) for the demo and for headless Chrome checks.

    .venv/Scripts/python.exe tools/serve.py [--port 8765] [--runner ../funground-web/runner]

Not `python -m http.server`: on the maintainer's Windows machine it sends each file in one write and Chrome's
connection is reset partway through a large one (Blockly is 640 KB). This is the standard server with two changes:
it writes in 64 KB pieces and speaks HTTP/1.1 (keep-alive). Stop it with Ctrl+C.

Phase C: /runner/ is funground-web's browser runner, from a checkout of it (default: the sibling folder
../funground-web/runner). Only the files in RUNNER_FILES are served from there: this project keeps its own list of what
it uses. With `packages: []` the runner loads Pyodide alone, from jsDelivr, so no runtime/ folder is needed.
"""
import argparse
import functools
import http.server
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CHUNK = 65536
DEFAULT_RUNNER = REPO.parent / "funground-web" / "runner"

# What the demo uses of funground-web's runner: runner.js and what it imports. The worker loads nothing else of the
# runner's own for plain Python (models-*.js only for ml.pose() and the rest, which plain Python never calls).
RUNNER_FILES = ("runner.js", "worker.js", "audio.js", "camera.js", "microphone-worklet.js")


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript"}

    runner = None   # the runner's folder, or None

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/runner/"):
            name = clean[len("/runner/"):]
            if self.runner and name in RUNNER_FILES:
                return str(self.runner / name)
            return str(REPO / "missing" / "runner-file")   # not ours to serve: 404
        return super().translate_path(path)

    def end_headers(self):
        # Always ask again: without this, Chrome reuses an old index.html with a new demo.js after a branch switch
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def copyfile(self, source, outputfile):
        shutil.copyfileobj(source, outputfile, CHUNK)
        outputfile.flush()


class Server(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], ConnectionError):   # Chrome closing an idle keep-alive connection is normal
            super().handle_error(request, client_address)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--runner", type=Path, default=DEFAULT_RUNNER,
                        help="funground-web's runner/ folder (default: %(default)s)")
    options = parser.parse_args()
    port = options.port
    Handler.runner = options.runner.resolve() if (options.runner / "runner.js").is_file() else None
    server = Server(("127.0.0.1", port), functools.partial(Handler, directory=str(REPO)))
    print(f"Serving {REPO} at http://localhost:{port}/  (demo: http://localhost:{port}/demo/index.html). Ctrl+C stops it.",
          flush=True)
    print(f"Runner: {Handler.runner}" if Handler.runner else
          f"No runner at {options.runner}: the demo shows blocks and Python, but cannot run or convert.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
