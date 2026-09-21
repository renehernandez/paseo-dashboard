import { describe, expect, it, vi } from "vitest";
import type { DashboardAgent } from "./dashboard-model";
import { type DashboardPaseo, DirectoryStore } from "./directory-store";

function agent(id: string, workspaceId = "workspace"): DashboardAgent {
  return {
    id,
    workspaceId,
    provider: "codex",
    model: null,
    title: id,
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastUserMessageAt: null,
    pendingPermissions: [],
    labels: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("DirectoryStore", () => {
  it("reconciles updates received while the initial snapshot is loading", async () => {
    const firstPage = deferred<unknown>();
    let update: ((value: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const paseo = {
      agents: {
        list: vi.fn(() => firstPage.promise),
        subscribe: vi.fn((handler: (value: unknown) => void) => {
          update = handler;
          return unsubscribe;
        }),
      },
    } as unknown as DashboardPaseo;
    const store = new DirectoryStore(paseo, "workspace");
    const stop = store.start();

    update?.({ kind: "upsert", agent: agent("live") });
    firstPage.resolve({
      entries: [{ agent: agent("snapshot") }, { agent: agent("other", "other-workspace") }],
      pageInfo: { nextCursor: null },
    });
    await firstPage.promise;
    await Promise.resolve();

    expect(store.getSnapshot()).toMatchObject({ status: "ready", error: null });
    expect(store.getSnapshot().agents.map(({ id }) => id).sort()).toEqual(["live", "snapshot"]);

    update?.({ kind: "remove", agentId: "snapshot" });
    expect(store.getSnapshot().agents.map(({ id }) => id)).toEqual(["live"]);

    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("releases the previous subscription when restarted and preserves data on failure", async () => {
    const releases = [vi.fn(), vi.fn()];
    let call = 0;
    const paseo = {
      agents: {
        list: vi
          .fn()
          .mockResolvedValueOnce({ entries: [{ agent: agent("existing") }], pageInfo: {} })
          .mockRejectedValueOnce(new Error("connection lost")),
        subscribe: vi.fn(() => releases[call++]!),
      },
    } as unknown as DashboardPaseo;
    const store = new DirectoryStore(paseo, "workspace");

    const cleanup = store.start();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("ready"));
    store.start();
    await vi.waitFor(() => expect(store.getSnapshot().status).toBe("error"));

    expect(releases[0]).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toMatchObject({
      status: "error",
      error: "connection lost",
    });
    expect(store.getSnapshot().agents.map(({ id }) => id)).toEqual(["existing"]);

    cleanup();
    expect(releases[1]).toHaveBeenCalledOnce();
  });
});
