# pi-clear

A Pi coding-agent extension that makes `/clear` start a new empty session and remove the old active session file.

## Install

```bash
pi install git:github.com/ac5tin/pi-clear
```

Verified with Pi coding agent **v0.87.1**.

## Use

Run:

```text
/clear
```

Pi asks for confirmation. On **Yes**, the extension:

1. Starts a new empty session.
2. Preserves the old session display name.
3. Moves the old active `.jsonl` session file to trash when the `trash` command is available.
4. Falls back to permanent deletion when trash is unavailable or fails.

On **No**, the current session remains unchanged.

Only the active session file is targeted. Other saved sessions are not deleted. In non-interactive modes without UI support, `/clear` does nothing instead of deleting without confirmation.

## Review before installing

Pi extensions run inside the Pi process and have the operating-system permissions of Pi. Review this public source before installing it.
