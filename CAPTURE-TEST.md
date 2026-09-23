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
            "command": "py",
            "args": ["-3", "${CLAUDE_PROJECT_DIR}/.claude/hooks/capture.py"],
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
            "command": "py",
            "args": ["-3", "${CLAUDE_PROJECT_DIR}/.claude/hooks/capture.py"],
            "timeout": 30,
            "statusMessage": "capturing response"
          }
        ]
      }
    ]
  }
}
```

[.claude/hooks/capture.py](.claude/hooks/capture.py) fires on two events:

- **UserPromptSubmit** — writes the prompt as a `PROMPT` log entry. Internal Claude Code background prompts (summaries, title generation) are filtered out via `IGNORED_PROMPT_PREFIXES` so they don't create junk session files.
- **Stop** — writes the final assistant message as a `RESPONSE` log entry, falling back to scanning the transcript if `last_assistant_message` isn't provided.

One markdown file per session is written to `.agent-logs/`, named `<UTC timestamp>_<session_id>.md`, with YAML frontmatter (`session_id`, `date`, `author`, `model`, `tool`, `project`, `total_exchanges`, `first_prompt_time`, `last_prompt_time`) followed by `[LOG_ENTRY type=... num=... session=...]` blocks. The model is resolved from the transcript file; the first prompt of a session logs `model: unknown` and gets backfilled once the Stop event resolves it. The hook reads stdin as UTF-8 explicitly (avoids Windows cp1252 mangling), never writes to stdout (stdout on UserPromptSubmit gets injected into Claude's context), and always exits 0 so a capture failure can't break a session.

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

*(fill in)*
