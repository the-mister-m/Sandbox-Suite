
import json


class ConfSenders:
    def send_room_init(self, participants, mode):
        with self._send_lock:
            self.ws.send(json.dumps({
                "type": "room_init",
                "participants": participants,
                "mode": mode,
            }))

    def send_room_entry(self, entry):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "room_entry", "entry": entry}))

    def send_room_reset(self):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "room_reset"}))

    def send_room_status(self, model, phase):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "room_status", "model": model, "phase": phase}))

    def send_room_queue(self, bids):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "room_queue", "bids": bids}))

    def send_crew_list(self, roster, current):
        with self._send_lock:
            self.ws.send(json.dumps({"type": "crew_list", "list": roster, "current": current}))
