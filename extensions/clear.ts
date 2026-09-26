import { existsSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export interface ClearDependencies {
  exec(command: string, args: string[]): Promise<{ code: number; stderr: string }>;
  isFile(filePath: string): Promise<boolean>;
  exists(filePath: string): boolean;
  unlink(filePath: string): Promise<void>;
}

export interface ClearContext {
  hasUI: boolean;
  ui: {
    confirm(title: string, message: string): Promise<boolean>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
  sessionManager: {
    getSessionFile(): string | undefined;
    getSessionName(): string | undefined;
  };
  newSession(options: {
    setup?: (sessionManager: { appendSessionInfo(name: string): void }) => Promise<void> | void;
    withSession?: (ctx: { sessionManager: { getSessionFile(): string | undefined } }) => Promise<void> | void;
  }): Promise<{ cancelled: boolean }>;
}

export type DeleteResult =
  | { ok: true; method: "trash" | "unlink" }
  | { ok: false; error: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function deleteSessionFile(filePath: string, deps: ClearDependencies): Promise<DeleteResult> {
  if (!filePath.endsWith(".jsonl") || !(await deps.isFile(filePath))) {
    return { ok: false, error: "path is not an existing JSONL file" };
  }

  const trashArgs = filePath.startsWith("-") ? ["--", filePath] : [filePath];
  let trashResult: { code: number; stderr: string };
  try {
    trashResult = await deps.exec("trash", trashArgs);
  } catch (error) {
    trashResult = { code: 1, stderr: errorText(error) };
  }

  if (trashResult.code === 0 || !deps.exists(filePath)) {
    return { ok: true, method: "trash" };
  }

  try {
    await deps.unlink(filePath);
    return { ok: true, method: "unlink" };
  } catch (error) {
    const details = errorText(error);
    const trashError = trashResult.stderr.trim();
    return {
      ok: false,
      error: trashError ? `${details} (trash: ${trashError})` : details,
    };
  }
}

export async function clearSession(args: string, ctx: ClearContext, deps: ClearDependencies): Promise<void> {
  void args;
  if (!ctx.hasUI) return;

  const confirmed = await ctx.ui.confirm(
    "Clear session?",
    "This starts a new session and deletes the current session file.",
  );
  if (!confirmed) return;

  const oldPath = ctx.sessionManager.getSessionFile();
  const oldName = ctx.sessionManager.getSessionName();

  await ctx.newSession({
    setup: oldName ? (sessionManager) => sessionManager.appendSessionInfo(oldName) : undefined,
    withSession: async (newCtx) => {
      const newPath = newCtx.sessionManager.getSessionFile();
      if (!oldPath || !newPath || oldPath === newPath) {
        ctx.ui.notify("Session cleared.", "info");
        return;
      }

      const result = await deleteSessionFile(oldPath, deps);
      if (result.ok) {
        ctx.ui.notify("Session cleared.", "info");
      } else {
        ctx.ui.notify(
          `New session started, but could not delete ${oldPath}: ${result.error}`,
          "error",
        );
      }
    },
  });
}

export default function (pi: ExtensionAPI) {
  const deps: ClearDependencies = {
    exec: (command, args) => pi.exec(command, args),
    isFile: async (filePath) => {
      try {
        return (await stat(filePath)).isFile();
      } catch {
        return false;
      }
    },
    exists: existsSync,
    unlink,
  };

  pi.registerCommand("clear", {
    description: "Start a new session and delete the current session file",
    handler: (args, ctx) => clearSession(args, ctx, deps),
  });
}
