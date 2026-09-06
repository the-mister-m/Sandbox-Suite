
import json


def _names_map(regions):
    names = {}
    try:
        from ade import tracks as _tracks
        for row in _tracks.closed_rows():
            rid = row.get("id")
            if rid:
                names[rid] = row.get("name") or rid
    except Exception:
        pass
    for r in (regions or []):
        rid = getattr(r, "id", None)
        if rid:
            names[rid] = getattr(r, "name", None) or rid
    return names


def _region_row(track):
    return {
        "id":       track.id,
        "track":    track.track,
        "node_id":  track.node_id,
        "name":     track.name,
        "model":    track.model,
        "seat":     track.seat,
        "root":     track.root,
        "created":  track.created,
        "provider":   track.provider,
        "loop_class": track.loop_class,
        "mechanism":  track.mechanism,
        "muted":    getattr(track, "muted", False),
        "settings": dict(track.sess.settings),
        "overlay":  track.overlay_rows,
        "region":   dict(track.carried),
    }


def _track_row(track):
    return {
        "id":         track.id,
        "name":       track.name,
        "regions":    list(track.regions),
        "root":       track.root,
        "overlay":    track.overlay_rows,
        "provider":   track.provider,
        "loop_class": track.loop_class,
        "mechanism":  track.mechanism,
        "created":    track.created,
    }


class AdeSenders:
    def send_crew_list(self, roster, current):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "crew_list", "list": roster, "current": current}))

    def send_gate_edges(self, edges):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "gate_edges", "edges": edges}))

    def send_rail_catalog(self, catalog):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "rail_catalog", "catalog": catalog}))

    def send_ade_init(self, session_meta, regions, track_rows=None):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "ade_init",
                "session": session_meta,
                "tracks": [_region_row(t) for t in regions],
                "rows":   [_track_row(t) for t in (track_rows or [])],
                "names":  _names_map(regions),
            }))

    def send_track_list(self, regions, track_rows=None):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "track_list",
                "tracks": [_region_row(t) for t in regions],
                "rows":   [_track_row(t) for t in (track_rows or [])],
                "names":  _names_map(regions),
            }))

    def send_region_replaced(self, old_id, new_id):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type":   "region_replaced",
                "old_id": old_id,
                "new_id": new_id,
            }))

    def send_track_created(self, region, track=None):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "track_created",
                "track": _region_row(region),
                "row":   _track_row(track) if track is not None else None,
            }))

    def send_reload(self, reason=""):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "reload", "reason": reason}))

    def send_track_removed(self, track_id):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "track_removed", "id": track_id}))

    def send_track_transcript(self, track_id, messages):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "track_transcript",
                "id": track_id,
                "messages": messages,
            }))

    def send_chat_history(self, track_id, records):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "chat_history",
                "id": track_id,
                "records": records,
            }))

    def send_transcript(self, track_id, messages):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "transcript",
                "id": track_id,
                "messages": messages,
            }))

    def send_feed(self, records, totals=None):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "feed", "records": records,
                                     "totals": totals or {}}))

    def send_wp_feed(self, lines, counts):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "wp_feed", "lines": lines, "counts": counts}))

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

    def send_feed_dirty(self, stores):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "feed_dirty", "stores": stores}))

    def send_activity(self, evt):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "activity", "event": evt}))

    def send_tree_dirty(self, track_id):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "tree_dirty", "track": track_id}))

    def send_track_status(self, track_id, phase):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "track_status", "track": track_id, "phase": phase,
            }))

    def send_context_warn(self, track_id, peak, cap):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "context_warn", "track": track_id,
                "peak": peak, "cap": cap,
            }))

    def send_gate_broadcast(self, kind, gid, prompt, track_id, track_name):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "gate_broadcast", "kind": kind, "id": gid,
                "prompt": prompt, "track": track_id, "track_name": track_name,
            }))

    def on_write(self, path):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "saved", "path": path, "result": ""}))
