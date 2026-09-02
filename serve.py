#!/usr/bin/env python3
"""Local dev server for Globe Quest with browser caching turned OFF.

Why: the plain `python -m http.server` lets the browser cache CSS/JS, so edits
often don't show up until a hard reload (⌘⇧R). Sending no-cache headers makes a
normal reload (⌘R) always fetch the latest files. This only affects local dev;
deploying to Vercel/Netlify uses their own (correct) caching.

Run:  python3 serve.py     (serves this folder on http://localhost:8732)
"""
import http.server
import os
import socketserver

PORT = 8732
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"Globe Quest dev server (no-cache) on http://localhost:{PORT}")
        httpd.serve_forever()
