import test from "node:test";
import assert from "node:assert/strict";
import { clearSession, deleteSessionFile, type ClearContext, type ClearDependencies } from "../extensions/clear.ts";

type Fixture = {
  ctx: ClearContext;
  deps: ClearDependencies;
  files: Set<string>;
  events: string[];
  prompts: { count: number };
  unlinks: string[];
  execCalls: Array<{ command: string; args: string[] }>;
  notifications: Array<{ message: string; type: string | undefined }>;
  names: string[];
  confirmations: Array<{ title: string; message: string }>;
};

function fixture(options: {
  hasUI?: boolean;
  confirm?: boolean;
  cancelled?: boolean;
  oldPath?: string;
  newPath?: string;
  replacementPathUndefined?: boolean;
  name?: string;
  files?: string[];
  directories?: string[];
} = {}): Fixture {
  const files = new Set(options.files ?? [options.oldPath ?? "/sessions/old.jsonl"]);
  const directories = new Set(options.directories ?? []);
  const events: string[] = [];
  const execCalls: Fixture["execCalls"] = [];
  const unlinks: string[] = [];
  const notifications: Fixture["notifications"] = [];
  const confirmations: Array<{ title: string; message: string }> = [];
  const names: string[] = [];
  const prompts = { count: 0 };

  const ctx: ClearContext = {
    hasUI: options.hasUI ?? true,
    ui: {
      async confirm(title, message) {
        prompts.count++;
        confirmations.push({ title, message });
        return options.confirm ?? true;
      },
      notify(message, type) {
        notifications.push({ message, type });
      },
    },
    sessionManager: {
      getSessionFile: () => options.oldPath ?? "/sessions/old.jsonl",
      getSessionName: () => options.name,
    },
    async newSession(sessionOptions) {
      assert.equal("parentSession" in sessionOptions, false);
      events.push("new-session-start");
      if (options.cancelled) return { cancelled: true };
      await sessionOptions.setup?.({
        appendSessionInfo(name) {
          names.push(name);
          events.push("name-written");
        },
      });
      await sessionOptions.withSession?.({
        sessionManager: {
          getSessionFile: () => options.replacementPathUndefined ? undefined : options.newPath ?? "/sessions/new.jsonl",
        },
      });
      events.push("new-session-finished");
      return { cancelled: false };
    },
  };

  const deps: ClearDependencies = {
    async exec(command, args) {
      execCalls.push({ command, args });
      events.push("trash");
      return { code: 0, stderr: "" };
    },
    async isFile(filePath) {
      return files.has(filePath);
    },
    exists(filePath) {
      return files.has(filePath) || directories.has(filePath);
    },
    async unlink(filePath) {
      unlinks.push(filePath);
      files.delete(filePath);
      events.push("unlink");
    },
  };

  return { ctx, deps, files, events, prompts, unlinks, execCalls, notifications, names, confirmations };
}

test("does nothing without UI", async () => {
  const f = fixture({ hasUI: false });
  await clearSession("ignored arguments", f.ctx, f.deps);
  assert.equal(f.prompts.count, 0);
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.execCalls, []);
  assert.deepEqual(f.unlinks, []);
});

test("does nothing when confirmation is declined", async () => {
  const f = fixture({ confirm: false });
  await clearSession("ignored arguments", f.ctx, f.deps);
  assert.equal(f.prompts.count, 1);
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.execCalls, []);
  assert.deepEqual(f.unlinks, []);
});

test("starts a new session, preserves the name, then trashes the old file", async () => {
  const f = fixture({ name: "Work" });
  await clearSession("ignored arguments", f.ctx, f.deps);
  assert.deepEqual(f.names, ["Work"]);
  assert.deepEqual(f.events, ["new-session-start", "name-written", "trash", "new-session-finished"]);
  assert.deepEqual(f.execCalls, [{ command: "trash", args: ["/sessions/old.jsonl"] }]);
  assert.deepEqual(f.unlinks, []);
  assert.deepEqual(f.confirmations, [{
    title: "Clear session?",
    message: "This starts a new session and deletes the current session file.",
  }]);
  assert.deepEqual(f.notifications, [{ message: "Session cleared.", type: "info" }]);
});

