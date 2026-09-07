
import hashlib
import json
import os
import socket
import sys
import threading
import time
import uuid

from engine import SUITE_ROOT
from engine import read_tool as rt

SCHEMA_VERSION = 2
INLINE_MAX = 2048
PRIOR_TEXT_MAX = 8 * 1024 * 1024

LOGS_DIR = os.path.join(SUITE_ROOT, "logs")
LOG_PATH = os.path.join(SUITE_ROOT, "log.jsonl")

# resolves a region id to its environment's log directory;
# no match, no region, or shell not ade falls back to the shared LOG_PATH
_log_dir_resolver = None


def set_log_dir_resolver(fn):
    global _log_dir_resolver
    _log_dir_resolver = fn


def _log_dir_for_region(region):
    if region is not None and _log_dir_resolver is not None:
        try:
            return _log_dir_resolver(region)
        except Exception:
            return None
    return None


def _log_path_for(shell, log_dir=None):
    if shell == "ade" and log_dir is not None:
        return os.path.join(log_dir, "log.jsonl")
    return LOG_PATH


_BLOB_KINDS = {"prompt", "payload", "out"}
_LOG_LOCK = threading.Lock()

_append_listener = None


def set_append_listener(fn):
    global _append_listener
    _append_listener = fn


def _now_ms():
    return int(time.time() * 1000)


def _local_hostname():
    try:
        import subprocess
        out = subprocess.run(["scutil", "--get", "LocalHostName"],
                             capture_output=True, text=True, timeout=2)
        return out.stdout.strip() or None
    except Exception:
        return None


def _resolve_machine():
    hostname = socket.gethostname()
    machines_path = os.path.join(SUITE_ROOT, "machines.json")
    try:
        with open(machines_path, "r", encoding="utf-8") as f:
            mapping = json.load(f)
    except Exception as exc:
        print(
            f"[ledger] WARNING: machines.json unreadable at {machines_path} "
            f"({exc}) — MACHINE falling back to raw hostname {hostname!r}",
            file=sys.stderr,
        )
        return hostname
    mapped = mapping.get(hostname)
    if mapped is None:
        alt = _local_hostname()
        if alt and mapping.get(alt):
            return mapping[alt]
        print(
            f"[ledger] WARNING: hostname {hostname!r} has no entry in "
            f"{machines_path} — MACHINE falling back to raw hostname. "
            f"Add a row so this machine's records carry a stable name.",
            file=sys.stderr,
        )
        return hostname
    return mapped


MACHINE = _resolve_machine()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def write_blob(rec_id, kind, text, directory=None) -> str | None:
    if kind not in _BLOB_KINDS:
        return None
    try:
        if not isinstance(text, str):
            text = str(text)
        target_dir = directory or LOGS_DIR
        os.makedirs(target_dir, exist_ok=True)
        filename = f"{rec_id}.{kind}.txt"
        full = os.path.join(target_dir, filename)
        with open(full, "w", encoding="utf-8") as f:
            f.write(text)
        return os.path.relpath(full, SUITE_ROOT)
    except Exception:
        return None


def custody(sess, driver="model") -> dict:
    settings = getattr(sess, "settings", None)
    vessel = settings.get("model") if settings else None
    return {
        "machine": MACHINE,
        "session": getattr(sess, "sid", None),
        "shell": getattr(sess, "shell", None),
        "root": getattr(sess, "root", None) or rt.WORKSPACE_ROOT,
        "driver": driver,
        "seat": getattr(sess, "nick", None),
        "vessel": vessel,
        "source": "sandbox-loop",
        "region": getattr(sess, "region", None),
        "track": getattr(sess, "track", None),
        "turn": getattr(sess, "turn", None),
    }


def prior_state(path) -> dict:
    try:
        full = rt._resolve(path)
        if not os.path.isfile(full):
            return {"prior_existed": False, "prior_hash": None,
                    "prior_bytes": 0, "prior": None}
        with open(full, "rb") as f:
            raw = f.read()
    except Exception:
        return {}
    return {
        "prior_existed": True,
        "prior_hash": hashlib.sha256(raw).hexdigest(),
        "prior_bytes": len(raw),
        "prior": (raw.decode("utf-8", errors="replace")
                  if len(raw) <= PRIOR_TEXT_MAX else None),
    }


