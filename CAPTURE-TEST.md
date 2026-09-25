# Capture Test

Documents the prompt/response capture mechanism in this repo and records the canary test run.

## Mechanism

Configured in [.claude/settings.json](.claude/settings.json):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\" || py -3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\"",
            "shell": "bash",
            "timeout": 20,
            "statusMessage": "capturing prompt"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\" || py -3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.py\"",
            "shell": "bash",
            "timeout": 30,
            "statusMessage": "capturing response"
          }
        ]
      }
    ]
  }
}
```

Two interpreters, one command: `python3` is what exists on Linux and macOS, `py`
is the Windows Python launcher and exists nowhere else. The `||` is safe because
`capture.py` always exits 0 — the fallback therefore only ever runs when the
first interpreter could not be launched at all, and because nothing read stdin
in that case, the hook payload arrives at the fallback intact. `shell: "bash"`
is what makes `$CLAUDE_PROJECT_DIR` and `||` mean the same thing on Windows
(Git Bash) as on Linux; PowerShell would expand neither.

To check capture on a machine: send any prompt, then look for a file named after that session id in `.agent-logs/`. If one doesn't appear, run `python3 --version` and `py -3 --version` there — if neither exists, install Python; if the shell is the problem, put a machine-local override in `.claude/settings.local.json` (gitignored) with whichever interpreter does work.

[.claude/hooks/capture.py](.claude/hooks/capture.py) fires on two events:

- **UserPromptSubmit** — writes the prompt as a `PROMPT` log entry. Internal Claude Code background prompts (summaries, title generation) are filtered out via `IGNORED_PROMPT_PREFIXES` so they don't create junk session files, as are the `<task-notification>` injections a finished background command wakes the session with — nobody typed those, and counting them as exchanges inflates `total_exchanges` with tool chatter.
- **Stop** — writes the final assistant message as a `RESPONSE` log entry, falling back to scanning the transcript if `last_assistant_message` isn't provided.

One markdown file per session is written to `.agent-logs/`, named `<UTC timestamp>_<session_id>.md`, with YAML frontmatter (`session_id`, `date`, `author`, `model`, `tool`, `project`, `total_exchanges`, `first_prompt_time`, `last_prompt_time`) followed by `[LOG_ENTRY type=... num=... session=...]` blocks. The model is resolved from the transcript file; prompts logged before the transcript holds an assistant message read `model: unknown` and are backfilled once the next Stop resolves it. The hook reads stdin as UTF-8 explicitly (avoids Windows cp1252 mangling), never writes to stdout (stdout on UserPromptSubmit gets injected into Claude's context), and always exits 0 so a capture failure can't break a session.

## Canary entries (raw)

Two sessions were fired with the same test prompt: `CAPTURE TEST — 8x assignment, Kamran Siddique.`

### Session `b65366d6-3d37-41d8-b890-a72498111d51`

From [.agent-logs/2026-09-23_15-54-53_b65366d6-3d37-41d8-b890-a72498111d51.md](.agent-logs/2026-09-23_15-54-53_b65366d6-3d37-41d8-b890-a72498111d51.md):

```
[LOG_ENTRY type=PROMPT num=1 session=b65366d6]
timestamp: 2026-09-23T15:54:53.655Z
model: claude-sonnet-5

CAPTURE TEST — 8x assignment, Kamran Siddique.


[LOG_ENTRY type=RESPONSE num=1 session=b65366d6]
timestamp: 2026-09-23T15:54:57.707Z
model: claude-sonnet-5

Msg received: "CAPTURE TEST — 8x assignment, Kamran Siddique."

No task specified. What need?
```

### Session `95de188f-4bdc-4838-9f03-2c276ef6f99a`

From [.agent-logs/2026-09-23_15-56-20_95de188f-4bdc-4838-9f03-2c276ef6f99a.md](.agent-logs/2026-09-23_15-56-20_95de188f-4bdc-4838-9f03-2c276ef6f99a.md):

```
[LOG_ENTRY type=PROMPT num=1 session=95de188f]
timestamp: 2026-09-23T15:56:20.756Z
model: claude-sonnet-5

CAPTURE TEST — 8x assignment, Kamran Siddique.


[LOG_ENTRY type=RESPONSE num=1 session=95de188f]
timestamp: 2026-09-23T15:56:29.642Z
model: claude-sonnet-5

Unclear ask. "8x assignment" mean what exactly — run something 8 times, or assign 8 items? Give detail, proceed.
```

## What didn't work

**The hook was dead everywhere except Windows.** `command` was `py` with
`args: ["-3", ...]`, and `py` is the Windows Python launcher — it does not exist
on Linux or macOS. Every capture in `.agent-logs/` was written from Windows
(the transcripts still carry `C:\Users\...` paths); the first Claude Code on the
web session — a Linux container — produced no log file at all, because the hook
process failed to spawn (`py: command not found`, exit 127) before a line of
`capture.py` ran. The `always exits 0` defence in the script is irrelevant when
the interpreter itself is missing. Fixed by the two-interpreter command above.

Two things that were *not* wrong, having been checked against the current hooks
reference: the config shape (`command` + `args` is the documented exec form, and
`timeout`/`statusMessage` are real fields), and `Stop` supplying
`last_assistant_message` (it does, so the transcript scan really is just a
fallback).

**Only the last `model: unknown` got backfilled.** `body.rfind()` rewrote one
line, but a turn that carries injected mid-turn prompts logs several `PROMPT`
entries before the first `Stop` can resolve the model from the transcript, so
every entry except the last stayed `unknown` forever. Now a regex anchored to the
`[LOG_ENTRY ...]` / `timestamp:` / `model:` header rewrites all of them — anchored
so that a prompt whose own text quotes `model: unknown` (pasting one of these logs
back into a session) isn't rewritten along with it.

### Verified after the fix

Driving `capture.py` with synthetic hook payloads under `python3`:

- `UserPromptSubmit` then `Stop` → one file, `PROMPT` + `RESPONSE` entries, nothing on stdout, exit 0.
- Non-ASCII (em dash, emoji) survives the explicit UTF-8 stdin decode.
- Three prompts then one `Stop` → `num=1-3`, and all four entries carry the resolved model.
- An internal prompt (`Please write a 5-10 word title...`) → no file; its `Stop` is dropped too.
- Empty stdin, non-JSON stdin, and a `Stop` with no prior log file → exit 0, nothing written.
- With `python3` absent from `PATH`, the `|| py -3` fallback receives the full payload.