test("does not restore an empty name", async () => {
  const f = fixture({ name: "" });
  await clearSession("", f.ctx, f.deps);
  assert.deepEqual(f.names, []);
});

test("does not delete when new session creation is cancelled", async () => {
  const f = fixture({ name: "Work", cancelled: true });
  await clearSession("", f.ctx, f.deps);
  assert.deepEqual(f.events, ["new-session-start"]);
  assert.deepEqual(f.execCalls, []);
  assert.deepEqual(f.unlinks, []);
});

test("does not delete a directory, missing path, or non-JSONL path", async () => {
  const directory = fixture({ oldPath: "/sessions/data.jsonl", files: [], directories: ["/sessions/data.jsonl"] });
  await clearSession("", directory.ctx, directory.deps);
  assert.deepEqual(directory.execCalls, []);
  assert.deepEqual(directory.unlinks, []);

  const missing = fixture({ files: [] });
  await clearSession("", missing.ctx, missing.deps);
  assert.deepEqual(missing.execCalls, []);
  assert.deepEqual(missing.unlinks, []);

  const nonJsonl = fixture({ oldPath: "/sessions/old.txt", files: ["/sessions/old.txt"] });
  await clearSession("", nonJsonl.ctx, nonJsonl.deps);
  assert.deepEqual(nonJsonl.execCalls, []);
  assert.deepEqual(nonJsonl.unlinks, []);
});

test("does not delete when the replacement path is undefined", async () => {
  const f = fixture({ replacementPathUndefined: true });
  await clearSession("", f.ctx, f.deps);
  assert.deepEqual(f.execCalls, []);
  assert.deepEqual(f.unlinks, []);
});

test("does not delete when the replacement path is unchanged", async () => {
  const f = fixture({ oldPath: "/sessions/same.jsonl", newPath: "/sessions/same.jsonl" });
  await clearSession("", f.ctx, f.deps);
  assert.deepEqual(f.execCalls, []);
  assert.deepEqual(f.unlinks, []);
});

test("does not unlink after trash succeeds", async () => {
  const f = fixture();
  const result = await deleteSessionFile("/sessions/old.jsonl", f.deps);
  assert.deepEqual(result, { ok: true, method: "trash" });
  assert.deepEqual(f.unlinks, []);
});

test("falls back to unlink after trash fails while the file remains", async () => {
  const f = fixture();
  f.deps.exec = async (command, args) => {
    f.execCalls.push({ command, args });
    return { code: 1, stderr: "trash unavailable" };
  };
  const result = await deleteSessionFile("/sessions/old.jsonl", f.deps);
  assert.deepEqual(result, { ok: true, method: "unlink" });
  assert.deepEqual(f.unlinks, ["/sessions/old.jsonl"]);
});

test("treats a missing file after failed trash as successful", async () => {
  const f = fixture();
  f.deps.exec = async () => {
    f.files.delete("/sessions/old.jsonl");
    return { code: 1, stderr: "already removed" };
  };
  const result = await deleteSessionFile("/sessions/old.jsonl", f.deps);
  assert.deepEqual(result, { ok: true, method: "trash" });
  assert.deepEqual(f.unlinks, []);
});

test("passes -- before a dash-prefixed path", async () => {
  const f = fixture({ oldPath: "-old.jsonl", files: ["-old.jsonl"] });
  await deleteSessionFile("-old.jsonl", f.deps);
  assert.deepEqual(f.execCalls, [{ command: "trash", args: ["--", "-old.jsonl"] }]);
});

test("reports unlink failure while keeping the new session active", async () => {
  const f = fixture();
  f.deps.exec = async () => ({ code: 1, stderr: "trash failed" });
  f.deps.unlink = async () => {
    throw new Error("permission denied");
  };
  await clearSession("", f.ctx, f.deps);
  assert.deepEqual(f.events, ["new-session-start", "new-session-finished"]);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0]?.type, "error");
  assert.match(f.notifications[0]?.message ?? "", /\/sessions\/old\.jsonl/);
  assert.match(f.notifications[0]?.message ?? "", /permission denied/);
});
