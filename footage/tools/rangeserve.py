"""Static file server with HTTP Range support (Meta's video fetcher asks for byte ranges).
usage: python3 rangeserve.py PORT   (serves the current directory on 127.0.0.1)"""
import http.server, os, re, sys

class H(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        ctype = self.guess_type(path)
        m = re.match(r"bytes=(\d*)-(\d*)$", self.headers.get("Range", "").strip())
        f = open(path, "rb")
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else size - 1
            else:
                a = max(0, size - int(m.group(2))); b = size - 1
            b = min(b, size - 1)
            if a > b:
                f.close(); self.send_error(416); return None
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {a}-{b}/{size}")
            self.send_header("Content-Length", str(b - a + 1))
            f.seek(a); self._left = b - a + 1
        else:
            self.send_response(200)
            self.send_header("Content-Length", str(size)); self._left = size
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return f

    def copyfile(self, src, dst):
        left = getattr(self, "_left", None)
        while left is None or left > 0:
            chunk = src.read(min(1 << 20, left) if left is not None else 1 << 20)
            if not chunk:
                break
            dst.write(chunk)
            if left is not None:
                left -= len(chunk)

    def log_message(self, fmt, *a):
        sys.stderr.write("%s %s\n" % (self.headers.get("Range", "-"), fmt % a))

http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
