#!/usr/bin/env python3
"""Loopback-only HTTP fixture. The Swift tests publish ephemeral signed files here."""
import argparse
import http.server
import json
import pathlib
import socket
import threading
import time
import urllib.parse

parser = argparse.ArgumentParser()
parser.add_argument("root", type=pathlib.Path)
args = parser.parse_args()
lock = threading.Lock()


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        with lock:
            with (args.root / "requests.jsonl").open("a") as log:
                log.write(json.dumps({"path": path, "query": urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query), "headers": dict(self.headers)}) + "\n")
        controls = args.root / "controls.json"
        rules = json.loads(controls.read_text()) if controls.exists() else {}
        rule = rules.get(path, {})
        if rule.get("delay"):
            time.sleep(rule["delay"])
        status = rule.get("status", 200)
        if status == 302:
            self.send_response(302)
            self.send_header("Location", rule.get("location", "/redirect-target"))
            self.end_headers()
            return
        file = args.root / path.lstrip("/")
        if not file.is_file():
            self.send_error(404)
            return
        body = file.read_bytes()
        self.send_response(status)
        if rule.get("encoding"):
            self.send_header("Content-Encoding", rule["encoding"])
        if not rule.get("omitLength"):
            self.send_header("Content-Length", str(rule.get("length", len(body))))
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()
        try:
            if rule.get("interrupt"):
                self.wfile.write(body[: max(1, len(body) // 2)])
                self.wfile.flush()
                self.connection.shutdown(socket.SHUT_RDWR)
                return
            chunk = rule.get("chunk", 4096)
            for offset in range(0, len(body), chunk):
                self.wfile.write(body[offset:offset + chunk])
                self.wfile.flush()
                if rule.get("chunkDelay"):
                    time.sleep(rule["chunkDelay"])
        except (BrokenPipeError, ConnectionResetError):
            pass


server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
(args.root / "port").write_text(str(server.server_port))
server.serve_forever()
