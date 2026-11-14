"""Serve this repository on http://localhost:8765/ (127.0.0.1 only) for the demo and for headless Chrome checks.

    .venv/Scripts/python.exe tools/serve.py [--port 8765]

Not `python -m http.server`: on the maintainer's Windows machine it sends each file in one write and Chrome's
connection is reset partway through a large one (Blockly is 640 KB). This is the standard server with two changes:
it writes in 64 KB pieces and speaks HTTP/1.1 (keep-alive). Stop it with Ctrl+C.
"""
import argparse
import functools
import http.server
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CHUNK = 65536


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript"}

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
    port = parser.parse_args().port
    server = Server(("127.0.0.1", port), functools.partial(Handler, directory=str(REPO)))
    print(f"Serving {REPO} at http://localhost:{port}/  (demo: http://localhost:{port}/demo/index.html). Ctrl+C stops it.",
          flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
