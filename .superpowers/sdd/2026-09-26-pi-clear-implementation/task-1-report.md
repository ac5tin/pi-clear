# Task 1 Fix Report

## RED

Command:

```text
cd /home/ser6pro/Documents/projects/personal/pi-clear/.worktrees/pi-clear-implementation && npm test -- --test-name-pattern='does not delete when the replacement path is undefined'
```

Output summary:

```text
✖ does not delete when the replacement path is undefined
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected
+ [ { args: [ '/sessions/old.jsonl' ], command: 'trash' } ]
- []

ℹ tests 13
ℹ pass 12
ℹ fail 1
```

The regression reached the assertion after adding the missing `confirmations` field to the test `Fixture` type. It failed because production called `trash` when the replacement path was undefined.

## GREEN

Command:

```text
cd /home/ser6pro/Documents/projects/personal/pi-clear/.worktrees/pi-clear-implementation && npm test
```

Output:

```text
ℹ tests 13
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

## Files changed

- `test/clear.test.ts`
  - Added `confirmations` to the `Fixture` type.
- `extensions/clear.ts`
  - Changed the deletion guard to reject an undefined replacement path:
    `if (!oldPath || !newPath || oldPath === newPath)`.

## Self-review

- The fix is limited to the requested fixture type and production guard.
- The existing regression test now proves that `trash` and `unlink` are not called when the replacement path is undefined.
- No README, package manifest, documentation, or existing commit was changed.
- Full test suite passes: 13 tests, 0 failures.
