
import json
import os
import re
import time

from engine import SUITE_ROOT

BASE        = SUITE_ROOT
INJECTIONS  = os.path.join(BASE, "injections")
AGENT_DIR   = os.path.join(BASE, "agent")
ROSTER_PATH = os.path.join(AGENT_DIR, "roster.json")

_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_APPLIES = re.compile(r"\*\*Applies:\*\*\s*(.+?)\s*\n\*\*Constrains:", re.DOTALL)

_VESSEL_FAMILY_RE = re.compile(r"^([A-Za-z]+)([0-9][0-9.]*)?")
_VESSEL_SIZE_RE    = re.compile(r"\d+[bB]")
_VESSEL_QUANT_RE   = re.compile(r"q\d+|mxfp\d+|f16|fp16|bf16", re.IGNORECASE)
_NON_TAG_CHARS_RE  = re.compile(r"[^A-Z0-9]")


def vessel_handle(model_id):
    model_id = model_id or ""
    before_colon = model_id.split(":", 1)[0]

    fm = _VESSEL_FAMILY_RE.match(before_colon)
    family = ""
    if fm:
        letters, digits = fm.group(1) or "", fm.group(2) or ""
        family = (letters[0].upper() if letters else "") + digits.replace(".", "")

    sm = _VESSEL_SIZE_RE.search(model_id)
    size = sm.group(0).upper() if sm else ""

    qm = _VESSEL_QUANT_RE.search(model_id)
    quant = _NON_TAG_CHARS_RE.sub("", qm.group(0).upper()) if qm else ""

    handle = _NON_TAG_CHARS_RE.sub("", (family + size + quant).upper())
    return handle or "??"


def _derive_tag(nick):
    if not nick:
        return "??"
    for ch in str(nick):
        if ch.isalnum():
            return ch.upper() + "0"
    return "??"


def resolve_tag(nick):
    if not nick:
        return "??"
    for name, entry in load_roster().items():
        if name.lower() == str(nick).lower():
            return entry.get("tag") or _derive_tag(name)
    return _derive_tag(nick)


def roster_entries():
    return [{"nick": name, "tag": entry.get("tag") or _derive_tag(name)}
            for name, entry in load_roster().items()]


def _crew_tags_line():
    pairs = [f"{e['tag']}={e['nick']}" for e in roster_entries()]
    return ", ".join(pairs) if pairs else "(no roster entries yet)"


def _legend_block(nick, model):
    this_tag    = resolve_tag(nick)
    this_vessel = vessel_handle(model)
    return (
        "## Who is speaking (conversation labels)\n\n"
        "Turns in this conversation are grouped by handover lines of the form\n"
        "\"==== handover -> TAG/VESSEL ====\". TAG is the crew member; VESSEL is the model.\n"
        f"  Crew tags: {_crew_tags_line()}\n"
        "  Vessel tags are model handles, e.g. O35BQ8 = ornith:35b-q8_0.\n"
        f"YOU are {this_tag}/{this_vessel} right now. Turns under a handover line whose TAG/VESSEL\n"
        "differ from yours were spoken by a different crew member or a different model — not you,\n"
        "even when the words are in the assistant voice."
    )


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return ""
    return text.strip() if _COMMENT.sub("", text).strip() else ""


