
import json
import os
import time

from engine import SUITE_ROOT


def rooms_dir():
    return os.path.join(SUITE_ROOT, "rooms")


def persist_room(room, name):
    d = rooms_dir()
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, f"{name}.json")
    snap = room.snapshot()
    first_human = next((e["content"] for e in snap["transcript"]
                        if e.get("role") == "user"), "")
    with open(path, "w") as fh:
        json.dump({
            "id":       name,
            "kind":     "room",
            "saved_ts": int(time.time() * 1000),
            "preview":  (first_human[:80].replace("\n", " ")
                         if isinstance(first_human, str) else ""),
            **snap,
        }, fh)
    return path
