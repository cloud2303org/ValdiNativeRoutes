"""Serve a supplied pinned archive for an isolated Bazel parser probe."""

import functools
import http.server
import sys


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


handler = functools.partial(QuietHandler, directory=sys.argv[1])
with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
    print(server.server_port, flush=True)
    server.serve_forever()