def load_roster():
    try:
        with open(ROSTER_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def resolve_agent(nick):
    if not nick:
        return None
    for name, entry in load_roster().items():
        if name.lower() == str(nick).lower():
            folder = os.path.join(AGENT_DIR, entry.get("folder", name.lower()))
            return folder if os.path.isdir(folder) else None
    return None


def _model_blurb(model):
    tag = re.sub(r"[:/]", "-", model or "")
    return _read(os.path.join(INJECTIONS, "models", f"{tag}.md"))


def _names(clause):
    return [p.strip().lower() for p in clause.split("/") if p.strip()]


def _seat_matches(seat_clause, nick, has_folder):
    c = seat_clause.strip().lower()
    if c == "every seat":
        return True
    if c == "every seat with an agent folder":
        return has_folder
    return bool(nick) and nick.lower() in _names(seat_clause)


def _applies(text, nick, has_folder):
    m = _APPLIES.search(text)
    if not m:
        return True
    line = re.sub(r"\([^)]*\)", "", m.group(1)).strip().rstrip(".")
    seat_clause = line.split(",")[0].strip()
    if not seat_clause:
        return True
    return _seat_matches(seat_clause, nick, has_folder)


def _skills(nick, has_folder):
    d = os.path.join(INJECTIONS, "skills")
    try:
        names = sorted(os.listdir(d))
    except OSError:
        return []
    out = []
    for n in names:
        if not n.endswith(".md") or n.startswith("_"):
            continue
        t = _read(os.path.join(d, n))
        if t and _applies(t, nick, has_folder):
            out.append(t)
    return out


_peers_provider = None


def set_peers_provider(fn):
    global _peers_provider
    _peers_provider = fn


def self_block(region_id, region_name):
    if not region_id:
        return ""
    name = region_name or "(unnamed)"
    return ("## Who you are here\n\n"
            f"In the ADE you are the region named {name}, and your exact id is "
            f"{region_id}.\n"
            "That id is your ADDRESS: it is what another agent writes to when "
            "it messages you, it is the sender stamped on everything you send, "
            "and it is how you appear in someone else's peer list. Your name is "
            "a label the Captain can change; the id does not change while you "
            "live.")


def _peers_block(rows, region_id=None):
    if not rows:
        return ""
    out = ["## Your peers\n",
           "Other live agents (tracks) you can message. Prefer the EXACT id below "
           "(guaranteed to land); a unique name or seat of a live peer also "
           "resolves. An unknown or ambiguous label is dropped and the peer never "
           "hears you.\n",
           "One row may be seated as 'the human'. That row is not an agent: he "
           "reads when he looks, he answers only if he chooses to, and nothing "
           "you send starts a turn for him. Write to him when he needs to know "
           "something — never wait on a reply from him before you continue.\n",
           "THIS LIST WAS TAKEN WHEN YOU SAT DOWN AND IT DOES NOT UPDATE. Agents "
           "join and leave while you work. Two things in your conversation are "
           "always current and OUTRANK this list: the header on every message "
           "that arrives for you, and the report that comes back when you send "
           "one — both name the room as it stands at that moment. Trust those "
           "over this.\n",
           "YOUR PEERS (message by the EXACT id):"]
    for r in rows:
        rid  = r.get("id", "")
        name = r.get("name") or "(unnamed)"
        seat = r.get("seat") or "no seat"
        if region_id and rid == region_id:
            out.append(f"  {rid} · {name} · {seat} · ← THIS IS YOU, do not "
                       "send to this id")
        else:
            out.append(f"  {rid} · {name} · {seat}")
    return "\n".join(out)


def root_note(root):
    return (f"Your workspace root is: {root}. Relative paths resolve there. "
            "Reaching outside the workspace needs approval each time.")


# provider tool_mode without a Router instance: the classes carry it
def _tool_mode(model):
    try:
        from engine import providers
    except Exception:
        return "text"
    kind = providers._provider_for(model or "")
    for cls in (providers.OllamaProvider, providers.GeminiProvider,
                providers.ClaudeProvider):
        if getattr(cls, "id", None) == kind:
            return getattr(cls, "tool_mode", "text")
    return "text"


def _capabilities(model):
    from engine import tools
    if _tool_mode(model) == "native":
        return ("You have these tools: " + ", ".join(tools.tool_names())
                + ". A human approves before a gated one runs.")
    return tools.text_hint()


def build_context(sess, *, root, region_id, region_name, task=""):
    nick = getattr(sess, "nick", None)
    model = (getattr(sess, "settings", None) or {}).get("model", "")

    sys_parts = []

    t = _read(os.path.join(INJECTIONS, "global", "preamble.md"))
    if t:
        sys_parts.append(t)

    if nick:
        sys_parts.append(_legend_block(nick, model))

    t = _model_blurb(model)
    if t:
        sys_parts.append("## Your current vessel\n\n" + t)
    else:
        sys_parts.append("## Your current vessel\n\n"
                          f"Your current vessel is `{model}` (handle {vessel_handle(model)}).")

    sys_parts.append("## Your capabilities\n\n" + _capabilities(model)
                     + "\n\n" + root_note(root))

    block = self_block(region_id, region_name)
    if block:
        sys_parts.append(block)

    if _peers_provider is not None:
        try:
            block = _peers_block(_peers_provider(), region_id)
        except Exception:
            block = ""
        if block:
            sys_parts.append(block)

    folder = resolve_agent(nick)
    if folder:
        p = _read(os.path.join(folder, "persona.md"))
        if p:
            sys_parts.append("## Your persona\n\n" + p)
        um = _read(os.path.join(folder, "usermemory.md"))
        if um:
            sys_parts.append("## Memories the Captain holds for you\n\n" + um)
        am = _read(os.path.join(folder, "agentmemory.md"))
        if am:
            sys_parts.append("## Your own memories\n\n" + am)
        sys_parts.append(
            f"Your full long-form memory store is the folder "
            f"{os.path.join(folder, 'memories')}. Each entry above links to its "
            "full version there. To search everything you've written, use the "
            "recall tool.")
    elif nick:
        sys_parts.append(f"## Who you are\n\nYou are {nick}, a crew member aboard.")

    ctx_parts = []

    t = _read(os.path.join(INJECTIONS, "session", "ade.md"))
    if t:
        ctx_parts.append(t)
    ctx_parts.extend(_skills(nick, bool(folder)))

    if task:
        ctx_parts.append(task)

    joiner = "\n\n---\n\n"
    return joiner.join(sys_parts), joiner.join(ctx_parts)



def _anchor_slug(heading):
    s = re.sub(r"[^a-z0-9 -]", "", str(heading).lower())
    return s.replace(" ", "-")


def remember(nick, title, carry, body, pin):
    folder = resolve_agent(nick)
    if not folder:
        return None
    mem_dir = os.path.join(folder, "memories")
    os.makedirs(mem_dir, exist_ok=True)
    date = time.strftime("%Y-%m-%d")
    path = os.path.join(mem_dir, f"{date}.md")
    is_new = not os.path.exists(path)
    heading = f"{time.strftime('%H:%M')} — {title}"
    with open(path, "a", encoding="utf-8") as f:
        if is_new:
            f.write(f"# {date}\n\n")
        f.write(f"## {heading}\n\n{body.strip()}\n\n---\n\n")

    if pin in ("user", "agent"):
        anchor = _anchor_slug(heading)
        line = (f"- **{title}** — {' '.join(carry.split())}  "
                f"([full](memories/{date}.md#{anchor}))\n")
        target = "usermemory.md" if pin == "user" else "agentmemory.md"
        with open(os.path.join(folder, target), "a", encoding="utf-8") as f:
            f.write(line)
    return path
