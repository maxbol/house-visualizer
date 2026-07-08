#!/usr/bin/env python3
"""Static file server with caching disabled, so edits to plan JSONs and JS
modules always reach the browser on plain reload."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import sys

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8741


class NoStoreHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


print(f"serving on http://127.0.0.1:{port}/web/ (no-store)")
ThreadingHTTPServer(("127.0.0.1", port), NoStoreHandler).serve_forever()