def _process_prompt(rec_id, prompt):
    if prompt is None:
        return None, None
    if not isinstance(prompt, str):
        prompt = str(prompt)
    if len(prompt.encode("utf-8")) <= INLINE_MAX:
        return prompt, None
    return None, write_blob(rec_id, "prompt", prompt)


def _process_result(rec_id, result):
    if result is None:
        return None, None, 0
    if not isinstance(result, str):
        result = str(result)
    nbytes = len(result.encode("utf-8"))
    if nbytes <= INLINE_MAX:
        return result, None, nbytes
    return None, write_blob(rec_id, "out", result), nbytes


def _blob_oversized_payload(rec_id, payload):
    if not isinstance(payload, dict):
        return payload
    out = dict(payload)
    for key, value in payload.items():
        if isinstance(value, str) and len(value.encode("utf-8")) > INLINE_MAX:
            blob_path = write_blob(rec_id, "payload", value)
            del out[key]
            out[f"{key}_blob"] = blob_path
            break
    return out


def action_record(
    *,
    custody,
    action_type,
    edge=None,
    payload=None,
    hook=None,
    conditions=None,
    answer=None,
    answered_by=None,
    prompt=None,
    parked=None,
    resolved=None,
    outcome=None,
    superseded=False,
    duration_ms=None,
    exit_code=None,
    summary=None,
    result=None,
) -> dict:
    rec_id = new_id()
    prompt_inline, prompt_blob = _process_prompt(rec_id, prompt)
    result_inline, result_blob, result_bytes = _process_result(rec_id, result)
    payload_out = _blob_oversized_payload(rec_id, payload) if payload is not None else None

    return {
        "schema": SCHEMA_VERSION,
        "id": rec_id,
        "kind": "action",
        "machine": custody.get("machine"),
        "session": custody.get("session"),
        "shell": custody.get("shell"),
        "root": custody.get("root"),
        "driver": custody.get("driver"),
        "seat": custody.get("seat"),
        "vessel": custody.get("vessel"),
        "source": custody.get("source"),
        "region": custody.get("region"),
        "track": custody.get("track"),
        "turn": custody.get("turn"),
        "action_type": action_type,
        "edge": edge,
        "payload": payload_out,
        "hook": hook,
        "conditions": conditions,
        "answer": answer,
        "answered_by": answered_by,
        "prompt": prompt_inline,
        "prompt_blob": prompt_blob,
        "parked": parked if parked is not None else _now_ms(),
        "resolved": resolved,
        "outcome": outcome,
        "superseded": superseded,
        "duration_ms": duration_ms,
        "exit_code": exit_code,
        "summary": summary,
        "result": result_inline,
        "result_blob": result_blob,
        "result_bytes": result_bytes,
    }


def turn_record(
    *,
    custody,
    turn,
    started,
    ended,
    usage=None,
    cost_usd=None,
    stop_reason=None,
    actions=None,
) -> dict:
    return {
        "schema": SCHEMA_VERSION,
        "id": new_id(),
        "kind": "turn",
        "machine": custody.get("machine"),
        "session": custody.get("session"),
        "shell": custody.get("shell"),
        "root": custody.get("root"),
        "seat": custody.get("seat"),
        "vessel": custody.get("vessel"),
        "region": custody.get("region"),
        "track": custody.get("track"),
        "turn": turn,
        "started": started,
        "ended": ended,
        "duration_ms": (ended - started) if (started is not None and ended is not None) else None,
        "usage": usage,
        "cost_usd": cost_usd,
        "stop_reason": stop_reason,
        "actions": actions if actions is not None else [],
        "source": custody.get("source"),
    }


def append(record) -> None:
    try:
        line = json.dumps(record, ensure_ascii=False)
    except Exception:
        return
    shell = record.get("shell")
    log_dir = _log_dir_for_region(record.get("region")) if shell == "ade" else None
    try:
        with _LOG_LOCK:
            with open(_log_path_for(shell, log_dir), "a", encoding="utf-8") as f:
                f.write(line + "\n")
    except Exception:
        pass
    if _append_listener is not None:
        try:
            _append_listener(record)
        except Exception:
            pass



