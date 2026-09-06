
import json


class IdeSenders:
    def send_file(self, path, content):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "file", "path": path, "content": content}))

    def send_tree(self, data):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "tree", "data": data}))

    def send_saved(self, path, result):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "saved", "path": path, "result": result}))

    def send_deleted(self, path, result):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "deleted", "path": path, "result": result}))

    def send_moved(self, src, dst, result):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "moved", "src": src, "dst": dst, "result": result}))

    def send_renamed(self, src, dst, result):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "renamed", "src": src, "dst": dst, "result": result}))

    def send_made(self, path, result):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "made", "path": path, "result": result}))

    def on_write(self, path):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "saved", "path": path, "result": ""}))

    def send_crew_list(self, roster, current):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "crew_list", "list": roster, "current": current}))
