#!/usr/bin/env python3
"""
Claude Code capture hook -> .agent-logs/

Fires on UserPromptSubmit (the prompt) and Stop (the final response).
Writes one markdown file per session. Never prints to stdout (stdout on
UserPromptSubmit is injected into Claude's context) and always exits 0 so a
capture failure can never break a session.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------- config ---
# Edit these two, or set AGENT_LOG_AUTHOR / AGENT_LOG_PROJECT in your env.
AUTHOR = os.environ.get("AGENT_LOG_AUTHOR", "ark-09")
PROJECT = os.environ.get("AGENT_LOG_PROJECT", "")  # "" -> repo directory name
TOOL = "claude-code"

# Claude Code sends its own internal background requests through
# UserPromptSubmit (conversation summaries, titles). Each gets a fresh
# session_id, so without this filter every one creates a junk log file.
IGNORED_PROMPT_PREFIXES = (
    "Context: This summary will be shown in a list",
    "Please write a 5-10 word title",
    "Analyze this conversation and generate",
)
# ---------------------------------------------------------------------------

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.S)
RESPONSE_NUM_RE = re.compile(r"\[LOG_ENTRY type=RESPONSE num=(\d+)(?:-(\d+))?")
FM_ORDER = [
    "session_id", "date", "author", "model", "tool",
    "project", "total_exchanges", "first_prompt_time", "last_prompt_time",
]


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def project_dir():
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env and Path(env).is_dir():
        return Path(env)
    # .../<repo>/.claude/hooks/capture.py -> <repo>
    return Path(__file__).resolve().parents[2]


def _iter_transcript(path):
    if not path:
        return
    p = Path(path)
    if not p.is_file():
        return
    try:
        with p.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except ValueError:
                    continue
    except OSError:
        return


def model_from_transcript(path):
    """Last model name seen in the transcript. No $CLAUDE_MODEL env var exists."""
    found = None
    for obj in _iter_transcript(path):
        msg = obj.get("message") if isinstance(obj.get("message"), dict) else {}
        model = msg.get("model") or obj.get("model")
        if isinstance(model, str) and model:
            found = model
    return found


def last_assistant_text(path):
    """Fallback only: used if Stop didn't hand us last_assistant_message."""
    text = None
    for obj in _iter_transcript(path):
        if obj.get("type") != "assistant":
            continue
        msg = obj.get("message") if isinstance(obj.get("message"), dict) else {}
        content = msg.get("content")
        if isinstance(content, str):
            text = content
        elif isinstance(content, list):
            parts = [
                b.get("text", "")
                for b in content
                if isinstance(b, dict) and b.get("type") == "text"
            ]
            joined = "\n".join(p for p in parts if p).strip()
            if joined:
                text = joined
    return text


def log_path(root, session_id, create=True):
    logs = root / ".agent-logs"
    if create:
        logs.mkdir(parents=True, exist_ok=True)
    elif not logs.is_dir():
        return None
    existing = sorted(logs.glob("*_%s.md" % session_id))
    if existing:
        return existing[0]
    if not create:
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    return logs / ("%s_%s.md" % (stamp, session_id))


def read_doc(path):
    if not path.exists():
        return {}, ""
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_RE.match(text)
    if not match:
        return {}, text
    fm = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            fm[key.strip()] = value.strip()
    return fm, text[match.end():]


def last_response_covered_through(body):
    """Highest PROMPT num any logged RESPONSE already covers (0 if none)."""
    end = 0
    for match in RESPONSE_NUM_RE.finditer(body):
        end = int(match.group(2) or match.group(1))
    return end


def write_doc(path, fm, body):
    lines = ["---"]
    lines += ["%s: %s" % (k, fm[k]) for k in FM_ORDER if k in fm]
    lines += ["---", ""]
    tmp = path.with_suffix(".md.tmp")
    tmp.write_text("\n".join(lines) + body, encoding="utf-8")
    tmp.replace(path)


def main():
    # Read stdin as bytes and decode UTF-8 explicitly. sys.stdin.read()
    # uses the active code page on Windows (cp1252), which mangles any
    # non-ASCII character in the prompt or response.
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")
    data = json.loads(raw) if raw.strip() else {}

    event = data.get("hook_event_name")
    if event not in ("UserPromptSubmit", "Stop"):
        return

    session_id = data.get("session_id") or "unknown-session"
    short = session_id.split("-")[0]
    root = project_dir()
    project = PROJECT or root.name
    timestamp = now_iso()
    model = (
        model_from_transcript(data.get("transcript_path"))
        or os.environ.get("ANTHROPIC_MODEL")
        or "unknown"
    )

    if event == "UserPromptSubmit":
        kind = "PROMPT"
        text = data.get("prompt") or ""
        if text.lstrip().startswith(IGNORED_PROMPT_PREFIXES):
            return
    else:
        kind = "RESPONSE"
        text = (
            data.get("last_assistant_message")
            or last_assistant_text(data.get("transcript_path"))
            or "(no final assistant message was available to the hook)"
        )

    path = log_path(root, session_id, create=(kind == "PROMPT"))
    # A RESPONSE with no log file means its prompt was filtered out, so the
    # response belongs to an internal request and is dropped too.
    if path is None:
        return
    fm, body = read_doc(path)

    # On the first PROMPT of a session the transcript has no assistant
    # message yet, so model_from_transcript() can't resolve anything and
    # that entry gets logged as "model: unknown". By the following Stop the
    # transcript has it, so backfill that entry's line once it's known.
    if kind == "RESPONSE" and model != "unknown":
        marker = "\nmodel: unknown\n"
        idx = body.rfind(marker)
        if idx != -1:
            body = body[:idx] + "\nmodel: %s\n" % model + body[idx + len(marker):]

    if not fm:
        fm = {
            "session_id": session_id,
            "date": timestamp[:10],
            "author": AUTHOR,
            "model": model,
            "tool": TOOL,
            "project": project,
            "total_exchanges": "0",
            "first_prompt_time": timestamp,
            "last_prompt_time": timestamp,
        }
        body = (
            "\n# Session Log - %s\n\n"
            "Session: `%s` | Project: `%s` | Author: `%s`\n\n---\n\n"
            % (timestamp[:10], short, project, AUTHOR)
        )

    prompts = body.count("[LOG_ENTRY type=PROMPT ")
    if kind == "PROMPT":
        num = str(prompts + 1)
    else:
        # A Stop only fires once per turn, but a turn can carry several
        # mid-turn PROMPT hooks (injected user messages) before it - so one
        # RESPONSE can answer more than one logged PROMPT. Cover the whole
        # unanswered range ("4-6") instead of stamping just the last one and
        # leaving the earlier prompts in the batch looking unanswered.
        start = last_response_covered_through(body) + 1
        end = max(prompts, 1)
        if start > end:
            start = end
        num = str(end) if start == end else "%d-%d" % (start, end)

    body += (
        "[LOG_ENTRY type=%s num=%s session=%s]\ntimestamp: %s\nmodel: %s\n\n%s\n\n\n"
        % (kind, num, short, timestamp, model, text.rstrip("\n"))
    )

    fm["model"] = model
    fm["total_exchanges"] = str(body.count("[LOG_ENTRY type=PROMPT "))
    if kind == "PROMPT":
        fm["last_prompt_time"] = timestamp
    fm.setdefault("first_prompt_time", timestamp)

    write_doc(path, fm, body)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)