def _read_blob(rel_path):
    if not rel_path:
        return None
    try:
        with open(os.path.join(SUITE_ROOT, rel_path), encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


READABLE_SCHEMAS = (1, 2)


def _migrated(r):
    if "region" in r and r.get("schema") == SCHEMA_VERSION:
        return r
    out = dict(r)
    out["region"] = r.get("region") if "region" in r else r.get("track")
    if "region" not in r:
        out["track"] = None
    out["schema"] = SCHEMA_VERSION
    return out


def _scan_log(keep, shell=None, log_dir=None):
    records = []
    try:
        with open(_log_path_for(shell, log_dir), encoding="utf-8") as f:
            for raw in f:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    r = json.loads(raw)
                except Exception:
                    continue
                if r.get("schema") not in READABLE_SCHEMAS:
                    continue
                r = _migrated(r)
                if keep(r):
                    records.append(r)
    except OSError:
        pass
    records.reverse()
    return records


def read_log(limit=None, shell=None, log_dir=None):
    records = _scan_log(lambda r: r.get("kind") == "action", shell=shell, log_dir=log_dir)
    return records[:limit] if limit else records


def _valid_id(rid):
    return (isinstance(rid, str) and len(rid) == 12
            and all(c in "0123456789abcdef" for c in rid))


def pending_as_records(log_dir=None):
    from engine import daemon_queue as dq
    regions = None
    if log_dir is not None:
        from ade import tracks
        regions = set(tracks.list_regions(log_dir))
    out = []
    for e in dq.pending():
        if regions is not None and e.get("session") not in regions:
            continue
        status = dq.condition_status(e)
        conditions = {name: {"answer": ok} for name, ok in status.items()}
        out.append({
            "schema":       SCHEMA_VERSION,
            "id":           e.get("id"),
            "live":         True,
            "kind":         "action",
            "machine":      e.get("machine") or MACHINE,
            "session":      e.get("session"),
            "shell":        e.get("shell"),
            "root":         e.get("root"),
            "driver":       e.get("driver"),
            "seat":         e.get("seat"),
            "vessel":       e.get("vessel"),
            "source":       e.get("source"),
            **_migrated({"schema":   1 if "region" not in e else SCHEMA_VERSION,
                         "track":    e.get("track"),
                         "region":   e.get("region")}),
            "turn":         e.get("turn"),
            "action_type":  e.get("action_type"),
            "edge":         e.get("edge") or e.get("action_type"),
            "payload":      e.get("payload") or {},
            "hook":         e.get("hook"),
            "conditions":   conditions,
            "answer":       None,
            "answered_by":  None,
            "prompt":       e.get("prompt"),
            "prompt_blob":  e.get("prompt_blob"),
            "parked":       e.get("parked"),
            "resolved":     None,
            "outcome":      None,
            "superseded":   e.get("superseded", False),
            "duration_ms":  None,
            "exit_code":    None,
            "summary":      e.get("summary"),
            "result":       None,
            "result_blob":  None,
            "result_bytes": 0,
        })
    return out


def _carry_gate_prompt(E, G):
    if E.get("gate_prompt") is None:
        E["gate_prompt"] = G.get("prompt")
        E["gate_prompt_blob"] = G.get("prompt_blob")


def _pair_gates(records):
    by_id = {r.get("id"): r for r in records}
    for E in records:
        gid = E.get("gate_id")
        if gid:
            G = by_id.get(gid)
            if G is not None:
                G["merged"] = True
                _carry_gate_prompt(E, G)
    for i in range(len(records) - 1):
        E, G = records[i], records[i + 1]
        if (not E.get("gate_id")
                and G.get("action_type") == "gate" and G.get("outcome") == "fired"
                and not G.get("merged")
                and E.get("action_type") not in (None, "gate")
                and E.get("action_type") == G.get("edge")):
            E["gate_id"] = G["id"]
            E["gate_hook"] = G.get("hook")
            E["gate_answer"] = G.get("answer")
            E["edge"] = E.get("edge") or G.get("edge")
            G["merged"] = True
            _carry_gate_prompt(E, G)


def _pair_tool_use(records):
    opens = {}
    for r in records:
        if (r.get("action_type", "").startswith("claude_hook:")
                and r.get("outcome") is None):
            tuid = (r.get("payload") or {}).get("tool_use_id")
            if tuid:
                opens[tuid] = r
    for r in records:
        if not r.get("action_type", "").startswith("claude_hook_result:"):
            continue
        tuid = (r.get("payload") or {}).get("tool_use_id")
        O = opens.get(tuid) if tuid else None
        if O is None or O.get("merged"):
            continue
        O["merged"] = True
        r["tool_use_open_id"] = O["id"]
        r["edge"] = O.get("edge") or r.get("edge")
        r["gate_hook"] = O.get("hook")
        if r.get("prompt") is None:
            r["prompt"] = O.get("prompt")
            r["prompt_blob"] = O.get("prompt_blob")
        _translate_rail_c_write(r, O)


_RAIL_C_MOVED = ("originalFile", "content", "oldString", "newString")


def _translate_rail_c_write(E, O):
    p = E.get("payload")
    tr = p.get("tool_response") if isinstance(p, dict) else None
    if not isinstance(tr, dict):
        return
    tool = (E.get("action_type") or "").split(":", 1)[-1]
    if tool not in ("Write", "Edit"):
        return

    path = tr.get("filePath")
    if not path:
        ti = (O.get("payload") or {}).get("tool_input") or {}
        path = ti.get("file_path") or ti.get("path")
    if not path:
        return

    prior = tr.get("originalFile")
    written = None
    if tool == "Write":
        written = tr.get("content")
    else:
        old, new = tr.get("oldString"), tr.get("newString")
        if isinstance(prior, str) and isinstance(old, str) and isinstance(new, str) and old:
            if tr.get("replaceAll"):
                written = prior.replace(old, new)
            elif prior.count(old) == 1:
                written = prior.replace(old, new, 1)

    prior_existed = (tr.get("type") != "create") if tool == "Write" else True

    slim = {k: v for k, v in tr.items() if k not in _RAIL_C_MOVED}
    E["payload"] = dict(p, path=path, prior=prior,
                        prior_existed=prior_existed, tool_response=slim)
    if written is not None and E.get("result") is None:
        E["result"] = written
    E["action_type"] = "write"


def snapshot(limit=None, shell=None, log_dir=None):
    by_id = {}
    log_records = read_log(shell=shell, log_dir=log_dir)
    _pair_gates(log_records)
    _pair_tool_use(log_records)
    for r in log_records:
        rid = r.get("id")
        if r.get("merged") and (r.get("action_type") or "").startswith("claude_hook:"):
            continue
        if rid and rid not in by_id:
            by_id[rid] = r
    for r in pending_as_records(log_dir=log_dir):
        rid = r.get("id")
        if not rid:
            continue
        prior = by_id.get(rid)
        if prior is None or prior.get("outcome") in (None, "parked"):
            by_id[rid] = r
    records = sorted(by_id.values(),
                     key=lambda r: r.get("parked") or 0, reverse=True)
    for r in records:
        if (r.get("action_type") == "gate" and r.get("outcome") is None
                and not r.get("live")):
            r["outcome"] = "parked"
            r.setdefault("answered_by", "abandoned")
    newest_by_region = {}
    for r in records:
        reg, ts = r.get("region"), (r.get("parked") or 0)
        if reg and ts > newest_by_region.get(reg, 0):
            newest_by_region[reg] = ts
    for r in records:
        if (r.get("outcome") is None and not r.get("live")
                and (r.get("action_type") or "").startswith("claude_hook:")):
            reg = r.get("region")
            if reg and (r.get("parked") or 0) < newest_by_region.get(reg, 0):
                r["outcome"] = "parked"
                if r.get("answered_by") is None:
                    r["answered_by"] = "abandoned"
    return records[:limit] if limit else records


def _derive_turn_usage(usage):
    if not isinstance(usage, dict):
        return usage
    calls = usage.get("calls") or []
    if not calls:
        return usage
    reads = [int(c.get("cache_read", 0) or 0) for c in calls]
    usage["cache_read_billed"] = sum(reads)
    usage["cache_read_peak"] = max(reads)
    usage["cache_write_5m"] = sum(int(c.get("cache_write_5m", 0) or 0) for c in calls)
    usage["cache_write_1h"] = sum(int(c.get("cache_write_1h", 0) or 0) for c in calls)
    return usage


def ade_snapshot(limit=None, since=None, log_dir=None):
    records = [r for r in snapshot(shell="ade", log_dir=log_dir) if r.get("shell") == "ade"]
    turns   = _scan_log(lambda r: r.get("kind") == "turn" and r.get("shell") == "ade",
                        shell="ade", log_dir=log_dir)
    for t in turns:
        _derive_turn_usage(t.get("usage"))
    merged  = sorted(records + turns,
                     key=lambda r: r.get("parked") or r.get("started") or 0,
                     reverse=True)
    if since:
        merged = [r for r in merged
                  if (r.get("parked") or r.get("started") or 0) >= since
                  or (r.get("kind") == "action" and r.get("outcome") is None)]
    return merged[:limit] if limit else merged


def region_totals(since=None, log_dir=None):
    out = {}
    for t in ade_snapshot(since=since, log_dir=log_dir):
        if t.get("kind") != "turn":
            continue
        reg = t.get("region")
        if not reg:
            continue
        u = t.get("usage") or {}
        billed = u.get("cache_read_billed")
        peak   = u.get("cache_read_peak")
        if billed is None:
            billed = u.get("cache_read")
        if peak is None:
            peak = u.get("cache_read")
        e = out.setdefault(reg, {"region": reg, "track": t.get("track"),
                                 "turns": 0, "read_billed": 0, "read_peak": 0,
                                 "write_5m": 0, "write_1h": 0, "out": 0,
                                 "cost_usd": 0.0})
        e["turns"]       += 1
        e["read_billed"] += int(billed or 0)
        e["read_peak"]    = max(e["read_peak"], int(peak or 0))
        e["write_5m"]    += int(u.get("cache_write_5m") or 0)
        e["write_1h"]    += int(u.get("cache_write_1h") or 0)
        e["out"]         += int(u.get("out_tokens") or 0)
        e["cost_usd"]    += float(t.get("cost_usd") or 0.0)
    return out


def detail(rid, shell=None, log_dir=None):
    rec = _find_record(rid, shell, log_dir)
    if rec is None:
        return None
    d = dict(rec)
    if d.get("prompt") is None:
        d["prompt"] = _read_blob(d.get("prompt_blob"))
    if d.get("result") is None:
        d["result"] = _read_blob(d.get("result_blob"))
    payload = d.get("payload")
    if isinstance(payload, dict) and payload.get("prior") is None and payload.get("prior_blob"):
        d["payload"] = dict(payload, prior=_read_blob(payload["prior_blob"]))
    if d.get("gate_prompt") is None and d.get("gate_id"):
        g = _find_record(d["gate_id"], shell, log_dir)
        if g is not None:
            d["gate_prompt"] = g.get("prompt") or _read_blob(g.get("prompt_blob"))
    return d


def _find_record(rid, shell=None, log_dir=None):
    if not _valid_id(rid):
        return None
    rec = next((r for r in pending_as_records(log_dir=log_dir) if r.get("id") == rid), None)
    if rec is None and shell is not None:
        rec = next((r for r in read_log(shell=shell, log_dir=log_dir) if r.get("id") == rid), None)
    if rec is None:
        rec = next((r for r in read_log() if r.get("id") == rid), None)
    return rec


def _deny_orphan(entry_id, log_dir=None):
    orig = next((r for r in read_log() if r.get("id") == entry_id), None)
    if orig is None and log_dir is not None:
        orig = next((r for r in read_log(shell="ade", log_dir=log_dir) if r.get("id") == entry_id), None)
    if orig is None:
        return
    rec = dict(orig)
    rec["answer"] = False
    rec["answered_by"] = "human"
    rec["outcome"] = "denied"
    rec["resolved"] = _now_ms()
    append(rec)


def apply_action(action, entry_id, payload=None):
    from engine import daemon_queue as dq
    if action == "approve":
        dq.answer_gate(entry_id, True)
        dq.notify("gate_answered")
    elif action == "deny":
        if dq.deny(entry_id) is None:
            _deny_orphan(entry_id)
    elif action == "edit":
        dq.update_payload(entry_id, payload or {})
    elif action == "delete":
        dq.delete(entry_id)
    elif action == "unsupersede":
        dq.unsupersede(entry_id)
